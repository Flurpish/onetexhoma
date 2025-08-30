import ProductCard from './ProductCard';

export default function FeaturedProducts({ products }: { products: any[] }) {
  if (!products?.length) return null;
  return (
    <section className="container" style={{ padding: '10px 0 50px' }}>
      <h2 className="section-title">Featured bites</h2>
      <div className="grid">
        {products.map((p:any) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
