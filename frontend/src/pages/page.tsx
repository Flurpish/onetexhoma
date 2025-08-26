// frontend/src/pages/page.tsx
import { useEffect, useState } from 'react';
import { cms } from '@/lib/cms';
import FeaturedProducts from '@/components/FeaturedProducts';

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: businesses } = await cms<any>('/api/businesses?filters[isFeatured][$eq]=true&populate=products.image');
        const arr = (businesses || []).flatMap((b: any) => b.attributes?.products?.data || []);
        setProducts(arr.sort(() => Math.random() - 0.5).slice(0, 12));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h1 className="text-4xl font-bold">Onetexhoma</h1>
        <p className="mt-3 text-lg max-w-2xl">
          One place to browse menus and products from local businesses. Discover something new, then go support them!
        </p>
      </section>
      {!loading && <FeaturedProducts products={products} />}
    </main>
  );
}
