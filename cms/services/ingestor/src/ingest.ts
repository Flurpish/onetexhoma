// cms/services/ingestor/src/ingest.ts
import * as cheerio from 'cheerio';
import 'dotenv/config';
import jsonLdParser from './lib/jsonld';
import { classifyCategories, normalizeProduct, type RawProduct, type NormalizedProduct } from './lib/normalize';
import { upsertProduct, getActiveSources, type ActiveSource } from './lib/strapi';
import { pathToFileURL } from 'node:url';

// ----- optional playwright support (ESM-safe dynamic import) -----
type PlaywrightNS = typeof import('playwright');
let _playwright: PlaywrightNS | null = null;

async function ensurePlaywright(): Promise<PlaywrightNS | null> {
  if (_playwright) return _playwright;
  try {
    const mod = await import('playwright');
    _playwright = mod;
    return _playwright;
  } catch {
    return null; // not installed; we’ll just skip JS rendering
  }
}

// ----- process safety -----
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e);
  process.exit(1);
});
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e);
  process.exit(1);
});

console.log('[ingestor boot]', {
  STRAPI_URL: process.env.STRAPI_URL,
  TOKEN: process.env.INGESTOR_STRAPI_TOKEN ? 'present' : 'missing',
});

// ----- helpers -----
function joinUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path; // absolute URL passthrough
  const cleanBase = base.endsWith('/') ? base : base + '/';
  const cleanPath = path.replace(/^\//, '');   // force relative join
  return new URL(cleanPath, cleanBase).toString();
}

function needsJs(html: string) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = withoutScripts.replace(/<[^>]+>/g, '').trim();
  return text.length < 200;
}

async function loadHtml(url: string, headers?: Record<string, string>) {
  // 1) try vanilla fetch
  const res = await fetch(url, { headers });
  const html = await res.text();

  // 2) if content looks empty and playwright is available, render
  if (!needsJs(html)) return html;

  const pw = await ensurePlaywright();
  if (!pw) return html;

  const browser = await pw.firefox.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  const content = await page.content();
  await browser.close();
  return content;
}

function extractMetaProducts($: cheerio.CheerioAPI, businessDocumentId: string, pageUrl: string): RawProduct[] {
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
      businessDocumentId,
      raw: { og: true },
    },
  ];
}

function extractByCssRules(
  $: cheerio.CheerioAPI,
  rules: any,
  businessDocumentId: string,
  pageUrl: string
): RawProduct[] {
  if (!rules || !rules.list) return [];
  const items: RawProduct[] = [];
  $(String(rules.list)).each((_, el) => {
    const txt = (sel?: string) => (sel ? $(el).find(sel).text().trim() : '');
    const attr = (sel?: string, name?: string) => (sel && name ? $(el).find(sel).attr(name) || '' : '');

    const title = rules.title ? txt(rules.title) : '';
    const desc = rules.description ? txt(rules.description) : '';
    const price = rules.price?.includes('@')
      ? attr(rules.price.split('@')[0], rules.price.split('@')[1])
      : rules.price
      ? txt(rules.price)
      : '';
    const image = rules.image?.includes('@')
      ? attr(rules.image.split('@')[0], rules.image.split('@')[1])
      : rules.image
      ? $(el).find(rules.image).attr('src') || ''
      : '';

    items.push({
      title,
      description: desc,
      price,
      image,
      currency: rules.currency || 'USD',
      businessDocumentId,
      sourceUrl: pageUrl,
      raw: { rules },
    });
  });
  return items;
}

// ----- main run -----
export async function runIngestionOnce() {
  const sources = await getActiveSources();
  console.log(`[sources] active=${sources.length}`);
  if (sources.length === 0) {
    console.log('No active sources found. Check SourceWebsite entries, `ingestStatus=active`, business link, and baseUrl/entryPaths.');
    return;
  }

  let totalCandidates = 0;
  let totalUpserts = 0;

  for (const src of sources) {
    const entryPaths = Array.isArray(src.entryPaths) && src.entryPaths.length ? src.entryPaths : [''];
    console.log(`\n[source] #${src.id} ${src.baseUrl} paths=${JSON.stringify(entryPaths)}`);

    for (const path of entryPaths) {
      const url = joinUrl(src.baseUrl, String(path || ''));
      console.log(`  [fetch] ${url}`);

      let html: string;
      try {
        html = await loadHtml(url, src.headers);
      } catch (e: any) {
        console.warn(`  [fetch] failed: ${e.message}`);
        continue;
      }

      const $ = cheerio.load(html) as import('cheerio').CheerioAPI;
      const bizDocId = src.businessDocumentId;
      if (!bizDocId) {
        console.log(`  [extract] SKIP source=${src.id} — missing businessDocumentId`);
        continue;
      }

      const A = jsonLdParser.extractProducts($, bizDocId, url);
      const B = extractMetaProducts($, bizDocId, url);
      const C = src.mode === 'rules_css' ? extractByCssRules($, src.rules, bizDocId, url) : [];

      const rawCandidates = [...A, ...B, ...C].filter(Boolean);
      console.log(`  [extract] jsonld=${A.length} meta=${B.length} rules=${C.length} → total=${rawCandidates.length}`);
      totalCandidates += rawCandidates.length;


      // inside your for..of over sources
      const normalized: NormalizedProduct[] = rawCandidates
        .map(normalizeProduct)
        .map((p) => ({ ...p, ...classifyCategories(p) }));

      for (const p of normalized) {
        try {
          await upsertProduct({ ...p, businessDocumentId: src.businessDocumentId! });
          totalUpserts += 1;
        } catch (e: any) {
          console.warn(`  [upsert] failed "${p.title}": ${e.message}`);
        }
      }

    }
  }

  console.log(`\n[done] candidates=${totalCandidates} upserts=${totalUpserts}`);
}

// ----- run if invoked directly (ESM-safe) -----
// Run by default (you can disable by setting INGEST_RUN=0)
if (process.env.INGEST_RUN !== '0') {
  runIngestionOnce().catch((e) => {
    console.error('[fatal]', e);
    process.exit(1);
  });
}


