import { useEffect, useState } from 'react';
import FeaturedProducts from '@/components/FeaturedProducts';
import { endpoints } from '@/lib/cms';

// ✅ Use a frontend asset file
// If your file is in src/assets/onetexomalogo.png, prefer this:
import logoUrl from '@/assets/onetexomalogo.png';
// If you truly need a relative path instead, it would look like:
// import logoUrl from '../assets/onetexomalogo.png';

const QUICK_LINKS = [
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
] as const;

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
    <main>
      {/* Bigger intro, layered overlap */}
      <section className="intro">
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
                <a className="btn" href="#quick-links">Explore quick links</a>
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

      {/* TravelOK-ish “cards” quick links */}
      <section id="quick-links" className="container">
        <h2 className="section-title">Quick Links</h2>
        <p className="section-sub">
          Jump straight into what you’re looking for.
        </p>

        <div className="feature-grid">
          {QUICK_LINKS.map((l) => (
            <a key={l.href} className="layer feature" data-tone={l.tone} href={l.href}>
              <div className="layer-inner feature-inner">
                <div className="feature-media">
                  <span className="feature-emoji" aria-hidden="true">{l.icon}</span>
                </div>

                <div className="feature-label">
                  <div className="feature-title">{l.title}</div>
                  <div className="feature-sub">{l.sub}</div>
                </div>

                <div className="feature-arrow" aria-hidden="true">→</div>
              </div>
            </a>
          ))}
        </div>
      </section>

      <FeaturedProducts products={products} />
    </main>
  );
}
