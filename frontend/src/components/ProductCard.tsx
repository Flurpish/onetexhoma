import { useEffect, useState } from 'react';
import { endpoints, mediaURL } from '@/lib/cms';

type ProductLite = {
  id?: number | string;
  documentId?: string;
  title?: string;
  description?: string | null;
  currency?: string;
  price?: number | string | null;
  productUrl?: string | null;
  productImageUrl?: string | null;
  image?: { url?: string } | { data?: { attributes?: { url?: string } } } | null;
  business?: { name?: string } | null;
};

const DEBUG = true;
const dlog = (...a: any[]) => DEBUG && console.log('[ProductCard]', ...a);

function asAbs(u?: string | null) {
  if (!u) return '';
  const s = String(u).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^\/\//.test(s)) return `https:${s}`;
  if (!s.startsWith('/') && /\./.test(s) && !/\s/.test(s)) return `https://${s}`;
  return '';
}
const stripHtml = (html?: string | null) =>
  html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';

function formatMoney(v: number, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(v); }
  catch { return `$${v.toFixed(2)}`; }
}

/** A product is "real" if it has a title and at least one surface (url/img). */
function isReal(p: ProductLite) {
  const hasTitle = !!(p.title && String(p.title).trim());
  const imgRaw =
    (p as any)?.image?.url ||
    (p as any)?.image?.data?.attributes?.url ||
    '';
  return !!(hasTitle && (p.productUrl || p.productImageUrl || imgRaw));
}

export default function ProductCard({ p: seed }: { p: ProductLite }) {
  const [p, setP] = useState<ProductLite>(seed);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = seed.documentId ?? seed.id;
        if (key == null) return;

        const json = await endpoints.products.byAnyId(key);
        console.info('[ProductCard] RAW one', json);

        // list-like response → { data: Product | null }
        const data = (json as any)?.data ?? null;
        // Support forced v4 shape
        const v5 = data?.attributes ? { id: data.id, documentId: data.documentId, ...data.attributes } : data;

        if (!cancelled && v5) setP(v5);
        dlog('hydrated', { seed, v5 });
      } catch (e) {
        console.error('[ProductCard] fetch error', e);
      }
    })();
    return () => { cancelled = true; };
  }, [seed.id, seed.documentId]);

  // If the hydrated/seed product fails the “real” check, don't render a broken card.
  if (!isReal(p)) return null;

  const title = (p.title && String(p.title)) || `Item #${p.id ?? ''}`;
  const desc = stripHtml(p.description);
  const descPreview = desc ? (desc.length > 140 ? `${desc.slice(0, 137)}…` : desc) : '';

  const priceNum = typeof p.price === 'number' ? p.price : Number(p.price);
  const money = Number.isFinite(priceNum) ? formatMoney(priceNum as number, p.currency || 'USD') : '';

  // Image: productImageUrl → media image → blank
  const ext = asAbs(p.productImageUrl);
  const mediaRaw =
    (p as any)?.image?.url ||
    (p as any)?.image?.data?.attributes?.url ||
    '';
  const img = ext || (mediaRaw ? mediaURL(mediaRaw) : '');

  // Link: productUrl → home
  const href = asAbs(p.productUrl) || '/';

  dlog('card', {
    id: p.id, documentId: (p as any)?.documentId,
    productUrl: p.productUrl, productImageUrl: p.productImageUrl,
    mediaRaw, resolvedImg: img, resolvedHref: href,
  });

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="group block overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-100 shadow-sm transition hover:shadow-lg hover:bg-zinc-900/95"
    >
      <div className="relative aspect-[4/3] w-full bg-zinc-800">
        {img ? (
          <img
            src={img}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full" />
        )}
        {money && (
          <div className="absolute right-2 top-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-extrabold text-zinc-900 shadow-md ring-1 ring-white/60">
            {money}
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-zinc-50">{title}</h3>
        {descPreview && <p className="line-clamp-2 text-xs leading-snug text-zinc-400">{descPreview}</p>}
        <div className="flex items-center justify-between pt-0.5">
          <span className="truncate text-xs text-zinc-500">{p.business?.name || ''}</span>
        </div>
      </div>
    </a>
  );
}
