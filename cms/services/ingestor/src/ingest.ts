// cms/services/ingestor/src/ingest.ts
import * as cheerio from 'cheerio';
import 'dotenv/config';
import jsonLdParser from './lib/jsonld';
import { classifyCategories, normalizeProduct, type RawProduct, type NormalizedProduct } from './lib/normalize';
import { upsertProduct, getActiveSources } from './lib/strapi';
import type { Core } from '@strapi/strapi';
import { spawn } from 'node:child_process';
import path from 'node:path';

const RENDER_HTTP_URL = process.env.RENDER_HTTP_URL || '';
const RENDER_TIMEOUT = Number(process.env.RENDER_TIMEOUT_MS || '15000');
const ONLY_ID = process.env.INGEST_ONLY_SOURCE_ID ? String(process.env.INGEST_ONLY_SOURCE_ID) : null;

// Optional Playwright (for JS-rendered pages) – loaded dynamically to keep deps optional
type PlaywrightNS = typeof import('playwright');
let _playwright: PlaywrightNS | null = null;
async function ensurePlaywright(): Promise<PlaywrightNS | null> {
  if (_playwright) return _playwright;
  try {
    const mod = await import('playwright');
    _playwright = mod;
    return _playwright;
  } catch {
    return null;
  }
}

// Basic process safety
process.on('unhandledRejection', (e) => { console.error('[unhandledRejection]', e); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('[uncaughtException]', e); process.exit(1); });

console.log('[ingestor boot]', {
  STRAPI_URL: process.env.STRAPI_URL,
  TOKEN: process.env.INGESTOR_STRAPI_TOKEN ? 'present' : 'missing',
});

// ---------- Local Strapi helpers for listing & deleting (v5 syntax) ----------
const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1338';
const TOKEN = process.env.INGESTOR_STRAPI_TOKEN || '';

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async ingestAll() {
    const cmd =
      process.env.INGEST_CMD || 'npx tsx --env-file=../../.env src/ingest.ts';
    const cwd = path.resolve(process.cwd(), 'services', 'ingestor');

    strapi.log.info(`[ingest] spawn: "${cmd}" (cwd=${cwd})`);

    const child = spawn(cmd, {
      cwd,
      shell: true,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        STRAPI_URL: process.env.STRAPI_URL || 'http://localhost:1338',
        INGESTOR_STRAPI_TOKEN: process.env.INGESTOR_STRAPI_TOKEN || '',
      },
    });

    child.unref();
    return { ok: true, started: true };
  },
});

async function sfetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...(init.headers as Record<string, string>),
  };
  const res = await fetch(`${STRAPI_URL}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`Strapi ${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/**
 * LIST existing autoImported products for a given Business (by documentId),
 * optionally restricted to a baseUrl prefix. NOTE: v5 requires filtering on
 * relations by *documentId*, NOT numeric id.
 */
async function listProductsForSource(opts: {
  businessDocumentId: string;
  baseUrl?: string;
  pageSize?: number;
}) {
  const out: Array<{ id: number; attributes: any }> = [];
  const size = opts.pageSize ?? 100;
  let page = 1;

  // IMPORTANT: use documentId here (not id) to avoid integer cast errors
  const filters = [
    `filters[business][documentId][$eq]=${encodeURIComponent(String(opts.businessDocumentId))}`,
    `filters[autoImported][$eq]=true`,
    `filters[overrideLock][$ne]=true`,
  ];
  if (opts.baseUrl) {
    filters.push(`filters[sourceUrl][$startsWith]=${encodeURIComponent(opts.baseUrl)}`);
  }

  while (true) {
    const q = `/api/products?${filters.join('&')}&pagination[page]=${page}&pagination[pageSize]=${size}&sort=id:asc`;
    const json = await sfetch<{ data: any[] }>(q);
    const chunk = json?.data || [];
    out.push(...chunk);
    if (chunk.length < size) break;
    page += 1;
  }
  return out;
}

async function deleteProduct(id: number) {
  await sfetch(`/api/products/${id}`, { method: 'DELETE' });
}

// ---------- Helpers ----------
function joinUrl(base: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path; // absolute passthrough
  const cleanBase = base.endsWith('/') ? base : base + '/';
  const cleanPath = path.replace(/^\//, '');
  return new URL(cleanPath, cleanBase).toString();
}

function needsJs(html: string) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = withoutScripts.replace(/<[^>]+>/g, '').trim();
  return text.length < 200;
}

async function loadHtml(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers });
  const html = await res.text();

  if (needsJs(html)) {
    const pw = await ensurePlaywright();
    if (pw) {
      const browser = await pw.firefox.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      const content = await page.content();
      await browser.close();
      return content;
    }
  }

  // 3) If still “thin” and no local PW, use remote render service
  if (needsJs(html) && RENDER_HTTP_URL) {
    const rurl = `${RENDER_HTTP_URL}${encodeURIComponent(url)}`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), RENDER_TIMEOUT);
    try {
      const r = await fetch(rurl, { signal: ac.signal });
      clearTimeout(t);
      if (r.ok) {
        const rendered = await r.text();
        if (rendered && rendered.length > html.length) return rendered;
      }
    } catch (_) {
      /* ignore and fall back */
    } finally {
      clearTimeout(t);
    }
  }

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

function isLikelyProduct(candidate: { title?: string; price?: any; description?: string }) {
  const title = (candidate.title || '').trim();
  if (!title || /^untitled$/i.test(title)) return false;
  if (/order online|skytab online|menu|site|home/i.test(title)) return false;
  // require at least some signal: price OR meaningful description
  const hasPrice = candidate.price != null && String(candidate.price).match(/\d/);
  const hasDesc = (candidate.description || '').trim().length > 10;
  return hasPrice || hasDesc;
}

function extractByCssRules($: cheerio.CheerioAPI, rules: any, businessDocumentId: string, pageUrl: string): RawProduct[] {
  if (!rules || !rules.list) return [];
  const items: RawProduct[] = [];
  $(String(rules.list)).each((_, el) => {
    const txt = (sel?: string) => (sel ? $(el).find(sel).text().trim() : '');
    const pickAttr = (sel?: string, name?: string) => (sel && name ? $(el).find(sel).attr(name) || '' : '');

    const title = rules.title ? txt(rules.title) : '';
    const desc = rules.description ? txt(rules.description) : '';
    const priceRaw = rules.price?.includes('@')
      ? pickAttr(rules.price.split('@')[0], rules.price.split('@')[1])
      : rules.price
      ? txt(rules.price)
      : '';
    const image = rules.image?.includes('@')
      ? pickAttr(rules.image.split('@')[0], rules.image.split('@')[1])
      : rules.image
      ? $(el).find(rules.image).attr('src') || ''
      : '';

    const candidate = {
  title,
  description: desc,
  price: priceRaw,
};

// ⬅️ skip obvious non-products early
if (!isLikelyProduct(candidate)) return;

items.push({
  ...candidate,
  image,
  currency: rules.currency || 'USD',
  businessDocumentId,
  sourceUrl: pageUrl,
  raw: { rules },
});

    items.push({
      title,
      description: desc,
      price: priceRaw,
      image,
      currency: rules.currency || 'USD',
      businessDocumentId,
      sourceUrl: pageUrl,
      raw: { rules },
    });
  });
  return items;
}

// ---------- CLI arg: --source <id|all> ----------
function getSourceFilterFromArgv(): string {
  const i = process.argv.indexOf('--source');
  return i > -1 ? String(process.argv[i + 1]) : 'all';
}

// ---------- Main run ----------
export async function runIngestionOnce() {
  const filter = getSourceFilterFromArgv(); // 'all' | '123'
  let sources: any[] = await getActiveSources();
  if (ONLY_ID) {
    sources = sources.filter((s) => String(s.id) === ONLY_ID);
  }
  if (filter !== 'all') {
    const wanted = String(filter).trim();
    sources = sources.filter((s) => String(s.id) === wanted);
  }
  console.log(`[sources] active=${sources.length} (filter=${filter})`);
  if (!sources.length) {
    console.log('No matching sources.');
    return;
  }

  let totalCandidates = 0;
  let totalUpserts = 0;
  let totalDeleted = 0;

  for (const src of sources) {
    const entryPaths = Array.isArray(src.entryPaths) && src.entryPaths.length ? src.entryPaths : [''];
    console.log(`\n[source] #${src.id} ${src.baseUrl} paths=${JSON.stringify(entryPaths)}`);

    const bizDocId = src.businessDocumentId;
    if (!bizDocId) {
      console.log(`  [extract] SKIP source=${src.id} — missing businessDocumentId`);
      continue;
    }

    // Preload existing autoImported (not overrideLock) products for this business + baseUrl
    const existing = await listProductsForSource({ businessDocumentId: bizDocId, baseUrl: src.baseUrl });
    const existingMap = new Map<string, number>(); // key -> productId
    for (const row of existing) {
      const a = row.attributes || {};
      const key = `${bizDocId}|${(a.sourceUrl || '').toLowerCase()}|${(a.title || '').toLowerCase().trim()}`;
      existingMap.set(key, row.id);
    }
    const seen = new Set<string>();

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

      const $ = cheerio.load(html);
      // IMPORTANT: pass businessDocumentId into extractors
      const A = jsonLdParser.extractProducts($, bizDocId, url);
      const B = extractMetaProducts($, bizDocId, url);
      const C = src.mode === 'rules_css' ? extractByCssRules($, src.rules, bizDocId, url) : [];

      const pre = [...A, ...B, ...C].filter(Boolean);
      const rawCandidates = pre.filter(isLikelyProduct); // ⬅️ final pass

      const dropped = pre.length - rawCandidates.length;
      console.log(
        `  [extract] jsonld=${A.length} meta=${B.length} rules=${C.length} → total=${pre.length} kept=${rawCandidates.length}${dropped ? ` dropped=${dropped}` : ''}`
      );

      totalCandidates += rawCandidates.length;

      const normalized: NormalizedProduct[] = rawCandidates
        .map(normalizeProduct)
        .map((p) => ({ ...p, ...classifyCategories(p) }));

      for (const p of normalized) {
        try {
          // Ensure upsertProduct receives businessDocumentId (in case normalize strips it)
          await upsertProduct({ ...p, businessDocumentId: bizDocId } as any);
          const key = `${bizDocId}|${(p.sourceUrl || '').toLowerCase()}|${(p.title || '').toLowerCase().trim()}`;
          seen.add(key);
          totalUpserts += 1;
        } catch (e: any) {
          console.warn(`  [upsert] failed "${p.title}": ${e.message}`);
        }
      }
    }

    // Cleanup stale (not seen) autoImported, not overrideLock (already filtered)
    const staleIds: number[] = [];
    for (const [key, id] of existingMap.entries()) {
      if (!seen.has(key)) staleIds.push(id);
    }
    if (staleIds.length) {
      console.log(`  [cleanup] deleting ${staleIds.length} stale product(s)`);
      for (const id of staleIds) {
        try {
          await deleteProduct(id);
          totalDeleted += 1;
          console.log(`    [-] deleted #${id}`);
        } catch (e: any) {
          console.warn(`    [!] delete failed #${id}: ${e.message}`);
        }
      }
    }
  }

  console.log(`\n[done] candidates=${totalCandidates} upserts=${totalUpserts} deleted=${totalDeleted}`);
}

// Run immediately (no import.meta to keep CJS/ESM friendly)
if (process.env.INGEST_RUN !== '0') {
  runIngestionOnce().catch((e) => {
    console.error('[fatal]', e);
    process.exit(1);
  });
}
