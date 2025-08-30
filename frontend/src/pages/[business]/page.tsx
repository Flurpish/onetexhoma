import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cms } from '@/lib/cms';
import ProductCard from '@/components/ProductCard';

export default function PartnerPage() {
  const { business = '' } = useParams();
  const [page, setPage] = useState<any | null>(null);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: pages } = await cms<any>(`/api/custom-pages?filters[business][slug][$eq]=${business}&populate=deep`);
      const page = (pages || [])[0]; setPage(page || null);

      const { data: prods } = await cms<any>(`/api/products?filters[business][slug][$eq]=${business}&populate=image,secondaryCategories`);
      setProducts(prods || []);
    })();
  }, [business]);

  if (!page) return <main className="container" style={{ padding: '36px 0' }}>No page found.</main>;

  const a = page.attributes;
  return (
    <main>
      {a.heroImage?.data && <img style={{ width:'100%', height:240, objectFit:'cover' }} src={a.heroImage.data.attributes.url} alt={a.title} />}
      <section className="container" style={{ padding: '22px 0 36px' }}>
        <h1>{a.title}</h1>
        {a.heroBlurb && <p style={{ color: 'var(--muted)' }}>{a.heroBlurb}</p>}
        <div className="grid" style={{ marginTop: 12 }}>
          {products.map((p:any)=> <ProductCard key={p.id} product={p} />)}
        </div>
      </section>
    </main>
  );
}
