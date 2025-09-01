import { useEffect, useState } from 'react';
import FeaturedProducts from '@/components/FeaturedProducts';
import { endpoints } from '@/lib/cms';

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        // Fetch products from featured businesses (draft + published), then shuffle top 12
        const qs = new URLSearchParams();
        qs.set('filters[business][isFeatured][$eq]', 'true');
        qs.set('pagination[pageSize]', '100');
        qs.set('sort', 'title:asc');

        // fields we display in FeaturedProducts/ProductCard
        qs.append('fields[0]', 'title');
        qs.append('fields[1]', 'slug');
        qs.append('fields[2]', 'price');
        qs.append('fields[3]', 'currency');
        qs.append('fields[4]', 'productUrl');
        qs.append('fields[5]', 'productImageUrl');
        qs.append('fields[6]', 'description');

        qs.append('populate[image][fields][0]', 'url');
        qs.append('populate[business][fields][0]', 'name');
        qs.append('populate[business][fields][1]', 'slug');

        const { data } = await endpoints.products.list(qs.toString(), 'any'); // includes drafts
        const arr = Array.isArray(data) ? data.slice() : [];

        // quick shuffle & pick 12
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        setProducts(arr.slice(0, 12));
      } catch (e) {
        console.error('[home] featured load error', e);
        setProducts([]);
      }
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
