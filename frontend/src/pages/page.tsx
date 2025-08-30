import { useEffect, useState } from 'react';
import { cms } from '@/lib/cms';
import FeaturedProducts from '@/components/FeaturedProducts';

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: businesses } = await cms<any>('/api/businesses?filters[isFeatured][$eq]=true&populate=products.image');
      const arr = (businesses || []).flatMap((b:any)=> b.attributes?.products?.data || []);
      setProducts(arr.sort(()=>Math.random()-0.5).slice(0, 12));
    })();
  }, []);

  return (
    <main>
      <section className="container hero">
        <div>
          <h1>Find the best plates from local food trucks</h1>
          <p>Onetexhoma pulls menus from partnered businesses into one place so you can browse fast, then go support them in person.</p>
          <div className="cta">
            <a className="btn" href="/shop">Browse all</a>
            <a className="btn secondary" href="#how">How it works</a>
          </div>
        </div>
      </section>
      <FeaturedProducts products={products} />
    </main>
  );
}
