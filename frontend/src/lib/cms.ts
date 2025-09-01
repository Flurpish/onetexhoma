// src/lib/cms.ts
// Strapi v5 REST helper — plain fetch, v5 flattened responses by default.
// We DO NOT use /:id routes; we always filter with populate=*.

export type Json = unknown;

const API_BASE = (import.meta.env.VITE_CMS_URL || '').replace(/\/+$/, '');
if (!API_BASE) throw new Error('VITE_CMS_URL is not set');

const TOKEN   = import.meta.env.VITE_CMS_PUBLIC_TOKEN as string | undefined;
const FORCE_V4 = String(import.meta.env.VITE_STRAPI_FORCE_V4 || '').toLowerCase() === 'true';

const DEBUG = true;
const dlog = (...a: any[]) => DEBUG && console.info('[cms]', ...a);

function full(url: string) {
  return url.startsWith('http') ? url : `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function cms<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const url = full(path);
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');
  if (TOKEN)  headers.set('Authorization', `Bearer ${TOKEN}`);
  if (FORCE_V4) headers.set('Strapi-Response-Format', 'v4'); // otherwise v5 flattened is default
  dlog('GET', url);

  const res  = await fetch(url, { ...init, headers });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[cms] error', res.status, res.statusText, text);
    throw new Error(`${res.status} ${res.statusText}`);
  }
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

/** Get a scalar field from a possibly v4-shaped item (with .attributes). */
function getField(item: any, key: string) {
  return item?.[key] ?? item?.attributes?.[key];
}

/** Decide if an item is a "real" product (has title + any meaningful surface). */
function isRealProduct(item: any) {
  const title = String(getField(item, 'title') || '').trim();
  if (!title) return false;

  const productUrl       = String(getField(item, 'productUrl') || '').trim();
  const productImageUrl  = String(getField(item, 'productImageUrl') || '').trim();
  const imageUrl =
    item?.image?.url ||
    item?.image?.data?.attributes?.url ||
    item?.attributes?.image?.data?.attributes?.url ||
    '';

  return !!(productUrl || productImageUrl || imageUrl);
}

/** Merge two Strapi arrays, preferring the first array’s version (draft before published). */
function mergeUniquePreferFirst(draftArr: any[], pubArr: any[]) {
  const out: any[] = [];
  const seen = new Set<string>();
  const keyOf = (x: any) => {
    const docId = x?.documentId ?? x?.attributes?.documentId;
    const id    = x?.id;
    return docId ? `doc:${docId}` : `id:${id}`;
  };
  const pushIfNew = (x: any) => {
    const k = keyOf(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  };
  draftArr.forEach(pushIfNew);
  pubArr.forEach(pushIfNew);
  return out;
}

/* --------------------------------- endpoints --------------------------------- */

export const endpoints = {
  products: {
    /**
     * List products.
     * status:
     *   - 'published' | 'draft' => single request
     *   - 'any' (default)       => fetch both and merge, draft wins
     *
     * Pass any extra query in `qs` (e.g., sort/pagination/populate/fields).
     */
    list: async (qs = '', status: 'published' | 'draft' | 'any' = 'any') => {
      const hasExplicitStatus = /(^|[?&])status=/.test(qs);
      const base = `/api/products${qsToString(qs) ? `?${qsToString(qs)}` : ''}`;

      if (hasExplicitStatus) {
        const json = await cms<any>(base);
        const data = (Array.isArray(json?.data) ? json.data : []).filter(isRealProduct);
        dlog('[products.list] explicit status; count:', data.length);
        return { data, meta: json?.meta ?? {} };
      }

      if (status !== 'any') {
        const json = await cms<any>(addParam(base, 'status', status));
        const data = (Array.isArray(json?.data) ? json.data : []).filter(isRealProduct);
        dlog(`[products.list] ${status}; count:`, data.length);
        return { data, meta: json?.meta ?? {} };
      }

      // status === 'any' → draft + published
      const draftJson = await cms<any>(addParam(base, 'status', 'draft'));
      const pubJson   = await cms<any>(addParam(base, 'status', 'published'));

      const draft = Array.isArray(draftJson?.data) ? draftJson.data : [];
      const pub   = Array.isArray(pubJson?.data)   ? pubJson.data   : [];

      const merged = mergeUniquePreferFirst(draft, pub).filter(isRealProduct);

      dlog('[products.list] merged counts', {
        draft: draft.length, published: pub.length, merged: merged.length,
      });

      return {
        data: merged,
        // meta can’t be a true combined pagination; return both for transparency
        meta: { draft: draftJson?.meta ?? {}, published: pubJson?.meta ?? {} },
      };
    },

    /** Get one by documentId using filters (not /:id). Tries published then draft. */
    byDocumentId: async (documentId: string) => {
      const base = `/api/products?filters[documentId][$eq]=${encodeURIComponent(documentId)}&populate=*`;
      // published first
      let json = await cms<any>(addParam(base, 'status', 'published'));
      let data = Array.isArray(json?.data) ? json.data[0] : null;

      // fallback to draft
      if (!data) {
        json = await cms<any>(addParam(base, 'status', 'draft'));
        data = Array.isArray(json?.data) ? json.data[0] : null;
      }

      return { data: data && isRealProduct(data) ? data : null, meta: json?.meta ?? {} };
    },

    /** Get one by numeric id using filters. Tries published then draft. */
    byNumericId: async (id: number | string) => {
      const base = `/api/products?filters[id][$eq]=${encodeURIComponent(String(id))}&populate=*`;
      let json = await cms<any>(addParam(base, 'status', 'published'));
      let data = Array.isArray(json?.data) ? json.data[0] : null;

      if (!data) {
        json = await cms<any>(addParam(base, 'status', 'draft'));
        data = Array.isArray(json?.data) ? json.data[0] : null;
      }

      return { data: data && isRealProduct(data) ? data : null, meta: json?.meta ?? {} };
    },

    /** Helper: try documentId shape first, else numeric id. */
    byAnyId: (idOrDoc: string | number) => {
      const s = String(idOrDoc);
      const looksLikeDocId = /[a-z]/i.test(s) && s.length >= 8;
      return looksLikeDocId
        ? endpoints.products.byDocumentId(s)
        : endpoints.products.byNumericId(s);
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
