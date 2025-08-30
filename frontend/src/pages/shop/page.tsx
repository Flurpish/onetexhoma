import { useEffect, useMemo, useState } from 'react';
import { cms } from '@/lib/cms';
import Filters from '@/components/Filters';
import ProductCard from '@/components/ProductCard';

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await cms<any>('/api/products?populate=image,business,secondaryCategories&pagination[pageSize]=200');
      setProducts(data || []);
      setFiltered(data || []);
    })();
  }, []);

  const primary = useMemo(() => {
    const s = new Set<string>((products || []).map((p:any) => p.attributes?.primaryCategory || 'Other'));
    return Array.from(s);
  }, [products]);

  const secondary = useMemo(() => {
    const s = new Set<string>(
      (products || []).flatMap((p:any)=> (p.attributes?.secondaryCategories?.data || []).map((c:any)=> c.attributes?.name || ''))
    );
    s.delete('');
    return Array.from(s);
  }, [products]);

  const handleFilter = (p: string, s: string) => {
    let list = [...products];
    if (p !== 'All') list = list.filter((x:any)=> (x.attributes?.primaryCategory || 'Other') === p);
    if (s !== 'All') list = list.filter((x:any)=>{
      const cats = (x.attributes?.secondaryCategories?.data || []).map((c:any)=> c.attributes?.name);
      return cats.includes(s);
    });
    setFiltered(list);
  };

  return (
    <main className="container" style={{ padding: '26px 0 40px' }}>
      <h1 style={{ margin: '10px 0 8px' }}>The shop</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>Everything our partners are serving — updated as they update their menus.</p>

      <Filters primary={primary} secondary={secondary} onChange={handleFilter} />

      <div className="grid" style={{ marginTop: 12 }}>
        {filtered.map((p:any)=> <ProductCard key={p.id} product={p} />)}
      </div>
    </main>
  );
}
