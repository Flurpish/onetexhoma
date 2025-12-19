import { useEffect, useState } from 'react';
import FeaturedProducts from '@/components/FeaturedProducts';
import { endpoints } from '@/lib/cms';

import logoUrl from '@/assets/onetexomalogo.png';
import coachingUrl from '@/assets/coachingcounceling.png';

type QuickLink = {
  href: string;
  title: string;
  sub: string;
  icon: string;
  tone: 'gold' | 'teal' | 'green';
  imageSrc?: string;
  imageFit?: 'cover' | 'contain';
  external?: boolean;
};

const QUICK_LINKS: QuickLink[] = [
  {
    href: '/faith',
    title: 'Faith',
    sub: 'Christian churches and support groups.',
    icon: '✝️',
    tone: 'gold',
  },
  {
    href: '/family-fun',
    title: 'Family Fun',
    sub: 'Family activities and things to do together.',
    icon: '👨‍👩‍👧‍👦',
    tone: 'teal',
  },
  {
    href: 'https://www.facebook.com/p/One-Texoma-61584696073997/?wtsid=rdr_0MV8bHV6sjXz5HExB&hr=1',
    title: 'Coaching & Counseling',
    sub: 'Coaching, counseling, and support services.',
    icon: '🧠',
    tone: 'green',
    imageSrc: coachingUrl,
    imageFit: 'cover',
    external: true,
  },
  {
    href: '/festivals',
    title: 'Festivals & Food Trucks',
    sub: 'Community events, gatherings, and local favorites.',
    icon: '🎉',
    tone: 'gold',
  },
  {
    href: '/bbq',
    title: 'BBQ',
    sub: 'BBQ spots, specials, and local smokehouse picks.',
    icon: '🔥',
    tone: 'teal',
  },
  {
    href: '/tacos',
    title: 'Tacos',
    sub: 'Taco joints, trucks, and must-try local picks.',
    icon: '🌮',
    tone: 'green',
  },
];

// ...keep your existing imports + QUICK_LINKS as-is

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams();
        qs.set('filters[business][isFeatured][$eq]', 'true');
        qs.set('pagination[pageSize]', '100');
        qs.set('sort', 'title:asc');

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

        const { data } = await endpoints.products.list(qs.toString(), 'any');
        const arr = Array.isArray(data) ? data.slice() : [];

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
    <main className="min-h-screen" style={{ backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundAttachment: 'fixed', backgroundPosition: 'center top' }}>
      {/* keep your intro section unchanged */}
      <section className="intro" style={{ backgroundRepeat: 'no-repeat', backgroundSize: 'cover', backgroundAttachment: 'fixed', backgroundPosition: 'center top' }}>
        <div className="container intro-grid">
          <div className="layer" data-tone="teal">
            <div className="layer-inner intro-card-inner">
              <span className="kicker">Christian Faith • Family • Unity</span>
              <h1>One Texoma</h1>
              <p>
                Explore faith communities, family-friendly activities, coaching & counseling, and local events—plus the
                best BBQ and tacos across our region.
              </p>

              <div className="cta">
                <a className="btn" href="#quick-links">View quick links</a>
                <a className="btn secondary" href="/shop">Browse featured</a>
              </div>
            </div>
          </div>

          <div className="layer" data-tone="gold">
            <div className="layer-inner hero-logo-inner">
              <img className="hero-logo" src={logoUrl} alt="One Texhoma logo" />
            </div>
          </div>
        </div>
      </section>

      
      <section id="links" className="container scroll-mt-24">
        <h2 className="section-title">Quick Links</h2>
        <p className="section-sub">Jump straight into what you’re looking for.</p>

        {/* BIG ROW BUTTONS */}
        <div className="mt-7 flex flex-col gap-8">
          {QUICK_LINKS.map((l, idx) => {
            const isExternal = !!l.external || /^https?:\/\//i.test(l.href);

            // Alternate only on md+; keep text-first on mobile
            const textSide = idx % 2 === 0 ? 'md:order-1' : 'md:order-2';
            const mediaSide = idx % 2 === 0 ? 'md:order-2' : 'md:order-1';

            const offsetBg =
              l.tone === 'gold'
                ? 'bg-[rgba(242,179,74,0.22)]'
                : l.tone === 'green'
                ? 'bg-[rgba(78,122,77,0.16)]'
                : 'bg-[rgba(17,135,167,0.16)]';

            return (
              <a
                key={`${l.href}-${idx}`}
                href={l.href}
                {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="group block mx-auto w-[min(80%,1180px)]"
              >
                <div className="relative isolate">
                  {/* offset layer behind */}
                  <div
                    className={[
                      'absolute inset-0 translate-x-3 translate-y-3 rounded-[26px] -z-10',
                      offsetBg,
                      'shadow-[0_18px_35px_rgba(11,47,58,0.10)]',
                      'transition-transform duration-200',
                      'group-hover:translate-x-4 group-hover:translate-y-4',
                    ].join(' ')}
                  />

                  {/* main surface */}
                  <div
                    className={[
                      'relative overflow-hidden rounded-[26px]',
                      'border border-[rgba(11,47,58,0.12)] bg-white/90',
                      'shadow-[0_18px_40px_rgba(11,47,58,0.14)]',
                      'transition duration-200',
                      'group-hover:-translate-y-1 group-hover:shadow-[0_26px_55px_rgba(11,47,58,0.18)]',
                      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(17,135,167,0.20)]',
                    ].join(' ')}
                  >
                    {/* 50/50 split, divider, and NO padding/background on image side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-[rgba(11,47,58,0.10)]">
                      {/* TEXT (fills height, centered vertically) */}
                      <div className={['order-1', textSide, 'p-8 md:p-12 flex flex-col justify-center'].join(' ')}>
                        <div className="text-[30px] md:text-[42px] font-black tracking-[-0.6px] text-[color:var(--brand)]">
                          {l.title}
                        </div>

                        <div className="mt-3 text-[15px] md:text-[18px] leading-relaxed text-[rgba(79,106,114,1)]">
                          {l.sub}
                        </div>

                        <div className="mt-7 inline-flex items-center gap-2 text-base font-extrabold text-[color:var(--brand)] opacity-90 group-hover:opacity-100">
                          Explore <span aria-hidden="true">→</span>
                        </div>
                      </div>

                      {/* MEDIA: flush to edge, no padding, full image visible */}
                      <div className={['order-2', mediaSide, 'relative'].join(' ')}>
                        {l.imageSrc ? (
                          <img
                            src={l.imageSrc}
                            alt={l.title}
                            className={['block w-full h-auto max-w-none', l.imageFit === 'cover' ? 'object-cover' : 'object-contain'].join(' ')}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="grid place-items-center min-h-[170px] md:min-h-[260px]">
                            <span className="text-[64px] md:text-[88px]" aria-hidden="true">
                              {l.icon}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </section>

      {/* ACTUAL QUICK LINKS (responsive grid, no horizontal scroll) */}
      <section id="quick-links" className="container scroll-mt-24 pb-20">
        <h2 className="section-title">Quick Links</h2>
        <p className="section-sub">Shortcuts to popular categories.</p>

        <div className="mt-8 mx-auto w-[min(80%,1180px)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-7">
            {QUICK_LINKS.map((l) => {
              const isExternal = !!l.external || /^https?:\/\//i.test(l.href);

              const chip =
                l.tone === 'gold'
                  ? 'bg-[rgba(242,179,74,0.12)] border-[rgba(242,179,74,0.22)]'
                  : l.tone === 'green'
                  ? 'bg-[rgba(78,122,77,0.10)] border-[rgba(78,122,77,0.18)]'
                  : 'bg-[rgba(17,135,167,0.10)] border-[rgba(17,135,167,0.18)]';

              return (
                <a
                  key={`mini-${l.href}`}
                  href={l.href}
                  {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className={[
                    'h-full',
                    'rounded-2xl border px-5 py-4',
                    'bg-white/70',
                    'shadow-[0_10px_18px_rgba(11,47,58,0.08)]',
                    'transition duration-150',
                    'hover:-translate-y-0.5 hover:shadow-[0_16px_26px_rgba(11,47,58,0.12)]',
                    chip,
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    

                    <div>
                      <div className="text-sm font-extrabold text-[color:var(--brand)]">{l.title}</div>
                      <div className="mt-1 text-xs leading-snug text-[rgba(79,106,114,1)]">{l.sub}</div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <FeaturedProducts products={products} />

    </main>
  );
}
