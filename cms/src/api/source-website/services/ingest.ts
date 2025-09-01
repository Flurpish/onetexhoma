// cms/src/api/source-website/services/ingest.ts
import type { Core } from '@strapi/strapi';
import * as cheerio from 'cheerio';
import type { Cheerio as CheerioCollection, CheerioAPI } from 'cheerio';

type RawProduct = {
  title?: string;
  description?: string;
  image?: string;
  price?: number | string | null;
  currency?: string;
  sourceUrl: string;
  businessDocumentId: string | number;
  raw?: any;
};

type SourceWebsite = {
  id: number;
  baseUrl: string;
  entryPaths?: string[] | null;
  mode?: 'auto_schema' | 'auto_heuristic' | 'rules_css' | string | null;
  rules?: any;
  headers?: Record<string, string> | null;
  respectRobotsTxt?: boolean | null;
  business?: { id: number };
};

// ---------- helpers ----------
const DEFAULT_UA =
  process.env.INGEST_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT_MS = Number(process.env.INGEST_TIMEOUT_MS || 20000);

function joinUrl(base: string, path: string) {
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const cleanBase = base.endsWith('/') ? base : base + '/';
  const cleanPath = String(path || '').replace(/^\//, '');
  return new URL(cleanPath, cleanBase).toString();
}

async function loadHtml(url: string, headers?: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        // Browser-like headers help WAFs / SSR splitters return hydrated HTML
        'user-agent': DEFAULT_UA,
        'accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        ...(headers || {}),
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Fetch ${url} -> ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function first<T>(v: T | T[] | undefined | null): T | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function toNumber(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[, ]/g, '').replace(/[$€£]/g, '');
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// ---------- JSON-LD extraction ----------
function extractJsonLdProducts($: CheerioAPI, businessDocumentId: string | number, pageUrl: string): RawProduct[] {
  const out: RawProduct[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).text().trim();
    if (!txt) return;

    const nodes: any[] = [];
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) nodes.push(...parsed);
      else nodes.push(parsed);
    } catch {
      return;
    }

    const pushProduct = (node: any) => {
      const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      const isProduct = type?.includes('Product') || type?.includes('MenuItem');
      if (!isProduct) return;

      const offer = node.offers || {};
      const image = first(node.image) || (typeof node.image === 'object' ? node.image?.url : undefined);
      out.push({
        title: node.name || node.title,
        description: node.description,
        price: offer.price || node.price || offer.lowPrice,
        currency: offer.priceCurrency || node.priceCurrency,
        image,
        sourceUrl: pageUrl,
        businessDocumentId,
        raw: { jsonld: node },
      });
    };

    for (const n of nodes) {
      if (!n) continue;
      const t = n['@type'];
      if (t === 'ItemList' && Array.isArray(n.itemListElement)) {
        for (const li of n.itemListElement) {
          const item = li.item || li;
          if (item) pushProduct(item);
        }
      } else {
        pushProduct(n);
      }
    }
  });

  return out.filter(p => p.title);
}

// ---------- META fallback ----------
function extractMetaProducts($: CheerioAPI, businessDocumentId: string | number, pageUrl: string): RawProduct[] {
  const ogTitle =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text().trim();
  const ogDesc =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    $('meta[name="twitter:description"]').attr('content') || '';
  const ogImg =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content');

  if (!ogTitle) return [];
  return [{
    title: ogTitle,
    description: ogDesc,
    image: ogImg,
    sourceUrl: pageUrl,
    businessDocumentId,
    raw: { meta: true },
  }];
}

// ---------- Inline JSON extractor ----------
function tryParseJSON(txt: string): any | undefined {
  const trimmed = txt.trim().replace(/;$/, '');
  try { return JSON.parse(trimmed); } catch { return undefined; }
}

function* walk(obj: any, path: string[] = []): Generator<{ path: string[]; value: any }> {
  if (obj && typeof obj === 'object') {
    yield { path, value: obj };
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) yield* walk(obj[i], path.concat(String(i)));
    } else {
      for (const [k, v] of Object.entries(obj)) yield* walk(v, path.concat(k));
    }
  }
}

function looksLikeProduct(o: any): boolean {
  if (!o || typeof o !== 'object') return false;
  const title = o.name || o.title || o.label;
  const price =
    o.price ??
    o.amount ??
    o.priceMoney?.amount ??
    o.priceInfo?.price ??
    o.pricing?.price ??
    o.basePrice ??
    o.unitPrice ??
    undefined;
  const hasPriceishKey = /\$|price|amount|cost/i.test(JSON.stringify(o));
  return Boolean(title) && (price != null || hasPriceishKey);
}

function extractInlineJSONProducts($: CheerioAPI, businessDocumentId: string | number, pageUrl: string): RawProduct[] {
  const out: RawProduct[] = [];

  $('script').each((_, el) => {
    const txt = ($(el).text() || '').trim();
    if (!txt) return;

    // Pattern 1: assignment to global vars (NEXT/NUXT/etc.)
    const assignPatterns = [
      /(?:__NEXT_DATA__|__NUXT__|__INITIAL_STATE__|__PRELOADED_STATE__|INITIAL_STATE|preloadedState|window\.[A-Za-z_.$]+)\s*=\s*(\{[\s\S]*\})/m,
    ];
    for (const rx of assignPatterns) {
      const m = txt.match(rx);
      if (m) {
        const json = tryParseJSON(m[1]);
        if (json) {
          for (const { value } of walk(json)) {
            if (looksLikeProduct(value)) {
              const title = value.name || value.title || value.label;
              const price =
                value.price ??
                value.amount ??
                value.priceMoney?.amount ??
                value.priceInfo?.price ??
                value.pricing?.price ??
                value.basePrice ??
                value.unitPrice;
              const currency = value.currency || value.priceMoney?.currency || value.priceInfo?.currency || 'USD';
              const image = value.image || value.imageUrl || value.img || value.photo?.url || value.media?.url;
              out.push({
                title,
                description: value.description || value.desc || '',
                price,
                currency,
                image,
                sourceUrl: pageUrl,
                businessDocumentId,
                raw: { inline: value },
              });
            }
          }
        }
      }
    }

    // Pattern 2: script content is pure JSON
    if (/^\s*\{[\s\S]*\}\s*$/.test(txt) || /^\s*\[[\s\S]*\]\s*$/.test(txt)) {
      const json = tryParseJSON(txt);
      if (json) {
        for (const { value } of walk(json)) {
          if (looksLikeProduct(value)) {
            const title = value.name || value.title || value.label;
            const price =
              value.price ??
              value.amount ??
              value.priceMoney?.amount ??
              value.priceInfo?.price ??
              value.pricing?.price ??
              value.basePrice ??
              value.unitPrice;
            const currency = value.currency || value.priceMoney?.currency || value.priceInfo?.currency || 'USD';
            const image = value.image || value.imageUrl || value.img || value.photo?.url || value.media?.url;
            out.push({
              title,
              description: value.description || value.desc || '',
              price,
              currency,
              image,
              sourceUrl: pageUrl,
              businessDocumentId,
              raw: { inline: value },
            });
          }
        }
      }
    }
  });

  return out.filter(p => p.title);
}

// ---------- CSS rules extractor (supports 'list', 'img@src') ----------
type CssRules = {
  list?: string;
  items?: string;
  image?: string;      // 'selector@attr' supported
  imageAttr?: string;  // default attr if not embedded in 'image'
  price?: string;
  title?: string;
  description?: string;
  currency?: string;
  render?: { force?: boolean }; // accepted, ignored (no browser)
};

function pickFirstText($root: CheerioCollection<any>, selectors?: string): string {
  if (!selectors) return '';
  for (const sel of selectors.split(',').map(s => s.trim()).filter(Boolean)) {
    const el = sel === ':self' ? $root : $root.find(sel).first();
    const t = el.text().trim();
    if (t) return t;
  }
  return '';
}

function pickFirstAttr($root: CheerioCollection<any>, selector: string, fallbackAttr = 'src'): string {
  // allow 'sel@attr' inline
  let sel = selector;
  let attr = fallbackAttr;
  const at = selector.indexOf('@');
  if (at > -1) {
    sel = selector.slice(0, at);
    attr = selector.slice(at + 1) || fallbackAttr;
  }
  const el = sel === ':self' ? $root : $root.find(sel).first();
  const val = el.attr(attr);
  return (val || '').trim();
}

function extractByCssRules($: CheerioAPI, rules: CssRules | undefined, businessDocumentId: string | number, pageUrl: string): RawProduct[] {
  if (!rules) return [];
  const listSel = (rules.items || rules.list || '').trim();
  if (!listSel) return [];

  const out: RawProduct[] = [];
  $(listSel).each((_, node) => {
    const root = $(node);
    const title = pickFirstText(root, rules.title || 'h3,h4,.title,.name,[data-testid="item-name"]');
    if (!title) return;

    const description = pickFirstText(root, rules.description || '.description,.desc,[data-testid="item-description"]');
    const priceText = pickFirstText(root, rules.price || '.price,[data-testid="item-price"]');
    const price = toNumber(priceText);
    const image = rules.image ? pickFirstAttr(root, rules.image, rules.imageAttr || 'src') : '';

    out.push({
      title,
      description,
      price,
      currency: rules.currency || undefined,
      image,
      sourceUrl: pageUrl,
      businessDocumentId,
      raw: { css: true },
    });
  });

  return out;
}

// ---------- host-aware path fallbacks ----------
function withHostFallbacks(baseUrl: string, entryPaths: string[]): string[] {
  try {
    const u = new URL(baseUrl);
    const host = u.hostname.toLowerCase();

    // If user only provided "", try common SkyTab menu routes too.
    const onlyRoot = entryPaths.length === 1 && (!entryPaths[0] || entryPaths[0] === '');
    if (host === 'online.skytab.com' && onlyRoot) {
      return ['', 'order-settings', 'order'];
    }
  } catch {
    // ignore URL parse errors; just return given paths
  }
  return entryPaths;
}

// ---------- service ----------
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async ingestAll(opts?: { onlyId?: number }) {
    const filterId = opts?.onlyId;

    // Important: no 'documentId' here — it's not an attribute in v5 types.
    const resp = await strapi.entityService.findMany('api::source-website.source-website', {
      filters: {
        ingestStatus: 'active',
        ...(filterId ? { id: filterId } : {}),
      },
      fields: ['id', 'baseUrl', 'entryPaths', 'mode', 'rules', 'headers', 'respectRobotsTxt'],
      populate: { business: { fields: ['id'] } },
      limit: 100,
    }) as unknown;

    const srcs: SourceWebsite[] = Array.isArray(resp) ? (resp as SourceWebsite[]) : [];
    strapi.log.info(`[ingest:internal] sources=${srcs.length} filter=${filterId ? 1 : 0}`);

    let total = 0;
    let upserts = 0;

    for (const src of srcs) {
      const biz = src.business;
      if (!biz?.id) {
        strapi.log.warn(`[ingest:internal] source #${src.id} missing business relation; skipping`);
        continue;
      }
      const businessId: number = biz.id;
      const bizDocId: string = String(biz.id);

      const originalPaths: string[] = Array.isArray(src.entryPaths) && src.entryPaths.length ? (src.entryPaths as string[]) : [''];
      const entryPaths = withHostFallbacks(src.baseUrl, originalPaths);

      strapi.log.info(`[ingest:internal] #${src.id} ${src.baseUrl} paths=${JSON.stringify(entryPaths)}`);

      for (const p of entryPaths) {
        const url = joinUrl(src.baseUrl, p || '');
        let html = '';
        try {
          html = await loadHtml(url, (src.headers || undefined) as any);
        } catch (e: any) {
          strapi.log.warn(`[ingest:internal] fetch failed ${url}: ${e.message}`);
          continue;
        }

        const $ = cheerio.load(html);

        const A = extractJsonLdProducts($, bizDocId, url);
        const B = extractInlineJSONProducts($, bizDocId, url);
        const C = extractMetaProducts($, bizDocId, url);
        const D = src.rules || src.mode === 'rules_css' ? extractByCssRules($, src.rules as any, bizDocId, url) : [];

        const raw = [...A, ...B, ...C, ...D].filter(Boolean);
        strapi.log.info(`[ingest:internal] extract jsonld=${A.length} inline=${B.length} meta=${C.length} rules=${D.length} → total=${raw.length} @ ${url}`);
        total += raw.length;

        for (const r of raw) {
          const data: any = {
            title: r.title!,
            description: r.description || '',
            price: toNumber(r.price),
            currency: r.currency || 'USD',
            sourceUrl: r.sourceUrl,
            primaryCategory: null,
            autoImported: true,
            sourceSnapshot: r.raw || {},
            business: businessId,
          };

          // upsert by (title, business)
          const existing = await strapi.db.query('api::product.product').findOne({
            where: { title: data.title, business: { id: businessId } },
            select: ['id'],
          });

          if (existing?.id) {
            await strapi.entityService.update('api::product.product', existing.id, { data });
          } else {
            await strapi.entityService.create('api::product.product', { data });
          }
          upserts += 1;
        }
      }
    }

    strapi.log.info(`[ingest:internal] done total=${total} upserts=${upserts}`);
    return { ok: true, total, upserts };
  },
});
