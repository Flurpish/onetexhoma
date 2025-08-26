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
  const res = await fetch(`${STRAPI_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Strapi ${res.status} ${res.statusText}: ${text}`);
  }
  // ✅ Explicitly await and cast from unknown → T
  const data = (await res.json()) as unknown as T;
  return data;
}

export async function getActiveSources() {
  const q = '/api/source-websites?filters[ingestStatus][$eq]=active&populate=business';
  const json = await sfetch<{ data: any[] }>(q);
  return (json.data || []).map((d) => ({
    id: d.id,
    ...d.attributes,
    businessId: d.attributes?.business?.data?.id,
  }));
}

export async function upsertProduct(p: NormalizedProduct) {
  const body = {
    data: {
      title: p.title,
      description: p.description,
      price: p.price,
      currency: p.currency,
      image: p.image,
      sourceUrl: p.sourceUrl,
      primaryCategory: p.primaryCategory,
      // TODO: link secondaryCategories in a second pass if needed
      autoImported: true,
      business: p.businessId,
      sourceSnapshot: p.raw,
    },
  };
  return sfetch('/api/products', {
    method: 'POST',
    body: JSON.stringify(body),
  }).catch((e) => {
    console.warn('upsertProduct failed:', e.message);
  });
}
