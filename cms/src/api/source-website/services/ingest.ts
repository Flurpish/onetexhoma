// cms/src/api/source-website/services/ingest.ts
import type { Core } from '@strapi/strapi';
import * as cheerio from 'cheerio';

// Minimal helpers (no Playwright; keep it simple for Cloud)
function joinUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanBase = base.endsWith('/') ? base : base + '/';
  const cleanPath = String(path || '').replace(/^\//, '');
  return new URL(cleanPath, cleanBase).toString();
}

async function loadHtml(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  return await res.text();
}

// Very small JSON-LD extractor (enough for Product & ItemList → Product)
function extractJsonLdProducts($: cheerio.CheerioAPI, businessDocumentId: string, pageUrl: string) {
  const items: Array<{
    title: string; description?: string; price?: string | number; currency?: string;
    image?: string; sourceUrl: string; businessDocumentId: string; raw: any;
  }> = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    let data: any;
    try {
      data = JSON.parse($(el).text());
    } catch { return; }

    const addProduct = (p: any) => {
      if (!p) return;
      const title = p.name || p.title;
      if (!title) return;
      const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      items.push({
        title,
        description: p.description || '',
        price: offers?.price ?? p.price,
        currency: offers?.priceCurrency || p.priceCurrency || 'USD',
        image: (Array.isArray(p.image) ? p.image[0] : p.image) || '',
        sourceUrl: pageUrl,
        businessDocumentId,
        raw: { jsonld: true },
      });
    };

    const walk = (node: any) => {
      if (!node) return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      const t = (node['@type'] || node.type || '').toString().toLowerCase();

      if (t.includes('product')) {
        addProduct(node);
      } else if (t.includes('itemlist') && Array.isArray(node.itemListElement)) {
        node.itemListElement.forEach((li: any) => {
          const it = li?.item || li;
          if (it) addProduct(it);
        });
      }
      // walk common containers
      if (node.mainEntity) walk(node.mainEntity);
      if (node.graph) walk(node.graph);
      if (node['@graph']) walk(node['@graph']);
    };

    walk(data);
  });

  return items;
}

function extractMetaProducts($: cheerio.CheerioAPI, businessDocumentId: string, pageUrl: string) {
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  if (!ogTitle) return [];
  return [{
    title: ogTitle, description: ogDesc, image: ogImage,
    sourceUrl: pageUrl, businessDocumentId, raw: { og: true },
  }];
}

function extractByCssRules($: cheerio.CheerioAPI, rules: any, businessDocumentId: string, pageUrl: string) {
  if (!rules || !rules.list) return [];
  const items: any[] = [];
  $(String(rules.list)).each((_, el) => {
    const txt = (sel?: string) => (sel ? $(el).find(sel).text().trim() : '');
    const attr = (sel?: string, name?: string) => (sel && name ? $(el).find(sel).attr(name) || '' : '');
    const title = rules.title ? txt(rules.title) : '';
    if (!title) return;

    const desc = rules.description ? txt(rules.description) : '';
    const price = rules.price?.includes('@') ? attr(rules.price.split('@')[0], rules.price.split('@')[1])
                 : rules.price ? txt(rules.price) : '';
    const image = rules.image?.includes('@') ? attr(rules.image.split('@')[0], rules.image.split('@')[1])
                 : rules.image ? $(el).find(rules.image).attr('src') || '' : '';

    items.push({
      title, description: desc, price, image,
      currency: rules.currency || 'USD',
      businessDocumentId, sourceUrl: pageUrl, raw: { rules },
    });
  });
  return items;
}

function toNumber(x: any) {
  if (typeof x === 'number') return x;
  const n = parseFloat(String(x || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Internal ingestion that uses Strapi Query Engine (no child processes).
   * Set INGEST_MODE=internal on Strapi Cloud and call this from your controller/cron.
   */
  async ingestAll(opts?: { onlyId?: number }) {
    const where: any = { ingestStatus: 'active' };
    if (opts?.onlyId) where.id = opts.onlyId;

    const sources = await strapi.entityService.findMany('api::source-website.source-website', {
        filters: where,
        populate: { business: true },  // include all fields on relation
        limit: 200,
    });

    strapi.log.info(`[ingest:internal] sources=${sources.length} filter=${opts?.onlyId ?? 'all'}`);
    let total = 0, upserts = 0;

    for (const src of sources as any[]) {
        const biz = src.business;
        const businessId = biz?.id;                // numeric
        const bizDocId  = biz?.documentId as string | undefined; // string

        const srcDocId  = src.documentId as string | undefined;
        const baseUrl   = src.baseUrl as string;

      if (!businessId || !bizDocId) {
        strapi.log.warn(`[ingest:internal] skip source#${src.id} — missing business link`);
        continue;
      }

      const entryPaths: string[] = Array.isArray((src as any).entryPaths) && (src as any).entryPaths.length
        ? (src as any).entryPaths : [''];

      strapi.log.info(`[ingest:internal] #${src.id} ${src.baseUrl} paths=${JSON.stringify(entryPaths)}`);

      for (const p of entryPaths) {
        const url = joinUrl((src as any).baseUrl, p);
        let html = '';
        try {
          html = await loadHtml(url, (src as any).headers || undefined);
        } catch (e: any) {
          strapi.log.warn(`[ingest:internal] fetch failed ${url}: ${e.message}`);
          continue;
        }

        const $ = cheerio.load(html);
        const A = extractJsonLdProducts($, bizDocId, url);
        const B = extractMetaProducts($, bizDocId, url);
        const C = (src as any).mode === 'rules_css' ? extractByCssRules($, (src as any).rules, bizDocId, url) : [];
        const raw = [...A, ...B, ...C].filter(Boolean);

        strapi.log.info(`[ingest:internal] extract jsonld=${A.length} meta=${B.length} rules=${C.length} → total=${raw.length}`);
        total += raw.length;

        for (const r of raw) {
          // very small normalize
          const data = {
            title: r.title,
            description: r.description || '',
            price: toNumber(r.price),
            currency: r.currency || 'USD',
            sourceUrl: r.sourceUrl,
            primaryCategory: null as any,
            autoImported: true,
            sourceSnapshot: r.raw || {},
            business: businessId, // entityService accepts numeric id for relations
          };

          // upsert by (title, business)
          const existing = await strapi.db.query('api::product.product').findOne({
            where: { title: data.title, business: { id: businessId } },
            select: ['id'],
          });

          if (existing) {
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
