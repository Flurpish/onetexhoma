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

type RenderOpts = {
  force?: boolean;               // force remote render
  waitForSelector?: string;      // selector to wait for (from rules.list)
  userAgent?: string;            // optional UA override
};

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
function joinUrl(base: string, p: string) {
  if (/^https?:\/\//i.test(p)) return p; // absolute passthrough
  const cleanBase = base.endsWith('/') ? base : base + '/';
  const cleanPath = p.replace(/^\//, '');
  return new URL(cleanPath, cleanBase).toString();
}

function needsJs(html: string) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = withoutScripts.replace(/<[^>]+>/g, '').trim();
  return text.length < 200;
}

async function loadHtml(
  url: string,
  headers?: Record<string, string>,
  opts: RenderOpts = {}
) {
  // 0) attempt a cheap fetch first unless we’re forcing JS
  if (!opts.force) {
    try {
      const res0 = await fetch(url, { headers });
      const html0 = await res0.text();
      // If it looks “rich enough”, return it
      if (!needsJs(html0)) return html0;
      // Otherwise continue to renderer
    } catch {
      // fall through to renderer
    }
  }

  // 1) Try local Playwright if present
  const pw = await ensurePlaywright();
  if (pw) {
    try {
      const browser = await pw.firefox.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: opts.userAgent,                           // <-- set UA here
        extraHTTPHeaders: headers as Record<string, string>, // <-- pass headers here
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      if (opts.waitForSelector) {
        try {
          await page.waitForSelector(opts.waitForSelector, { timeout: 8000 });
        } catch {
          /* ignore */
        }
      }
      const content = await page.content();
      await context.close();
      await browser.close();
      return content;
    } catch {
      // fall through to remote
    }
  }

  // 2) Remote renderer (Browserless). MUST be POST with JSON.
  if (RENDER_HTTP_URL) {
    // RENDER_HTTP_URL should be something like:
    //   https://production-<region>.browserless.io/content?token=YOUR_TOKEN
    const body = {
      url,
      bestAttempt: true,
      gotoOptions: { waitUntil: 'networkidle2', timeout: RENDER_TIMEOUT || 15000 },
      waitForSelector: opts.waitForSelector ? { selector: opts.waitForSelector, timeout: 8000 } : undefined,
      userAgent: opts.userAgent || undefined,
    };
    try {
      const r = await fetch(RENDER_HTTP_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-cache' },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      if (r.ok && txt) return txt;
      console.warn('[render] remote returned', r.status, r.statusText, (txt || '').slice(0, 180));
    } catch (e: any) {
      console.warn('[render] remote failed:', e?.message || e);
    }
  }

  // 3) Last resort: simple fetch again (may still be enough for some sites)
  const res = await fetch(url, { headers });
  return await res.text();
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
    const pickAttr = (sel?: string, name?: string) =>
      sel && name ? $(el).find(sel).attr(name) || '' : '';

    const title = rules.title ? txt(rules.title) : '';
    const description = rules.description ? txt(rules.description) : '';
    const price =
      rules.price?.includes('@')
        ? pickAttr(rules.price.split('@')[0], rules.price.split('@')[1])
        : rules.price
        ? txt(rules.price)
        : '';
    const image =
      rules.image?.includes('@')
        ? pickAttr(rules.image.split('@')[0], rules.image.split('@')[1])
        : rules.image
        ? $(el).find(rules.image).attr('src') || ''
        : '';

    const candidate = { title, description, price };
    if (!isLikelyProduct(candidate)) return; // gate each candidate

    items.push({
      ...candidate,
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

    for (const entryPath of entryPaths) {
      const url = joinUrl(src.baseUrl, String(entryPath || ''));
      console.log(`  [fetch] ${url}`);

      const forceRender =
        src.mode === 'rules_css' ||
        Boolean(src.rules?.render?.force === true);

      // best guess: whatever you use to select items
      const waitSel =
        (typeof src.rules?.list === 'string' && src.rules.list) ||
        undefined;

      let html: string;
      try {
        html = await loadHtml(url, src.headers, {
          force: forceRender,
          waitForSelector: waitSel,
          // optionally a nicer UA for hosted menu apps:
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        });
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
        .map((p) => ({ ...p, ...classifyCategories(p, src.businessPrimaryCategory) }));

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
