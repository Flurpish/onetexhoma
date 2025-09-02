// Strapi v5 REST helper — plain fetch, v5 flattened responses by default.

export type Json = unknown;

/** Toggle drafts with env (default OFF). Requires a token to actually see drafts. */
const INCLUDE_DRAFTS =
  String(import.meta.env.VITE_CMS_INCLUDE_DRAFTS || '').toLowerCase() === 'true';

/** Normalize base; auto-add https:// and strip trailing slashes. */
function normalizeBase(raw?: string) {
  const v = String(raw || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
const API_BASE = normalizeBase(import.meta.env.VITE_CMS_URL);
if (!API_BASE) throw new Error('VITE_CMS_URL is not set');

/** Public token (optional). Drafts require a valid token. */
const TOKEN    = import.meta.env.VITE_CMS_PUBLIC_TOKEN as string | undefined;
const FORCE_V4 = String(import.meta.env.VITE_STRAPI_FORCE_V4 || '').toLowerCase() === 'true';

const DEBUG = false; // flip true locally if you want verbose logs
const dlog = (...a: any[]) => DEBUG && console.info('[cms]', ...a);

// ------------- lightweight GET cache (sessionStorage) + in-flight dedupe -------------
const isBrowser = typeof window !== 'undefined';
const CACHE_MS  = Number(import.meta.env.VITE_CMS_CACHE_MS ?? 60_000); // 60s default
const INFLIGHT  = new Map<string, Promise<any>>();

function cacheKey(url: string) {
  // include presence of token so "draft" variants don’t cross-contaminate
  return `GET:${url}::${TOKEN ? 'auth' : 'anon'}`;
}
function getSession<T>(key: string): T | null {
  if (!isBrowser) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, exp } = JSON.parse(raw);
    if (Date.now() > exp) return null;
    return data as T;
  } catch { return null; }
}
function setSession<T>(key: string, data: T) {
  if (!isBrowser) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, exp: Date.now() + CACHE_MS }));
  } catch {}
}

function full(url: string) {
  return url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function cms<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const url = full(path);
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');
  if (TOKEN)  headers.set('Authorization', `Bearer ${TOKEN}`);
  if (FORCE_V4) headers.set('Strapi-Response-Format', 'v4');

  if (method === 'GET') {
    const key = cacheKey(url);
    const cached = getSession<T>(key);
    if (cached) {
      dlog('HIT cache', url);
      return cached;
    }
    if (INFLIGHT.has(key)) {
      dlog('JOIN inflight', url);
      return INFLIGHT.get(key) as Promise<T>;
    }
    const p = (async () => {
      dlog('GET', url);
      const res  = await fetch(url, { ...init, headers });
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        console.error('[cms] error', res.status, res.statusText, text.slice(0, 300));
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const data = (() => { try { return JSON.parse(text); } catch { return text as any; } })();
      setSession(key, data);
      return data as T;
    })();
    INFLIGHT.set(key, p);
    try { return await p; }
    finally { INFLIGHT.delete(key); }
  }

  // non-GET: no caching
  dlog(method, url);
  const res  = await fetch(url, { ...init, headers });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} :: ${text}`);
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

/** Make Strapi media URL absolute. */
export function mediaURL(url?: string | null) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

/* ----------------------------- utils (list merge) ----------------------------- */

function addParam(path: string, key: string, val: string) {
  const hasQ = path.includes('?');
  return `${path}${hasQ ? '&' : '?'}${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
}
function qsToString(qs = '') {
  return qs ? (qs.startsWith('?') ? qs.slice(1) : qs) : '';
}
function getField(item: any, key: string) {
  return item?.[key] ?? item?.attributes?.[key];
}
function isRealProduct(item: any) {
  const title = String(getField(item, 'title') || '').trim();
  if (!title) return false;
  const productUrl      = String(getField(item, 'productUrl') || '').trim();
  const productImageUrl = String(getField(item, 'productImageUrl') || '').trim();
  const imageUrl =
    item?.image?.url ||
    item?.image?.data?.attributes?.url ||
    item?.attributes?.image?.data?.attributes?.url ||
    '';
  return !!(productUrl || productImageUrl || imageUrl);
}
function mergeUniquePreferFirst(draftArr: any[], pubArr: any[]) {
  const out: any[] = [];
  const seen = new Set<string>();
  const keyOf = (x: any) => String(x?.documentId ?? x?.attributes?.documentId ?? x?.id ?? '');
  const push = (x: any) => { const k = keyOf(x); if (k && !seen.has(k)) { seen.add(k); out.push(x); } };
  draftArr.forEach(push); pubArr.forEach(push);
  return out;
}

/* --------------------------------- endpoints --------------------------------- */

export const endpoints = {
  products: {
    /**
     * List products.
     * - Default: published-only (1 call)
     * - If INCLUDE_DRAFTS=true AND TOKEN present: draft+published in parallel (2 calls)
     * You can override with an explicit `status=` in the query string.
     */
    list: async (
      qs = '',
      status: 'published' | 'draft' | 'any' =
        (INCLUDE_DRAFTS && !!TOKEN ? 'any' : 'published')
    ) => {
      const base = `/api/products${qsToString(qs) ? `?${qsToString(qs)}` : ''}`;
      const hasExplicitStatus = /(^|[?&])status=/.test(qs);

      if (hasExplicitStatus) {
        const json = await cms<any>(base);
        const data = (Array.isArray(json?.data) ? json.data : []).filter(isRealProduct);
        dlog('[products.list] explicit status; count:', data.length);
        return { data, meta: json?.meta ?? {} };
      }

      if (status !== 'any' || !INCLUDE_DRAFTS || !TOKEN) {
        const effective = status === 'draft' && INCLUDE_DRAFTS && TOKEN ? 'draft' : 'published';
        const json = await cms<any>(addParam(base, 'status', effective));
        const data = (Array.isArray(json?.data) ? json.data : []).filter(isRealProduct);
        dlog(`[products.list] ${effective}; count:`, data.length);
        return { data, meta: json?.meta ?? {} };
      }

      // INCLUDE_DRAFTS === true and token present → fetch both in parallel
      const [draftJson, pubJson] = await Promise.all([
        cms<any>(addParam(base, 'status', 'draft')),
        cms<any>(addParam(base, 'status', 'published')),
      ]);
      const draft = Array.isArray(draftJson?.data) ? draftJson.data : [];
      const pub   = Array.isArray(pubJson?.data)   ? pubJson.data   : [];
      const merged = mergeUniquePreferFirst(draft, pub).filter(isRealProduct);
      dlog('[products.list] merged counts', { draft: draft.length, published: pub.length, merged: merged.length });

      return { data: merged, meta: { draft: draftJson?.meta ?? {}, published: pubJson?.meta ?? {} } };
    },

    // Kept for one-off detail fetches (avoid using from cards/grid to prevent N+1)
    byDocumentId: async (documentId: string) => {
      const base = `/api/products?filters[documentId][$eq]=${encodeURIComponent(documentId)}&populate=*`;
      let json = await cms<any>(addParam(base, 'status', 'published'));
      let data = Array.isArray(json?.data) ? json.data[0] : null;
      if (!data && INCLUDE_DRAFTS && TOKEN) {
        json = await cms<any>(addParam(base, 'status', 'draft'));
        data = Array.isArray(json?.data) ? json.data[0] : null;
      }
      return { data: data && isRealProduct(data) ? data : null, meta: json?.meta ?? {} };
    },

    byNumericId: async (id: number | string) => {
      const base = `/api/products?filters[id][$eq]=${encodeURIComponent(String(id))}&populate=*`;
      let json = await cms<any>(addParam(base, 'status', 'published'));
      let data = Array.isArray(json?.data) ? json.data[0] : null;
      if (!data && INCLUDE_DRAFTS && TOKEN) {
        json = await cms<any>(addParam(base, 'status', 'draft'));
        data = Array.isArray(json?.data) ? json.data[0] : null;
      }
      return { data: data && isRealProduct(data) ? data : null, meta: json?.meta ?? {} };
    },

    byAnyId: (idOrDoc: string | number) => {
      const s = String(idOrDoc);
      const looksLikeDocId = /[a-z]/i.test(s) && s.length >= 8;
      return looksLikeDocId ? endpoints.products.byDocumentId(s) : endpoints.products.byNumericId(s);
    },
  },

  businesses: {
    list: (qs = '') => cms(`/api/businesses?${qs}`),
    bySlug: (slug: string) =>
      cms(`/api/businesses?filters[slug][$eq]=${encodeURIComponent(slug)}&populate=*&status=published`),
  },

  categories: { list: (qs = '') => cms(`/api/categories?${qs}`) },
  tags:       { list: (qs = '') => cms(`/api/tags?${qs}`) },

  customPages: {
    byBusinessSlug: (slug: string) =>
      cms(`/api/custom-pages?filters[business][slug][$eq]=${encodeURIComponent(slug)}&populate=*&status=published`),
    bySlug: (slug: string) =>
      cms(`/api/custom-pages?filters[slug][$eq]=${encodeURIComponent(slug)}&populate=*&status=published`),
  },
};

export default cms;
