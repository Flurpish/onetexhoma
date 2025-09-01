// cms/services/ingestor/src/lib/strapi.ts
import type { NormalizedProduct } from './normalize';

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1338';
const TOKEN = process.env.INGESTOR_STRAPI_TOKEN || '';

export type ActiveSource = {
  id: number;
  documentId: string;
  baseUrl: string;
  entryPaths?: string[];
  mode: 'auto_schema' | 'auto_heuristic' | 'rules_css';
  rules?: any;
  headers?: Record<string, string>;
  respectRobotsTxt?: boolean;
  ingestStatus: 'active' | 'paused' | 'error';
  businessDocumentId: string | null;
};

export async function getActiveSources(): Promise<ActiveSource[]> {
  // 1) list
  const listQ =
    '/api/source-websites' +
    '?filters[ingestStatus][$eq]=active' +
    '&fields[0]=id&fields[1]=documentId&fields[2]=baseUrl&fields[3]=entryPaths&fields[4]=mode&fields[5]=rules&fields[6]=headers&fields[7]=respectRobotsTxt&fields[8]=ingestStatus' +
    '&pagination[pageSize]=100';
  const list = await sfetch<{ data: any[] }>(listQ);

  const out: ActiveSource[] = [];
  for (const d of list.data ?? []) {
    const id = d.id;
    const documentId = d.documentId;
    // 2) detail by documentId to fetch the business relation (by documentId)
    try {
      const detail = await sfetch<{ data: any }>(
        `/api/source-websites/${encodeURIComponent(documentId)}?populate[business][fields][0]=documentId`
      );
      const bizDocId = detail.data?.business?.documentId ?? null;

      out.push({
        id,
        documentId,
        baseUrl: d.baseUrl,
        entryPaths: Array.isArray(d.entryPaths) ? d.entryPaths : [],
        mode: d.mode || 'auto_schema',
        rules: d.rules || null,
        headers: d.headers || undefined,
        respectRobotsTxt: d.respectRobotsTxt ?? true,
        ingestStatus: d.ingestStatus || 'active',
        businessDocumentId: bizDocId,
      });
    } catch (e) {
      // still push with null business so caller can log/skip
      out.push({
        id,
        documentId,
        baseUrl: d.baseUrl,
        entryPaths: Array.isArray(d.entryPaths) ? d.entryPaths : [],
        mode: d.mode || 'auto_schema',
        rules: d.rules || null,
        headers: d.headers || undefined,
        respectRobotsTxt: d.respectRobotsTxt ?? true,
        ingestStatus: d.ingestStatus || 'active',
        businessDocumentId: null,
      });
    }
  }

  return out.filter((s) => !!s.baseUrl);
}

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

// ──────────────────────────────────────────────────────────────
// NEW: create (or find) categories by name and return their IDs
// ──────────────────────────────────────────────────────────────
export async function ensureCategories(names: string[] = []): Promise<number[]> {
  const ids: number[] = [];

  for (const raw of names) {
    const name = (raw || '').trim();
    if (!name) continue;

    const findQ =
      `/api/categories?` +
      `filters[name][$eq]=${encodeURIComponent(name)}` +
      `&pagination[pageSize]=1`;

    const existing = await sfetch<{ data: Array<{ id: number }> }>(findQ).catch(() => ({ data: [] as any[] }));
    if (existing.data?.length) {
      ids.push(existing.data[0].id);
      continue;
    }

    const created = await sfetch<{ data: { id: number } }>(`/api/categories`, {
      method: 'POST',
      body: JSON.stringify({ data: { name } }),
    });
    ids.push(created.data.id);
  }

  return ids;
}

function toProductBody(p: NormalizedProduct) {
  return {
    data: {
      title: p.title,
      description: p.description,
      price: p.price,
      currency: p.currency,
      sourceUrl: p.sourceUrl,
      primaryCategory: p.primaryCategory,
      autoImported: true,
      business: p.businessDocumentId,
      sourceSnapshot: p.raw,
      // If you store external image URLs directly on Product:
      externalImageUrl: p.image || undefined,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// UPDATED: upsertProduct now also connects secondaryCategories
// and skips updates if overrideLock=true
// ──────────────────────────────────────────────────────────────
export async function upsertProduct(p: NormalizedProduct) {
  // 1) see if a product exists (by business + exact title)
  const findQ =
    '/api/products' +
    `?filters[title][$eq]=${encodeURIComponent(p.title)}` +
    `&filters[business][id][$eq]=${encodeURIComponent(String(p.businessDocumentId))}` +
    `&fields[0]=overrideLock` +
    `&fields[1]=sourceUrl` +
    `&pagination[page]=1&pagination[pageSize]=1`;

  const existing = await sfetch<{ data: Array<{ id: number; attributes?: { overrideLock?: boolean } }> }>(findQ)
    .catch(() => ({ data: [] as any[] }));

  // 2) precompute category IDs (if any)
  const secondaryNames = Array.isArray((p as any).secondaryCategoryNames)
    ? (p as any).secondaryCategoryNames as string[]
    : [];
  const categoryIds = await ensureCategories(secondaryNames);

  const body = toProductBody(p);

  // 3) update or create
  if (existing.data?.length) {
    const row = existing.data[0];
    const id = row.id;
    const locked = !!row.attributes?.overrideLock;

    if (!locked) {
      // update core fields first
      await sfetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });

      // then connect categories (v5 REST: assign by id array)
      if (categoryIds.length >= 0) {
        await sfetch(`/api/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ data: { secondaryCategories: categoryIds } }),
        });
      }
      console.log(`  [upsert] updated #${id} "${p.title}"`);
    } else {
      console.log(`  [upsert] skipped (overrideLock=true) #${id} "${p.title}"`);
    }

    return id;
  } else {
    // create with base fields
    const created = await sfetch<{ data: { id: number } }>(`/api/products`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const id = created.data.id;

    // connect categories after create
    if (categoryIds.length >= 0) {
      await sfetch(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ data: { secondaryCategories: categoryIds } }),
      });
    }

    console.log(`  [upsert] created #${id} "${p.title}"`);
    return id;
  }
}
