// src/components/ProductCard.tsx
import { mediaURL } from '@/lib/cms';

function first<T>(v: T | T[] | undefined | null): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function toText(html?: string | null) {
  if (!html) return '';
  // Strapi richtext comes as HTML; strip tags for the card preview
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function ProductCard({ p }: { p: any }) {
  const a = p?.attributes ?? {};

  // Name / title (always show something)
  const rawTitle =
    a.title ??
    a.name ??
    a.productName ??
    a.label ??
    a?.sourceSnapshot?.jsonld?.name ??
    a?.sourceSnapshot?.inline?.name ??
    a?.sourceSnapshot?.css?.title ??
    '';
  const title = String(rawTitle || '').trim() || `Item #${p?.id ?? ''}`;

  // Price (Strapi decimal fields are strings)
  const priceNum =
    typeof a.price === 'number'
      ? a.price
      : typeof a.price === 'string'
      ? parseFloat(a.price)
      : undefined;
  const currency = a.currency || 'USD';
  const money =
    typeof priceNum === 'number' && !Number.isNaN(priceNum)
      ? new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(priceNum)
      : '';

  // Business
  const business = a.business?.data?.attributes?.name || '';

  // Link back to the original product
  const href = a.sourceUrl || undefined;

  // Image: media -> external -> snapshot ; "blank if none" (no placeholder text)
  const media = a.image?.data?.attributes?.url
    ? mediaURL(a.image.data.attributes.url)
    : null;
  const snapshotImg =
    (Array.isArray(a?.sourceSnapshot?.jsonld?.image)
      ? first<string>(a.sourceSnapshot.jsonld.image)
      : a?.sourceSnapshot?.jsonld?.image) ||
    a?.sourceSnapshot?.inline?.image ||
    null;
  const img = media || a?.externalImageUrl || snapshotImg || '';

  // Description (strip tags for the card preview)
  const desc = toText(a.description);
  const descPreview = desc ? (desc.length > 140 ? `${desc.slice(0, 137)}…` : desc) : '';

  // Wrapper: use <a> if we have a sourceUrl; else <div>
  const Wrapper: any = href ? 'a' : 'div';
  const wrapperProps = href
    ? { href, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="group block rounded-xl border border-zinc-200 bg-white/90 shadow-sm hover:shadow-md transition overflow-hidden"
      title={title}
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
          <div className="w-full h-48" />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold line-clamp-1">{title}</h3>
          {money && <span className="text-sm font-bold">{money}</span>}
        </div>

        {descPreview && (
          <p className="mt-1 text-xs text-zinc-600 line-clamp-2">{descPreview}</p>
        )}

        <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
          <span className="truncate">{business}</span>
        </div>
      </div>
    </Wrapper>
  );
}
