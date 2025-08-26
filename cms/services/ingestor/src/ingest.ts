// cms/services/ingestor/src/ingest.ts
import { firefox } from 'playwright';
import * as cheerio from 'cheerio';
import jsonLdParser from './lib/jsonld';
import { classifyCategories, normalizeProduct, RawProduct, NormalizedProduct } from './lib/normalize';
import { upsertProduct, getActiveSources } from './lib/strapi';

export async function runIngestionOnce() {
  const sources = await getActiveSources();
  for (const src of sources) {
    try {
      const entryPaths = Array.isArray(src.entryPaths) && src.entryPaths.length ? src.entryPaths : ['/'];
      for (const path of entryPaths) {
        const url = new URL(path, src.baseUrl).toString();
        const html = await loadHtml(url, src);
        const $ = cheerio.load(html);

        // 1) JSON-LD / microdata
        const productsA: RawProduct[] = jsonLdParser.extractProducts($, src.business?.id || src.businessId, url);

        // 2) Meta/OG (very light fallback)
        const productsB: RawProduct[] = extractMetaProducts($, src.business?.id || src.businessId, url);

        // 3) CSS rules fallback
        const productsC: RawProduct[] =
          src.mode === 'rules_css' ? extractByCssRules($, src.rules, src.business?.id || src.businessId, url) : [];

        const rawProducts = [...productsA, ...productsB, ...productsC].filter(Boolean) as RawProduct[];

        const normalized: NormalizedProduct[] = rawProducts
          .map(normalizeProduct)
          .map((p) => ({ ...p, ...classifyCategories(p) }));

        for (const p of normalized) {
          await upsertProduct(p);
        }
      }
      // Optionally: mark success on the SourceWebsite
    } catch (e: any) {
      console.error(`Ingestion failed for ${src.baseUrl}`, e);
      // Optionally: persist lastError on SourceWebsite here
    }
  }
}

async function loadHtml(url: string, src: any) {
  // Try fetch first
  const res = await fetch(url, { headers: (src.headers as any) || {} });
  const text = await res.text();
  if (needsJs(text)) {
    const browser = await firefox.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    const content = await page.content();
    await browser.close();
    return content;
  }
  return text;
}

function needsJs(html: string) {
  // Heuristic: little visible text or “app shell”
  const noContent = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = noContent.replace(/<[^>]+>/g, '').trim();
  return text.length < 200; // tweak as needed
}

function extractMetaProducts($: cheerio.CheerioAPI, businessId: number, pageUrl: string): RawProduct[] {
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  if (!ogTitle) return [];
  return [
    {
      title: ogTitle,
      description: ogDesc,
      image: ogImage,
      sourceUrl: pageUrl,
      businessId,
      raw: { og: true },
    },
  ];
}

function extractByCssRules(
  $: cheerio.CheerioAPI,
  rules: any,
  businessId: number,
  pageUrl: string
): RawProduct[] {
  if (!rules || !rules.list) return [];
  const listSel = String(rules.list);
  const items: RawProduct[] = [];
  $(listSel).each((_, el) => {
    const get = (sel?: string) => (sel ? ($(el).find(sel.replace('@src', '')).attr('src') || $(el).find(sel).text()) : '');
    const title = rules.title ? $(el).find(rules.title).text().trim() : '';
    const desc = rules.description ? $(el).find(rules.description).text().trim() : '';
    const priceRaw =
      rules.price && rules.price.includes('@')
        ? $(el).find(rules.price.replace('@', '')).attr(rules.price.split('@')[1]) || ''
        : rules.price
        ? $(el).find(rules.price).text().trim()
        : '';
    const image =
      rules.image && rules.image.includes('@')
        ? $(el).find(rules.image.replace('@src', '')).attr('src') || ''
        : rules.image
        ? $(el).find(rules.image).attr('src') || ''
        : '';

    items.push({
      title,
      description: desc,
      price: priceRaw,
      image,
      currency: rules.currency || 'USD',
      businessId,
      sourceUrl: pageUrl,
      raw: { rules },
    });
  });
  return items;
}
