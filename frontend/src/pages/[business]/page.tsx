import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { endpoints, mediaURL } from '@/lib/cms';
import ProductCard from '@/components/ProductCard';

type FlatCustomPage = {
  title: string;
  heroImage?: { url: string; alternativeText?: string | null };
  heroBlurb?: string | null;
  business?: { name?: string; slug?: string };
};

// v4->v5-ish normalizer for CustomPage
function normalizeCustomPage(item: any): FlatCustomPage | null {
  if (!item) return null;

  // Already flat (v5)
  if (!item.attributes) {
    const hero = item.heroImage?.url
      ? { url: mediaURL(item.heroImage.url), alternativeText: item.heroImage.alternativeText }
      : undefined;
    return {
      title: item.title,
      heroImage: hero,
      heroBlurb: item.heroBlurb ?? null,
      business: item.business ? { name: item.business.name, slug: item.business.slug } : undefined,
    };
  }

  // v4 format
  const a = item.attributes || {};
  const heroData = a.heroImage?.data?.attributes;
  const hero = heroData?.url
    ? { url: mediaURL(heroData.url), alternativeText: heroData.alternativeText }
    : undefined;
  const bizData = a.business?.data?.attributes;
  const business = bizData ? { name: bizData.name, slug: bizData.slug } : undefined;

  return {
    title: a.title,
    heroImage: hero,
    heroBlurb: a.heroBlurb ?? null,
    business,
  };
}

export default function PartnerPage() {
  const { business = '' } = useParams();
  const [page, setPage] = useState<FlatCustomPage | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 1) Custom page for this business (published only is fine here)
        const pagesJson: any = await endpoints.customPages.byBusinessSlug(business);
        const pagesArr = Array.isArray(pagesJson?.data) ? pagesJson.data : [];
        const first = pagesArr[0] ? normalizeCustomPage(pagesArr[0]) : null;
        if (!cancelled) setPage(first);

        // 2) Products for this business — include drafts + published (drafts win), only "real" products
        const qs = new URLSearchParams();
        qs.set('sort', 'title:asc');
        qs.set('pagination[pageSize]', '100');

        // fields we use in the grid + card
        qs.append('fields[0]', 'title');
        qs.append('fields[1]', 'slug');
        qs.append('fields[2]', 'price');
        qs.append('fields[3]', 'currency');
        qs.append('fields[4]', 'primaryCategory');
        qs.append('fields[5]', 'productUrl');
        qs.append('fields[6]', 'productImageUrl');
        qs.append('fields[7]', 'description');

        // filter by business slug
        qs.set('filters[business][slug][$eq]', business);

        // media/relations needed by the card
        qs.append('populate[business][fields][0]', 'name');
        qs.append('populate[business][fields][1]', 'slug');
        qs.append('populate[image][fields][0]', 'url');
        qs.append('populate[image][fields][1]', 'alternativeText');
        qs.append('populate[image][fields][2]', 'width');
        qs.append('populate[image][fields][3]', 'height');

        const { data: prods } = await endpoints.products.list(qs.toString(), 'any');
        if (!cancelled) setProducts(Array.isArray(prods) ? prods : []);
      } catch (e) {
        if (!cancelled) {
          setErr('Failed to load business page.');
          console.error('[partner] fetch error', e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [business]);

  const title = useMemo(() => page?.title || business || 'Business', [page, business]);
  const heroSrc = page?.heroImage?.url;

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="h-48 w-full animate-pulse rounded-2xl bg-zinc-100 md:h-56" />
        <div className="mt-6 h-6 w-48 animate-pulse rounded bg-zinc-100" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-zinc-100" />
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-56 w-full animate-pulse rounded-2xl border bg-white" />
          ))}
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm text-red-600">{err}</p>
      </main>
    );
  }

  if (!page) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-zinc-600">No page found.</p>
      </main>
    );
  }

  return (
    <main>
      {/* Hero */}
      {heroSrc && (
        <div className="relative h-48 w-full overflow-hidden md:h-56">
          <img
            src={heroSrc}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
        </div>
      )}

      {/* Content */}
      <section className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
          {page.heroBlurb && (
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">{page.heroBlurb}</p>
          )}
        </header>

        {/* Grid */}
        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p: any) => (
              <ProductCard key={(p?.documentId || p?.id) as string} p={p} />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-zinc-500">No products found for this partner.</p>
        )}
      </section>
    </main>
  );
}
