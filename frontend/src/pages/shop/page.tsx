// src/pages/shop/page.tsx
import { useEffect, useMemo, useState } from 'react';
import { cms } from '@/lib/cms';
import ProductCard from '@/components/ProductCard';

type Item = { id: number; attributes: any };

export default function ShopPage() {
  const [all, setAll] = useState<Item[]>([]);
  const [biz, setBiz] = useState<string>('All');
  const [cat, setCat] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data } = await cms<any>(
          '/api/products?populate[image]=true&populate[business]=true&populate[secondaryCategories]=true&pagination[pageSize]=200'
        );
        setAll(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setErr('Could not load products.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // build unique lists
  const businesses = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) {
      const name = p?.attributes?.business?.data?.attributes?.name;
      if (name) s.add(name);
    }
    return ['All', ...Array.from(s).sort()];
  }, [all]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of all) {
      const secs = p?.attributes?.secondaryCategories?.data || [];
      secs.forEach((c: any) => c?.attributes?.name && s.add(c.attributes.name));
      const primary = p?.attributes?.primaryCategory;
      if (primary) s.add(primary);
    }
    return ['All', ...Array.from(s).sort()];
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((p) => {
      const a = p.attributes || {};
      const title = (a.title || '').trim();
      if (!title || /^untitled$/i.test(title)) return false;

      // business filter
      if (biz !== 'All') {
        const name = a.business?.data?.attributes?.name;
        if (name !== biz) return false;
      }

      // category filter
      if (cat !== 'All') {
        const primary = a.primaryCategory;
        const secs = (a.secondaryCategories?.data || []).map((c: any) => c.attributes?.name);
        if (primary !== cat && !secs.includes(cat)) return false;
      }

      return true;
    });
  }, [all, biz, cat]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row gap-6">
        {/* Filters */}
        <aside className="sm:w-60 shrink-0">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Business</label>
            <select
              value={biz}
              onChange={(e) => setBiz(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-white"
            >
              {businesses.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-500 mb-1">Category</label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm bg-white"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </aside>

        {/* Grid */}
        <section className="flex-1">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-xl font-bold">Menu</h1>
            <div className="text-sm text-zinc-500">{filtered.length} items</div>
          </div>

          {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
          {loading && <p className="text-zinc-500">Loading…</p>}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>

          {!loading && !filtered.length && !err && (
            <p className="text-zinc-500 mt-8">No items match these filters.</p>
          )}
        </section>
      </div>
    </main>
  );
}
