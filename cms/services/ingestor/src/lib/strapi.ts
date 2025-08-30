// cms/services/ingestor/src/lib/strapi.ts
import type { NormalizedProduct } from './normalize';

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1338';
const TOKEN = process.env.INGESTOR_STRAPI_TOKEN || '';

async function sfetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...(init.headers as Record<string, string>),
  };
  const url = `${STRAPI_URL}${path}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Strapi ${res.status} ${res.statusText} at ${url}: ${text}`);
  }
  return (await res.json()) as T;
}

/** What we actually need for ingestion */
export type ActiveSource = {
  /** numeric row id (not used for API lookups in v5) */
  id: number;
  /** v5 document identifier — use this in /:id routes */
  documentId: string;
  baseUrl: string;
  entryPaths?: string[];
  mode: 'auto_schema' | 'auto_heuristic' | 'rules_css';
  rules?: any;
  headers?: Record<string, string>;
  respectRobotsTxt?: boolean;
  ingestStatus: 'active' | 'paused' | 'error';
  /** we need the Business documentId for relation connects */
  businessDocumentId: string | null;
};

/**
 * Get active SourceWebsite docs.
 * - First call: list minimal fields + documentId (fast).
 * - Second call (per row): GET /api/source-websites/:documentId?populate[business] to read the related business.documentId
 *   (In Strapi v5, `/:id` expects documentId.)  See docs. 
 */
export async function getActiveSources(): Promise<ActiveSource[]> {
  const listQ =
    '/api/source-websites' +
    '?filters[ingestStatus][$eq]=active' +
    '&fields[0]=baseUrl&fields[1]=entryPaths&fields[2]=mode&fields[3]=rules' +
    '&fields[4]=headers&fields[5]=respectRobotsTxt&fields[6]=ingestStatus&fields[7]=documentId' +
    '&pagination[pageSize]=100';

  const list = await sfetch<{ data: any[] }>(listQ);
  const rows = Array.isArray(list.data) ? list.data : [];
  console.log(`[sources] raw=${rows.length}`);

  const out: ActiveSource[] = [];

  for (let i = 0; i < rows.length; i++) {
    const node = rows[i] || {};
    const a = node || {};
    const docId: string | undefined = a.documentId;
    const id: number | undefined = a.id;

    console.log(
      `[source ${i}] list  id=${id} documentId=${docId} status=${a.ingestStatus} baseUrl=${a.baseUrl}`
    );

    if (!docId) {
      console.log(`[source ${i}] SKIP: missing documentId on list row`);
      continue;
    }

    // Detail by documentId, populate business.documentId
    let businessDocumentId: string | null = null;
    try {
      const detail = await sfetch<any>(
        `/api/source-websites/${encodeURIComponent(docId)}?populate[business][fields][0]=documentId`
      );
      const biz = detail?.data?.business ?? null;
      const bizShape =
        biz == null ? 'null'
        : Array.isArray(biz) ? 'array'
        : typeof biz === 'object' ? 'object'
        : typeof biz;
      // Strapi v5 relation usually looks like: { documentId: '...' , ... }
      businessDocumentId =
        biz && typeof biz === 'object'
          ? (biz.documentId as string) || null
          : null;

      console.log(
        `[source ${i}] detail id=${id} doc=${docId} business.relShape=${bizShape} business.documentId=${businessDocumentId}`
      );
    } catch (e: any) {
      console.log(`[source ${i}] detail fetch failed: ${e?.message ?? e}`);
    }

    const baseUrl = a.baseUrl ?? '';
    const entryPaths =
      Array.isArray(a.entryPaths) ? a.entryPaths :
      a.entryPaths ? ([] as string[]).concat(a.entryPaths) : [];

    if (!businessDocumentId) {
      console.log(
        `[source ${i}] SKIP: missing businessDocumentId (use /:documentId; ensure relation exists & Business is published)`
      );
      continue;
    }
    if (!baseUrl) {
      console.log(`[source ${i}] SKIP: missing baseUrl`);
      continue;
    }

    out.push({
      id: id!,
      documentId: docId,
      baseUrl,
      entryPaths,
      mode: a.mode || 'auto_schema',
      rules: a.rules || null,
      headers: a.headers || undefined,
      respectRobotsTxt: a.respectRobotsTxt ?? true,
      ingestStatus: a.ingestStatus || 'active',
      businessDocumentId,
    });
  }

  console.log(`[sources] usable=${out.length}`);
  return out;
}

export async function listProductsForSource(opts: {
  businessId: number;
  baseUrl?: string; // we'll use startsWith filter on sourceUrl
  pageSize?: number;
}): Promise<Array<{ id: number; attributes: any }>> {
  const out: Array<{ id: number; attributes: any }> = [];
  const size = opts.pageSize ?? 100;
  let page = 1;
  // Build filters: business id + autoImported true + (optional) sourceUrl startsWith baseUrl
  const baseFilter = [
    `filters[business][id][$eq]=${encodeURIComponent(String(opts.businessId))}`,
    `filters[autoImported][$eq]=true`,
    `filters[overrideLock][$ne]=true`,
  ];
  if (opts.baseUrl) {
    baseFilter.push(`filters[sourceUrl][$startsWith]=${encodeURIComponent(opts.baseUrl)}`);
  }
  while (true) {
    const q =
      `/api/products?${baseFilter.join('&')}` +
      `&pagination[page]=${page}&pagination[pageSize]=${size}&sort=id:asc`;
    const res = await sfetch<{ data: any[] }>(q);
    const chunk = res?.data || [];
    out.push(...chunk);
    if (chunk.length < size) break;
    page += 1;
  }
  return out;
}

export async function deleteProduct(id: number) {
  await sfetch(`/api/products/${id}`, { method: 'DELETE' });
}

function toProductBody(p: NormalizedProduct & { businessDocumentId: string }) {
  // For manyToOne in v5 you can set the relation with the documentId directly (shorthand). :contentReference[oaicite:2]{index=2}
  return {
    data: {
      title: p.title,
      description: p.description,
      price: p.price,
      currency: p.currency,
      sourceUrl: p.sourceUrl,
      primaryCategory: p.primaryCategory,
      autoImported: true,
      business: p.businessDocumentId, // <-- pass the Business documentId, not numeric id
      sourceSnapshot: p.raw,
    },
  };
}

/**
 * Upsert Product by (business.documentId, title).
 * Finding by relation's documentId is supported by REST filters. :contentReference[oaicite:3]{index=3}
 */
export async function upsertProduct(p: NormalizedProduct & { businessDocumentId: string }) {
  const findQ =
    '/api/products' +
    `?filters[title][$eq]=${encodeURIComponent(p.title)}` +
    `&filters[business][documentId][$eq]=${encodeURIComponent(p.businessDocumentId)}` +
    '&pagination[page]=1&pagination[pageSize]=1';

  const existing = await sfetch<{ data: Array<{ id: number }> }>(findQ).catch(() => ({
    data: [] as any[],
  }));
  const body = toProductBody(p);

  if (existing.data && existing.data.length > 0) {
    const id = existing.data[0].id;
    await sfetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    console.log(`  [upsert] updated #${id} "${p.title}"`);
    return id;
  } else {
    const created = await sfetch<{ data: { id: number } }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    console.log(`  [upsert] created #${created.data.id} "${p.title}"`);
    return created.data.id;
  }
}
