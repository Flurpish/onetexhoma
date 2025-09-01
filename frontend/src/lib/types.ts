// types.ts — Frontend types for Strapi v5 flattened responses
export type IntID = number;
export type DocID = string;

export interface StrapiListResponse<T> {
  data: T[];
  meta: {
    pagination?: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
    [k: string]: unknown;
  };
}
export interface StrapiItemResponse<T> {
  data: T | null;
  meta: Record<string, unknown>;
}

// Media
export interface MediaFormat {
  url: string;
  width: number;
  height: number;
  size?: number;
  mime?: string;
  ext?: string | null;
  hash?: string;
  path?: string | null;
}
export interface MediaFile {
  id: IntID;
  documentId: DocID;
  url: string;
  alternativeText?: string | null;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  formats?: Record<string, MediaFormat>;
  mime?: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Entities
export interface Category {
  id: IntID;
  documentId: DocID;
  name: string;
  slug: string;
  type: 'cuisine' | 'dish' | 'style' | 'vehicleType' | 'other';
}
export interface Tag {
  id: IntID;
  documentId: DocID;
  name: string;
  slug: string;
}
export interface Business {
  id: IntID;
  documentId: DocID;
  name: string;
  slug: string;
  logo?: MediaFile | null;
  websiteUrl?: string | null;
  isFeatured: boolean;
  description?: string | null;
  products?: Product[];
  sources?: SourceWebsite[];
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}
export interface Product {
  id: IntID;
  documentId: DocID;
  title: string;
  slug: string;
  description?: string | null;
  image?: MediaFile | null;
  price?: number | string | null;
  currency: string;
  primaryCategory?: string | null;
  secondaryCategories?: Category[];
  tags?: Tag[];
  sourceUrl?: string | null;
  productUrl?: string | null;       // NEW
  productImageUrl?: string | null;  // NEW
  sourceSnapshot?: unknown;
  autoImported: boolean;
  overrideLock: boolean;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  ingredientsAllergens?: unknown;
  business?: Business | null;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}
export interface CustomPage {
  id: IntID;
  documentId: DocID;
  title: string;
  slug: string;
  business?: Business | null;
  heroImage?: MediaFile | null;
  heroBlurb?: string | null;
  blocks?: unknown[];
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
}
export interface SourceWebsite {
  id: IntID;
  documentId: DocID;
  baseUrl: string;
  entryPaths?: unknown;
  mode: 'auto_schema' | 'auto_heuristic' | 'rules_css';
  rules?: unknown;
  headers?: unknown;
  respectRobotsTxt: boolean;
  ingestStatus: 'active' | 'paused' | 'error';
  lastRunAt?: string | null;
  lastError?: string | null;
  revisitIntervalMinutes: number;
  business?: Business | null;
}

// Query params
export interface StrapiParams {
  fields?: string[];
  sort?: string | string[];
  populate?: unknown;
  filters?: Record<string, unknown>;
  pagination?: { page?: number; pageSize?: number; start?: number; limit?: number };
  publicationState?: 'live' | 'preview';
  locale?: string | string[];
  [k: string]: unknown;
}
