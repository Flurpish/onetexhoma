import { useEffect, useState } from 'react';
import { endpoints } from '@/lib/cms';
import ProductCard from '@/components/ProductCard';

type Row = any; // we pass the whole product to the card (faster first paint)

export default function ShopPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string|null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);

        // Ask for the fields needed to render + image/business; keep it v5-friendly.
        const qs = new URLSearchParams();
        qs.set('sort', 'title:asc');
        qs.set('pagination[pageSize]', '100');

        // attributes we actually use (keep these so "real product" filter works server-side helper)
        qs.append('fields[0]', 'title');
        qs.append('fields[1]', 'slug');
        qs.append('fields[2]', 'price');
        qs.append('fields[3]', 'currency');
        qs.append('fields[4]', 'primaryCategory');
        qs.append('fields[5]', 'productUrl');
        qs.append('fields[6]', 'productImageUrl');
        qs.append('fields[7]', 'description');

        // relations/media (1 level)
        qs.append('populate[business][fields][0]', 'name');
        qs.append('populate[business][fields][1]', 'slug');
        qs.append('populate[image][fields][0]', 'url');
        qs.append('populate[image][fields][1]', 'alternativeText');
        qs.append('populate[image][fields][2]', 'width');
        qs.append('populate[image][fields][3]', 'height');

        // Include drafts + published (drafts win, only "real" products kept)
        const { data } = await endpoints.products.list(qs.toString(), 'any');

        console.log('[shop] items:', data?.length ?? 0);
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('[shop] error', e);
        setErr('Could not load products.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-100">Menu</h1>
        {!loading && <span className="text-sm text-zinc-500">{rows.length} items</span>}
      </div>

      {err && <p className="mb-3 text-sm text-red-500">{err}</p>}
      {loading && <p className="text-zinc-500">Loading…</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {rows.map((r) => (
          <ProductCard key={(r?.documentId || r?.id) as string} p={r} />
        ))}
      </div>

      {!loading && !err && rows.length === 0 && (
        <p className="mt-8 text-zinc-500">No products available.</p>
      )}
    </main>
  );
}
