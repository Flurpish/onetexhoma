// apps/web/components/ProductCard.tsx
export default function ProductCard({ product }: { product: any }) {
const a = product.attributes;
const img = a.image?.data?.attributes?.url;
return (
<article className="rounded-2xl border p-3 shadow-sm hover:shadow-md transition">
{img && <img src={img} alt={a.title} className="h-40 w-full object-cover rounded-xl" />}
<div className="mt-3">
<h3 className="font-medium line-clamp-2">{a.title}</h3>
{a.description && <p className="text-sm text-gray-600 line-clamp-2 mt-1">{strip(a.description)}</p>}
<div className="mt-2 font-semibold">{formatPrice(a.price, a.currency)}</div>
</div>
</article>
);
}


function strip(html:string){ return html.replace(/<[^>]*>/g, ''); }
function formatPrice(price:number, curr:string){
return price != null ? new Intl.NumberFormat(undefined, { style: 'currency', currency: curr||'USD'}).format(price) : '';
}