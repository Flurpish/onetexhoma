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

function toProductBody(p: NormalizedProduct & { businessDocumentId: string }) {
  // For many-to-one, Strapi v5 allows the shorthand: business: '<documentId>'
  // (alternatively: business: { connect: ['<documentId>'] })
  return {
    data: {
      title: p.title,
      description: p.description,
      price: p.price,
      currency: p.currency,
      sourceUrl: p.sourceUrl,
      primaryCategory: p.primaryCategory,
      autoImported: true,
      business: p.businessDocumentId, // <-- v5 shorthand with documentId
      sourceSnapshot: p.raw,
    },
  };
}

/** Find existing product by (business.documentId, title). If exists → update; else create. */
export async function upsertProduct(p: NormalizedProduct & { businessDocumentId: string }) {
  const findQ =
    '/api/products' +
    `?filters[title][$eq]=${encodeURIComponent(p.title)}` +
    `&filters[business][documentId][$eq]=${encodeURIComponent(p.businessDocumentId)}` +
    '&pagination[page]=1&pagination[pageSize]=1' +
    '&fields[0]=id&fields[1]=documentId';

  const existing = await sfetch<{ data: Array<{ id: number; documentId: string }> }>(findQ).catch(() => ({
    data: [] as any[],
  }));
  const body = toProductBody(p);

  if (existing.data?.length) {
    // Update by documentId is allowed in v5 (prefer it over numeric id)
    const docId = existing.data[0].documentId;
    await sfetch(`/api/products/${encodeURIComponent(docId)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    console.log(`  [upsert] updated "${p.title}"`);
    return existing.data[0].id;
  } else {
    const created = await sfetch<{ data: { id: number; documentId: string } }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    console.log(`  [upsert] created #${created.data.id} "${p.title}"`);
    return created.data.id;
  }
}
