// cms.ts — Frontend-only Strapi v5 REST helper (React + Vite, TypeScript)
//
// No Strapi SDK/commands here — just plain fetch requests to your public Content API.
// Aligns with the "old shop page" style where you build URLSearchParams and call cms(url).
//
// Env (Vite):
//  - VITE_CMS_URL                 e.g. "https://cms.example.com"
//  - VITE_CMS_PUBLIC_TOKEN        optional Public API Token (read-only)
//
// Optional migration flag:
//  - VITE_STRAPI_FORCE_V4="true"  // if your API is returning v4-style { data: [{ id, attributes: {...}}] }
//
import type { StrapiListResponse, StrapiItemResponse, StrapiParams, Product, Business, Category, Tag, CustomPage, SourceWebsite, MediaFile } from './types';

const RAW = (import.meta.env.VITE_CMS_URL || '').trim();
export const API_BASE = RAW.replace(/\/+$/, '');
const TOKEN = import.meta.env.VITE_CMS_PUBLIC_TOKEN as string | undefined;
const FORCE_V4 = String(import.meta.env.VITE_STRAPI_FORCE_V4 || '').toLowerCase() === 'true';

if (!API_BASE) {
  throw new Error('VITE_CMS_URL is not set. Add it to your .env and restart Vite.');
}

function join(base: string, path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function withQuery(url: string, params?: Record<string, unknown>): string {
  if (!params || !Object.keys(params).length) return url;
  const usp = new URLSearchParams();
  for (const [k, v] of toQueryPairs(params)) usp.append(k, v);
  const qs = usp.toString();
  return qs ? `${url}?${qs}` : url;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Recursively flatten nested query params into Strapi-style bracket keys. */
function toQueryPairs(input: unknown, prefix?: string): [string, string][] {
  const out: [string, string][] = [];
  const push = (k: string, v: unknown) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((vv, i) => out.push(...toQueryPairs(vv, `${k}[${i}]`)));
    } else if (isObj(v)) {
      for (const [kk, vv] of Object.entries(v)) out.push(...toQueryPairs(vv, `${k}[${kk}]`));
    } else {
      out.push([k, String(v)]);
    }
  };
  if (prefix) {
    if (Array.isArray(input)) input.forEach((v, i) => push(`${prefix}[${i}]`, v));
    else if (isObj(input)) for (const [k, v] of Object.entries(input)) push(`${prefix}[${k}]`, v);
    else out.push([prefix, String(input)]);
  } else if (isObj(input)) {
    for (const [k, v] of Object.entries(input)) out.push(...toQueryPairs(v, k));
  }
  return out;
}

// -----------------------------------------------
// Public fetcher: call like cms('/api/products?...')
// -----------------------------------------------
export default async function cms<T = unknown>(pathOrUrl: string, init: RequestInit & { params?: Record<string, unknown> } = {}): Promise<T> {
  const path = pathOrUrl.startsWith('http') ? pathOrUrl : join(API_BASE, pathOrUrl);
  const url = withQuery(path, init.params);
  const headers = new Headers(init.headers || {});
  headers.set('Accept', 'application/json');
  if (TOKEN) headers.set('Authorization', `Bearer ${TOKEN}`);
  if (FORCE_V4) headers.set('Strapi-Response-Format', 'v4');

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Strapi request failed: ${res.status} ${res.statusText} :: ${text}`);
  }
  return res.json() as Promise<T>;
}

// -----------------------------------------------
// Helpers: media URL & light normalization
// -----------------------------------------------

/** Make Strapi media URLs absolute for <img src>. */
export function mediaURL(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** Normalize a v4 product to flattened v5-ish shape if needed. */
export function normalizeProduct(input: any): Product {
  if (!input) return input as Product;
  // v5 (flattened)
  if (!input.attributes) return input as Product;

  // v4 -> v5-ish
  const a = input.attributes || {};
  const image = a.image?.data ? { id: a.image.data.id, documentId: a.image.data.id, ...(a.image.data.attributes || {}) } : null;
  const business = a.business?.data ? { id: a.business.data.id, documentId: a.business.data.id, ...(a.business.data.attributes || {}) } : null;
  const secCats = (a.secondaryCategories?.data || []).map((c: any) => ({ id: c.id, documentId: c.id, ...(c.attributes || {}) }));
  const tags = (a.tags?.data || []).map((t: any) => ({ id: t.id, documentId: t.id, ...(t.attributes || {}) }));

  const p: Product = {
    id: input.id,
    documentId: input.id,
    title: a.title,
    slug: a.slug,
    description: a.description,
    image: image || undefined,
    price: a.price,
    currency: a.currency || 'USD',
    primaryCategory: a.primaryCategory,
    secondaryCategories: secCats,
    tags,
    sourceUrl: a.sourceUrl,
    productUrl: a.productUrl,
    productImageUrl: a.productImageUrl,
    sourceSnapshot: a.sourceSnapshot,
    autoImported: !!a.autoImported,
    overrideLock: !!a.overrideLock,
    availability: a.availability || 'unknown',
    ingredientsAllergens: a.ingredientsAllergens,
    business,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    publishedAt: a.publishedAt,
  };
  return p;
}

/** Normalize an array response that may be v4 or v5. */
export function normalizeProductList(json: any): Product[] {
  const arr = Array.isArray(json?.data) ? json.data : [];
  if (!arr.length) return [];
  return arr.map(normalizeProduct);
}

// -----------------------------------------------
// Optional: tiny endpoint helpers that still use fetch under the hood
// (No Strapi SDK; these just build URLs and call cms())
// -----------------------------------------------

export const endpoints = {
  products: {
    list: async (params: StrapiParams = {}): Promise<StrapiListResponse<Product> | { data: Product[]; meta: any }> => {
      const url = withQuery('/api/products', params as any);
      const json = await cms<any>(url);
      // If needed, normalize to flattened
      const data = normalizeProductList(json);
      if (data.length) return { data, meta: json?.meta ?? {} };
      return json;
    },
    bySlug: async (slug: string, params: StrapiParams = {}): Promise<StrapiItemResponse<Product>> => {
      const q = { ...params, filters: { slug: { $eq: slug } } };
      const url = withQuery('/api/products', q as any);
      const json = await cms<any>(url);
      const data = normalizeProductList(json);
      return { data: data[0] ?? null, meta: json?.meta ?? {} };
    },
  },
  businesses: {
    list: async (params: StrapiParams = {}) => {
      const url = withQuery('/api/businesses', params as any);
      return cms(url);
    },
    bySlug: async (slug: string, params: StrapiParams = {}) => {
      const q = { ...params, filters: { slug: { $eq: slug } } };
      const url = withQuery('/api/businesses', q as any);
      return cms(url);
    },
  },
  categories: {
    list: async (params: StrapiParams = {}) => {
      const url = withQuery('/api/categories', params as any);
      return cms(url);
    },
  },
  tags: {
    list: async (params: StrapiParams = {}) => {
      const url = withQuery('/api/tags', params as any);
      return cms(url);
    },
  },
  customPages: {
    bySlug: async (slug: string, params: StrapiParams = {}) => {
      const q = { ...params, filters: { slug: { $eq: slug } } };
      const url = withQuery('/api/custom-pages', q as any);
      return cms(url);
    },
  },
  sources: {
    list: async (params: StrapiParams = {}) => {
      const url = withQuery('/api/source-websites', params as any);
      return cms(url);
    },
  },
};
