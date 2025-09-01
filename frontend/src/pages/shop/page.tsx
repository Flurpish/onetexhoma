// src/pages/shop/page.tsx
import { useEffect, useMemo, useState } from 'react';
import { cms } from '@/lib/cms';
import ProductCard from '@/components/ProductCard';
import Filters from '@/components/Filters';

type StrapiItem = { id: number; attributes: any };
type Norm = {
  id: number;
  raw: StrapiItem;
  title: string;                   // fallback applied
  primaryCategory: string | null;
  secondary: string[];
};

const dbg = (...a: any[]) => console.debug('[shop]', ...a);
const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

function normalize(item: StrapiItem): Norm {
  const a = item?.attributes ?? {};
  const rawTitle =
    a.title ??
    a.name ??
    a.productName ??
    a.label ??
    a?.sourceSnapshot?.jsonld?.name ??
    a?.sourceSnapshot?.inline?.name ??
    a?.sourceSnapshot?.css?.title ??
    '';
  const title = String(rawTitle || '').trim() || `Item #${item.id}`;

  const primaryCategory =
    (a.primaryCategory ??
      a.category ??
      a.mainCategory ??
      null) as string | null;

  const secFromRel: string[] =
    (a?.secondaryCategories?.data || [])
      .map((c: any) => c?.attributes?.name)
      .filter(Boolean);

  const secFromArray: string[] = Array.isArray(a?.secondaryCategoryNames)
    ? a.secondaryCategoryNames.filter((s: any) => typeof s === 'string')
    : [];

  return {
    id: item.id,
    raw: item,
    title,
    primaryCategory,
    secondary: uniq([...secFromRel, ...secFromArray]),
  };
}

export default function ShopPage() {
  const [rows, setRows] = useState<Norm[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [primarySel, setPrimarySel] = useState<string>('All');
  const [secondarySel, setSecondarySel] = useState<string>('All');

  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const qs = new URLSearchParams();
        qs.set('pagination[pageSize]', '200');
        qs.set('pagination[withCount]', 'false');
        qs.set('sort', 'title:asc');

        // Relations
        qs.set('populate[business]', 'true');
        qs.set('populate[secondaryCategories]', 'true');

        // Media fields (avoid "*")
        qs.append('populate[image][fields][0]', 'url');
        qs.append('populate[image][fields][1]', 'alternativeText');
        qs.append('populate[image][fields][2]', 'formats');

        // We need description (richtext) + price for rendering; no need to request fields explicitly
        const url = `/api/products?${qs.toString()}`;
        dbg('GET', url);

        const json = await cms<any>(url);
        const data: StrapiItem[] = Array.isArray(json?.data) ? json.data : [];
        const norm = data.map(normalize);

        dbg('fetched:', data.length);
        if (norm.length) dbg('first normalized:', norm[0]);

        if (!cancelled) setRows(norm);
      } catch (e) {
        if (!cancelled) {
          setErr('Could not load products.');
          console.error('[shop] fetch error', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Build dropdown options
  const primaryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.primaryCategory) s.add(r.primaryCategory);
    const arr = Array.from(s).sort();
    dbg('primaryOptions', arr);
    return arr;
  }, [rows]);

  const secondaryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) for (const n of r.secondary) s.add(n);
    const arr = Array.from(s).sort();
    dbg('secondaryOptions', arr);
    return arr;
  }, [rows]);

  // Apply filters (skip if both "All")
  const filtered = useMemo(() => {
    const skip = primarySel === 'All' && secondarySel === 'All';
    const out = skip
      ? rows
      : rows.filter((r) => {
          if (primarySel !== 'All' && r.primaryCategory !== primarySel) return false;
          if (secondarySel !== 'All' && !r.secondary.includes(secondarySel)) return false;
          return true;
        });

    dbg('filter stats → start:', rows.length, 'end:', out.length, {
      primarySel, secondarySel, skipped: skip,
    });

    return out;
  }, [rows, primarySel, secondarySel]);

  const apiReturnedZero = !loading && !err && rows.length === 0;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Menu</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">{filtered.length} items</span>
          <button
            type="button"
            onClick={() => setShowDebug(v => !v)}
            className="text-xs px-2 py-1 border rounded-md text-zinc-600 hover:bg-zinc-50"
          >
            Debug
          </button>
        </div>
      </div>

      {showDebug && (
        <div className="mb-4 text-xs rounded-lg border bg-zinc-50/60 p-3 text-zinc-700">
          <div className="grid md:grid-cols-3 gap-2">
            <div><b>Total from API:</b> {rows.length}</div>
            <div><b>Primary selected:</b> {primarySel}</div>
            <div><b>Secondary selected:</b> {secondarySel}</div>
          </div>
          <div className="mt-2">
            <b>First normalized:</b>
            <pre className="whitespace-pre-wrap break-words text-[11px] mt-1">
              {rows[0] ? JSON.stringify(rows[0], null, 2) : '(no data)'}
            </pre>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Filters */}
        <aside className="sm:w-64 shrink-0">
          <div className="mb-4">
            <Filters
              primary={primaryOptions}
              secondary={secondaryOptions}
              onChange={(p, s) => { setPrimarySel(p); setSecondarySel(s); }}
            />
          </div>
        </aside>

        {/* Grid */}
        <section className="flex-1">
          {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
          {loading && <p className="text-zinc-500">Loading…</p>}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((n) => (
              <ProductCard key={n.id} p={n.raw} />
            ))}
          </div>

          {!loading && !filtered.length && !err && (
            <p className="text-zinc-500 mt-8">
              {apiReturnedZero
                ? 'No products were returned by the API.'
                : 'No items match these filters.'}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
