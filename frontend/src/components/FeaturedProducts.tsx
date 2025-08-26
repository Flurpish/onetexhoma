// apps/web/components/FeaturedProducts.tsx
import ProductCard from '@/components/ProductCard';
export default function FeaturedProducts({ products }: { products: any[] }) {
if (!products?.length) return null;
return (
<section className="bg-gray-50 py-10">
<div className="mx-auto max-w-6xl px-4">
<h2 className="text-2xl font-semibold mb-6">Featured Products</h2>
<div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
{products.map((p:any)=> <ProductCard key={p.id} product={p} />)}
</div>
</div>
</section>
);
}