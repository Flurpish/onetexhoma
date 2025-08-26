// frontend/src/pages/shop/page.tsx
import { useEffect, useMemo, useState } from 'react';
import { cms } from '@/lib/cms';
import Filters from '@/components/Filters';
import ProductCard from '@/components/ProductCard';

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await cms<any>('/api/products?populate=image,business,secondaryCategories');
        setProducts(data || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const primary = useMemo(() => {
    const s = new Set<string>(products.map((p: any) => p.attributes?.primaryCategory || 'Other'));
    return Array.from(s);
  }, [products]);

  const secondary = useMemo(() => {
    const s = new Set<string>(
      products.flatMap((p: any) => (p.attributes?.secondaryCategories?.data || []).map((c: any) => c.attributes?.name || ''))
    );
    s.delete(''); // remove empties
    return Array.from(s);
  }, [products]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Shop</h1>
      {!loading && <Filters primary={primary} secondary={secondary} />}
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-6">
        {products.map((p: any) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </main>
  );
}
