// src/components/ProductCard.tsx
import { mediaURL } from '@/lib/cms';

export default function ProductCard({ p }: { p: any }) {
  const a = p.attributes || {};
  const title = a.title || '';
  const price = typeof a.price === 'number' ? a.price : undefined;
  const currency = a.currency || 'USD';
  const business = a.business?.data?.attributes?.name || '';
  const href = a.sourceUrl || '#';
  const img =
    a.image?.data?.attributes?.url
      ? mediaURL(a.image.data.attributes.url)
      : (a.externalImageUrl || '');

  const money =
    typeof price === 'number'
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(price)
      : '';

  // hide Untitled or obvious non-products (belt & suspenders)
  if (!title || /^untitled$/i.test(title)) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-xl border border-zinc-200 bg-white/90 shadow-sm hover:shadow-md transition overflow-hidden"
    >
      <div className="relative w-full h-48 bg-zinc-100">
        {img ? (
          <img
            src={img}
            alt={title}
            className="w-full h-48 object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-48 grid place-content-center text-zinc-400 text-sm">
            No image
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold line-clamp-1">{title}</h3>
          {money && <span className="text-sm font-bold">{money}</span>}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
          <span className="truncate">{business}</span>
          {a.primaryCategory && (
            <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5">{a.primaryCategory}</span>
          )}
        </div>
      </div>
    </a>
  );
}
