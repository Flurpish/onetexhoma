import { formatMoney, stripHtml } from '@/lib/utils';
import type { Product } from '@/lib/types';

export default function ProductCard({ product }: { product: any }) {
  const a: Product = product.attributes;
  const img = a.image?.data?.attributes?.url;
  const title = a.title;
  const desc = stripHtml(a.description)?.slice(0, 90);
  const price = formatMoney(a.price, a.currency || 'USD');

  return (
    <article className="card">
      {img && <img src={img} alt={title} style={{ height: 160, width: '100%', objectFit: 'cover' }} />}
      <div className="body">
        <div className="title">{title}</div>
        {desc && <div className="desc">{desc}</div>}
        <div className="meta">
          <span className="badge">{a.primaryCategory || 'Food'}</span>
          <strong>{price}</strong>
        </div>
      </div>
    </article>
  );
}
