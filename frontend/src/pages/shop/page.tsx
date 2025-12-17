import { useEffect, useMemo, useState } from 'react';
import { endpoints } from '@/lib/cms';
import ProductCard from '@/components/ProductCard';
import Filters from '@/components/Filters';

function getPrimaryCategory(r: any) {
  return (
    r?.primaryCategory ||
    r?.attributes?.primaryCategory ||
    ''
  );
}

function getBusinessName(r: any) {
  return (
    r?.business?.name ||
    r?.attributes?.business?.data?.attributes?.name ||
    ''
  );
}

export default function ShopPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [primaryFilter, setPrimaryFilter] = useState('All');
  const [secondaryFilter, setSecondaryFilter] = useState('All');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null);

        const qs = new URLSearchParams();
        qs.set('sort', 'title:asc');
        qs.set('pagination[pageSize]', '100');

        qs.append('fields[0]', 'title');
        qs.append('fields[1]', 'slug');
        qs.append('fields[2]', 'price');
        qs.append('fields[3]', 'currency');
        qs.append('fields[4]', 'primaryCategory');
        qs.append('fields[5]', 'productUrl');
        qs.append('fields[6]', 'productImageUrl');
        qs.append('fields[7]', 'description');

        qs.append('populate[business][fields][0]', 'name');
        qs.append('populate[business][fields][1]', 'slug');
        qs.append('populate[image][fields][0]', 'url');
        qs.append('populate[image][fields][1]', 'alternativeText');
        qs.append('populate[image][fields][2]', 'width');
        qs.append('populate[image][fields][3]', 'height');

        const { data } = await endpoints.products.list(qs.toString());
        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('[shop] error', e);
        setErr('Could not load products.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const primaryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = String(getPrimaryCategory(r) || '').trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  // Using business name as the “secondary” filter (works immediately)
  const secondaryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const v = String(getBusinessName(r) || '').trim();
      if (v) set.add(v);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const p = String(getPrimaryCategory(r) || '').trim();
      const b = String(getBusinessName(r) || '').trim();

      const okPrimary = primaryFilter === 'All' ? true : p === primaryFilter;
      const okSecondary = secondaryFilter === 'All' ? true : b === secondaryFilter;

      return okPrimary && okSecondary;
    });
  }, [rows, primaryFilter, secondaryFilter]);

  return (
    <main>
      {/* Title / intro section (matches your layered style) */}
      <section className="intro">
        <div className="container">
          <div className="layer" data-tone="teal">
            <div className="layer-inner intro-card-inner">
              <span className="kicker">Christian Faith • Family • Unity</span>
              <h1>Shop</h1>
              <p>
                Browse featured items from local businesses. Use the filters to narrow by category or vendor.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <Filters
                  primary={primaryOptions}
                  secondary={secondaryOptions}
                  onChange={(p, s) => { setPrimaryFilter(p); setSecondaryFilter(s); }}
                />

                {!loading && (
                  <div className="text-sm font-semibold text-[rgba(79,106,114,1)]">
                    {filteredRows.length} items
                    {filteredRows.length !== rows.length ? ` (of ${rows.length})` : ''}
                  </div>
                )}
              </div>

              {err && <p className="mt-3 text-sm font-semibold text-red-600">{err}</p>}
              {loading && <p className="mt-3 text-sm font-semibold text-[rgba(79,106,114,1)]">Loading…</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="container pb-10">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filteredRows.map((r) => (
            <ProductCard key={(r?.documentId || r?.id) as string} p={r} />
          ))}
        </div>

        {!loading && !err && filteredRows.length === 0 && (
          <p className="mt-8 text-[rgba(79,106,114,1)] font-semibold">No products match your filters.</p>
        )}
      </section>
    </main>
  );
}
