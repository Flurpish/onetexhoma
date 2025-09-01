// cms/src/api/source-website/services/ingest.ts
import type { Core } from '@strapi/strapi';
import * as cheerio from 'cheerio';
import type { Cheerio as CheerioCollection, CheerioAPI } from 'cheerio';

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────
type RawProduct = {
  title?: string;
  description?: string;
  image?: string | null;
  price?: number | string | null;
  currency?: string;
  sourceUrl: string;                 // page we scraped
  productUrl?: string | null;        // direct/permalink or same-page #anchor
  productImageUrl?: string | null;   // absolute img URL if present
  businessDocumentId: string | number;
  raw?: any;                         // { jsonld } | { inline } | { css: true } | { meta: true }
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

type CssRules = {
  list?: string;
  items?: string;
  image?: string;       // selector@attr, e.g. "img@src"
  imageAttr?: string;
  price?: string;
  title?: string;
  description?: string;
  currency?: string;
  render?: { force?: boolean };
};

// ───────────────────────────────────────────────────────────────────────────────
// Config / helpers
// ───────────────────────────────────────────────────────────────────────────────
const DEFAULT_UA =
  process.env.INGEST_UA ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT_MS = Number(process.env.INGEST_TIMEOUT_MS || 20000);

const ACCEPT_DOC =
  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

function joinUrl(base: string, path: string) {
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  const cleanBase = base.endsWith('/') ? base : base + '/';
  const cleanPath = String(path || '').replace(/^\//, '');
  return new URL(cleanPath, cleanBase).toString();
}

/** Resolve a possibly-relative URL against a page URL. */
function absUrl(pageUrl: string, maybe: string | undefined | null): string | null {
  if (!maybe) return null;
  try {
    return new URL(maybe, pageUrl).toString();
  } catch {
    return String(maybe);
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

function cleanText(s?: string | null): string {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

function isBlankTitle(t?: string | null): boolean {
  if (!t) return true;
  const x = cleanText(t);
  if (!x) return true;
  if (/^untitled$/i.test(x)) return true;
  return false;
}

function slugify(s: string) {
  return cleanText(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ───────────────────────────────────────────────────────────────────────────────
// Fetchers: plain fetch (no JS) and Browserless (with JS)
// ───────────────────────────────────────────────────────────────────────────────
async function loadHtmlFetch(url: string, headers?: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': DEFAULT_UA,
        'accept': ACCEPT_DOC,
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

function normalizeWsEndpoint(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  let out = raw.trim();

  try {
    const u = new URL(out);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      out = u.toString();
    }
    const hasToken = u.searchParams.has('token');
    if (!hasToken && process.env.BROWSERLESS_TOKEN) {
      u.searchParams.set('token', process.env.BROWSERLESS_TOKEN);
      out = u.toString();
    }
  } catch {
    if (/^https?:\/\//i.test(out)) out = out.replace(/^http/i, 'ws');
  }

  return out;
}

function getBrowserlessWSEndpoint(): string | null {
  const direct = normalizeWsEndpoint(
    process.env.BROWSERLESS_WS || process.env.BROWSERLESS_URL || null
  );
  if (direct) return direct;

  const token = process.env.BROWSERLESS_TOKEN;
  if (token) return `wss://chrome.browserless.io?token=${token}`;

  return null;
}

function hostForLog(urlStr: string) {
  try { return new URL(urlStr).host; } catch { return urlStr; }
}

async function loadHtmlBrowserless(
  url: string,
  headers?: Record<string, string>,
  waitSelector?: string
) {
  const ws = getBrowserlessWSEndpoint();
  if (!ws) throw new Error('Browserless not configured: set BROWSERLESS_WS (wss://...) or BROWSERLESS_TOKEN');

  // dynamic import so local dev without the dep doesn’t explode
  const mod: any = await import('puppeteer-core');
  const puppeteer = mod.default || mod;

  let browser: any;
  let page: any;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: ws });
  } catch (e: any) {
    const h = hostForLog(ws);
    const msg = String(e?.message || e);
    throw new Error(
      `Browserless connect failed (${h}): ${msg}. ` +
      `Hint: ensure protocol is wss:// and a valid token is present.`
    );
  }

  try {
    page = await browser.newPage();
    await page.setUserAgent(DEFAULT_UA);
    await page.setExtraHTTPHeaders({
      'Accept': ACCEPT_DOC,
      'Accept-Language': 'en-US,en;q=0.9',
      ...(headers || {}),
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS });

    if (waitSelector) {
      try {
        await page.waitForSelector(waitSelector, { timeout: Math.max(5000, TIMEOUT_MS / 2) });
      } catch { /* ignore */ }
    }

    const html = await page.content();
    return html;
  } finally {
    try { await page?.close(); } catch {}
    try { await browser?.disconnect(); } catch {}
  }
}

/** Decide how to load HTML for a given source/path */
async function loadHtmlSmart(
  url: string,
  rules: CssRules | undefined,
  headers?: Record<string, string>,
  logger?: { warn: (msg: string) => void }
) {
  const forceRender = rules?.render?.force === true;
  if (forceRender) {
    try {
      return await loadHtmlBrowserless(url, headers, (rules?.items || rules?.list || '').trim() || undefined);
    } catch (e: any) {
      logger?.warn?.(
        `[ingest:browserless] ${String(e?.message || e)} — falling back to basic fetch for ${url}`
      );
      return await loadHtmlFetch(url, headers);
    }
  }
  return await loadHtmlFetch(url, headers);
}

// ───────────────────────────────────────────────────────────────────────────────
// Extractors (JSON-LD, Inline JSON, META, CSS rules)
// ───────────────────────────────────────────────────────────────────────────────
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
      const rawImage =
        first(node.image) || (typeof node.image === 'object' ? node.image?.url : undefined);
      const image = absUrl(pageUrl, rawImage);

      // Prefer "url" if present; otherwise fall back to page with #id if @id is a hash; else pageUrl
      const rawUrl =
        node.url ||
        (typeof node['@id'] === 'string' && node['@id'].startsWith('#') ? pageUrl + node['@id'] : undefined);
      const productUrl = absUrl(pageUrl, rawUrl) || pageUrl;

      out.push({
        title: node.name || node.title,
        description: node.description,
        price: offer.price || node.price || offer.lowPrice,
        currency: offer.priceCurrency || node.priceCurrency,
        image,
        productImageUrl: image || null,
        productUrl,
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

  const image = absUrl(pageUrl, ogImg);

  if (!ogTitle) return [];
  return [{
    title: ogTitle,
    description: ogDesc,
    image,
    productImageUrl: image || null,
    productUrl: pageUrl, // META is page-scoped; treat page as the product location
    sourceUrl: pageUrl,
    businessDocumentId,
    raw: { meta: true },
  }];
}

function tryParseJSON(txt: string): any | undefined {
  const trimmed = txt.trim().replace(/;$/, '');
  try { return JSON.parse(trimmed); } catch { return undefined; }
}

function* walk(obj: any, path: string[] = []) {
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

    // 1) assignment patterns (__NEXT_DATA__, __NUXT__, etc.)
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
              const rawImg =
                value.image || value.imageUrl || value.img || value.photo?.url || value.media?.url;
              const image = absUrl(pageUrl, rawImg);

              const rawUrl =
                value.url || value.permalink || value.link || value.productUrl || value.href;
              const productUrl = absUrl(pageUrl, rawUrl) || pageUrl;

              out.push({
                title: value.name || value.title || value.label,
                description: value.description || value.desc || '',
                price:
                  value.price ??
                  value.amount ??
                  value.priceMoney?.amount ??
                  value.priceInfo?.price ??
                  value.pricing?.price ??
                  value.basePrice ??
                  value.unitPrice,
                currency: value.currency || value.priceMoney?.currency || value.priceInfo?.currency || 'USD',
                image,
                productImageUrl: image || null,
                productUrl,
                sourceUrl: pageUrl,
                businessDocumentId,
                raw: { inline: value },
              });
            }
          }
        }
      }
    }

    // 2) pure JSON blocks
    if (/^\s*\{[\s\S]*\}\s*$/.test(txt) || /^\s*\[[\s\S]*\]\s*$/.test(txt)) {
      const json = tryParseJSON(txt);
      if (json) {
        for (const { value } of walk(json)) {
          if (looksLikeProduct(value)) {
            const rawImg =
              value.image || value.imageUrl || value.img || value.photo?.url || value.media?.url;
            const image = absUrl(pageUrl, rawImg);

            const rawUrl =
              value.url || value.permalink || value.link || value.productUrl || value.href;
            const productUrl = absUrl(pageUrl, rawUrl) || pageUrl;

            out.push({
              title: value.name || value.title || value.label,
              description: value.description || value.desc || '',
              price:
                value.price ??
                value.amount ??
                value.priceMoney?.amount ??
                value.priceInfo?.price ??
                value.pricing?.price ??
                value.basePrice ??
                value.unitPrice,
              currency: value.currency || value.priceMoney?.currency || value.priceInfo?.currency || 'USD',
              image,
              productImageUrl: image || null,
              productUrl,
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

function pickFirstText($root: CheerioCollection<any>, selectors?: string): string {
  if (!selectors) return '';
  for (const sel of (selectors || '').split(',').map(s => s.trim()).filter(Boolean)) {
    const el = sel === ':self' ? $root : $root.find(sel).first();
    const t = el.text().trim();
    if (t) return t;
  }
  return '';
}

function pickFirstAttr($root: CheerioCollection<any>, selector: string, fallbackAttr = 'src'): string {
  // allow 'selector@attr' inline
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

function pickProductLink($: CheerioAPI, root: CheerioCollection<any>, pageUrl: string, title: string): string | null {
  // 1) Prefer a non-hash link inside the item
  const a = root.find('a[href]').filter((_, el) => {
    const href = String($(el).attr('href') || '').trim();
    if (!href) return false;
    if (/^(javascript:|mailto:|tel:)/i.test(href)) return false;
    if (href === '#' || href === '') return false;
    if (/^#/.test(href)) return false; // handle anchors later
    return true;
  }).first();
  if (a.length) {
    return absUrl(pageUrl, a.attr('href')) || null;
  }

  // 2) Same-page anchor: use element id if present
  const id = root.attr('id') || root.find('[id]').first().attr('id');
  if (id) return `${pageUrl}#${id}`;

  // 3) Slug from title if an element with that id exists on the page
  const slug = slugify(title);
  if (slug && $(`#${slug}`).length) return `${pageUrl}#${slug}`;

  // 4) Last resort: take a hash link inside the item
  const hash = root.find('a[href^="#"]').first().attr('href');
  if (hash) return `${pageUrl}${hash}`;

  // 5) Fallback to page URL
  return pageUrl;
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

    const rawImg = rules.image
      ? pickFirstAttr(root, rules.image, rules.imageAttr || 'src')
      : (root.find('img').attr('src') || '');
    const imageAbs = absUrl(pageUrl, rawImg);

    const productUrl = pickProductLink($, root, pageUrl, title);

    out.push({
      title,
      description,
      price,
      currency: rules.currency || undefined,
      image: imageAbs,
      productImageUrl: imageAbs || null,
      productUrl,
      sourceUrl: pageUrl,
      businessDocumentId,
      raw: { css: true },
    });
  });

  return out;
}

// ───────────────────────────────────────────────────────────────────────────────
// Validation / Deduping
// ───────────────────────────────────────────────────────────────────────────────
function isMetaOnly(r: RawProduct): boolean {
  return !!(r.raw && r.raw.meta);
}

function hasStructuredOrigin(r: RawProduct): boolean {
  return !!(r.raw?.jsonld || r.raw?.inline || r.raw?.css);
}

function productValidatorFactory(pageTitle?: string, siteName?: string) {
  const pTitle = cleanText(pageTitle || '');
  const sName = cleanText(siteName || '');

  return (r: RawProduct): boolean => {
    const t = cleanText(r.title || '');

    if (isBlankTitle(t)) return false;
    if (pTitle && t.toLowerCase() === pTitle.toLowerCase()) return false;
    if (sName && t.toLowerCase() === sName.toLowerCase()) return false;

    // Drop META-only items unless they have a numeric price
    if (isMetaOnly(r)) {
      const price = toNumber(r.price);
      if (price == null) return false;
    }

    // Otherwise allow only if coming from structured origins
    if (!hasStructuredOrigin(r)) return false;

    return true;
  };
}

function dedupePreferRicher(items: RawProduct[]): RawProduct[] {
  // Prefer entries that have a price or an image/url when titles collide
  const map = new Map<string, RawProduct>();
  for (const r of items) {
    const key = cleanText(r.title || '').toLowerCase();
    if (!key) continue;

    const prev = map.get(key);
    if (!prev) { map.set(key, r); continue; }

    const prevScore =
      (toNumber(prev.price) != null ? 2 : 0) +
      (prev.productImageUrl ? 1 : 0) +
      (prev.productUrl && prev.productUrl !== prev.sourceUrl ? 1 : 0) +
      (prev.raw?.jsonld ? 1 : 0) +
      (prev.raw?.inline ? 1 : 0) +
      (prev.raw?.css ? 1 : 0);

    const curScore =
      (toNumber(r.price) != null ? 2 : 0) +
      (r.productImageUrl ? 1 : 0) +
      (r.productUrl && r.productUrl !== r.sourceUrl ? 1 : 0) +
      (r.raw?.jsonld ? 1 : 0) +
      (r.raw?.inline ? 1 : 0) +
      (r.raw?.css ? 1 : 0);

    if (curScore > prevScore) map.set(key, r);
  }
  return Array.from(map.values());
}

// ───────────────────────────────────────────────────────────────────────────────
// Service
// ───────────────────────────────────────────────────────────────────────────────
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async ingestAll(opts?: { onlyId?: number }) {
    const filterId = opts?.onlyId;

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

    let totalExtracted = 0;
    let totalKept = 0;
    let upserts = 0;

    for (const src of srcs) {
      const biz = src.business;
      if (!biz?.id) {
        strapi.log.warn(`[ingest:internal] source #${src.id} missing business relation; skipping`);
        continue;
      }
      const businessId: number = biz.id;
      const bizDocId: string = String(biz.id);

      const entryPaths: string[] =
        Array.isArray(src.entryPaths) && src.entryPaths.length ? (src.entryPaths as string[]) : [''];

      strapi.log.info(`[ingest:internal] #${src.id} ${src.baseUrl} paths=${JSON.stringify(entryPaths)}`);

      for (const p of entryPaths) {
        const url = joinUrl(src.baseUrl, p || '');
        let html = '';
        try {
          html = await loadHtmlSmart(url, src.rules as CssRules | undefined, (src.headers || undefined) as any, { warn: (m) => strapi.log.warn(m) });
        } catch (e: any) {
          strapi.log.warn(`[ingest:internal] fetch failed ${url}: ${e.message || e}`);
          continue;
        }

        const $ = cheerio.load(html);

        // Extract page/site titles to help filter META noise
        const pageTitle = cleanText($('title').first().text());
        const siteName = cleanText($('meta[property="og:site_name"]').attr('content') || '');

        const A = extractJsonLdProducts($, bizDocId, url);
        const B = extractInlineJSONProducts($, bizDocId, url);
        const C = extractMetaProducts($, bizDocId, url);
        const D = src.rules || src.mode === 'rules_css' ? extractByCssRules($, src.rules as CssRules, bizDocId, url) : [];

        const raw = [...A, ...B, ...C, ...D].filter(Boolean);
        totalExtracted += raw.length;

        // Validate & dedupe
        const isValid = productValidatorFactory(pageTitle, siteName);
        const filtered = raw.filter(isValid);
        const deduped = dedupePreferRicher(filtered);

        totalKept += deduped.length;
        strapi.log.info(
          `[ingest:internal] extract jsonld=${A.length} inline=${B.length} meta=${C.length} rules=${D.length} → extracted=${raw.length} kept=${deduped.length} @ ${url}`
        );

        // Publish setting
        const productModel = strapi.getModel('api::product.product') as any;
        const hasDraftPublish = !!productModel?.options?.draftAndPublish;

        for (const r of deduped) {
          // Final safe title and description
          const safeTitle = cleanText(
            r.title ??
            r.raw?.inline?.name ??
            r.raw?.jsonld?.name ??
            r.raw?.css?.title ??
            ''
          );
          if (isBlankTitle(safeTitle)) {
            strapi.log.warn(`[ingest:internal] skip: blank/invalid title @ ${r.sourceUrl}`);
            continue;
          }

          const description = cleanText(
            r.description ??
            r.raw?.inline?.description ??
            r.raw?.jsonld?.description ??
            ''
          );

          const data: any = {
            title: safeTitle,
            description,                        // richtext: plain string is fine
            price: toNumber(r.price),
            currency: r.currency || 'USD',
            sourceUrl: r.sourceUrl,
            productUrl: r.productUrl || r.sourceUrl,                  // NEW
            productImageUrl: r.productImageUrl || null,               // NEW
            primaryCategory: null,
            autoImported: true,
            sourceSnapshot: r.raw || {},
            business: businessId,                 // relation by id
          };

          // upsert by (title, business)
          const existing = await strapi.db.query('api::product.product').findOne({
            where: { title: data.title, business: { id: businessId } },
            select: ['id', 'publishedAt'],
          });

          if (existing?.id) {
            await strapi.entityService.update('api::product.product', existing.id, {
              data: {
                ...data,
                ...(hasDraftPublish && !existing.publishedAt
                  ? { publishedAt: new Date().toISOString() }
                  : {}),
              },
            });
          } else {
            await strapi.entityService.create('api::product.product', {
              data: {
                ...data,
                ...(hasDraftPublish ? { publishedAt: new Date().toISOString() } : {}),
              },
            });
          }
          upserts += 1;
        }
      }
    }

    strapi.log.info(`[ingest:internal] done extracted=${totalExtracted} kept=${totalKept} upserts=${upserts}`);
    return { ok: true, extracted: totalExtracted, kept: totalKept, upserts };
  },
});
