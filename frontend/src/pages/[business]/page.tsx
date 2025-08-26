// frontend/src/pages/[business]/page.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cms } from '@/lib/cms';

export default function PartnerPage() {
  const { business = '' } = useParams();
  const [page, setPage] = useState<any | null>(null);

  useEffect(() => {
    if (!business) return;
    (async () => {
      const { data: pages } = await cms<any>(`/api/custom-pages?filters[business][slug][$eq]=${business}&populate=deep`);
      setPage((pages || [])[0] || null);
    })();
  }, [business]);

  if (!page) return <div className="p-8">No page found.</div>;

  const a = page.attributes;
  return (
    <main>
      {a.heroImage?.data && (
        <img className="h-60 w-full object-cover" src={a.heroImage.data.attributes.url} alt={a.title} />
      )}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold">{a.title}</h1>
        {a.heroBlurb && <p className="mt-2 text-gray-600">{a.heroBlurb}</p>}
        {/* TODO: render blocks */}
      </section>
    </main>
  );
}
