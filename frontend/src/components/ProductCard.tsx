import { mediaURL } from '@/lib/cms';

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

function isReal(p: ProductLite) {
  const hasTitle = !!(p.title && String(p.title).trim());
  const imgRaw = (p as any)?.image?.url || (p as any)?.image?.data?.attributes?.url || '';
  return !!(hasTitle && (p.productUrl || p.productImageUrl || imgRaw));
}

export default function ProductCard({ p }: { p: ProductLite }) {
  if (!isReal(p)) return null;

  const title = (p.title && String(p.title)) || `Item #${p.id ?? ''}`;
  const desc = stripHtml(p.description);
  const descPreview = desc ? (desc.length > 140 ? `${desc.slice(0, 137)}…` : desc) : '';

  const priceNum = typeof p.price === 'number' ? p.price : Number(p.price);
  const money = Number.isFinite(priceNum) ? formatMoney(priceNum as number, p.currency || 'USD') : '';

  const ext = asAbs(p.productImageUrl);
  const media = (p as any)?.image?.url || (p as any)?.image?.data?.attributes?.url || '';
  const img = ext || (media ? mediaURL(media) : '');

  const href = asAbs(p.productUrl) || '/';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={[
        // Outer wrapper (NO overflow-hidden so the offset layer can show)
        "group block relative isolate",
        "hover:z-10",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(17,135,167,0.26)]",
        // Offset square behind
        "before:content-[''] before:absolute before:inset-0",
        "before:translate-x-3 before:translate-y-3",
        "before:rounded-[22px]",
        "before:bg-[rgba(17,135,167,0.14)]",
        "before:shadow-[0_18px_35px_rgba(11,47,58,0.10)]",
        "before:-z-10",
      ].join(' ')}
    >
      <div
        className={[
          // Inner card face (clipped)
          "rounded-[22px] overflow-hidden",
          "border border-[rgba(11,47,58,0.12)]",
          "bg-white/90",
          "shadow-[0_18px_40px_rgba(11,47,58,0.14)]",
          "transition-transform duration-200",
          "group-hover:-translate-y-0.5",
        ].join(' ')}
      >
        <div className="relative aspect-[4/3] w-full bg-white">
          {img ? (
            <img
              src={img}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-white via-[rgba(242,179,74,0.16)] to-[rgba(17,135,167,0.14)]" />
          )}

          {money && (
            <div
              className={[
                "absolute right-3 top-3",
                "rounded-full px-3 py-1",
                "text-xs font-extrabold",
                "text-[rgba(11,47,58,0.95)]",
                "bg-[rgba(242,179,74,0.90)]",
                "border border-[rgba(242,179,74,0.55)]",
                "shadow-[0_12px_22px_rgba(11,47,58,0.10)]",
              ].join(' ')}
            >
              {money}
            </div>
          )}
        </div>

        <div className="bg-[rgba(17,135,167,0.08)] p-4">
          <h3 className="line-clamp-1 text-[15px] font-extrabold tracking-[-0.2px] text-[color:var(--brand)]">
            {title}
          </h3>

          {descPreview && (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-[rgba(79,106,114,1)]">
              {descPreview}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-semibold text-[rgba(79,106,114,1)]">
              {p.business?.name || ''}
            </span>

            {/* Small “external” hint (no overlap on image) */}
            <span className="text-[12px] font-black text-[color:var(--brand)] opacity-80 transition group-hover:opacity-100">
              →
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
