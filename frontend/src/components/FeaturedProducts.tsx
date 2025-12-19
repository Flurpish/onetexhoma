import ProductCard from './ProductCard';

export default function FeaturedProducts({ products }: { products: any[] }) {
  if (!products?.length) return null;

  return (
    <section className="container" style={{ padding: '10px 0 50px' }}>
      <h2 className="section-title">Featured Products</h2>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {products.map((p: any) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
