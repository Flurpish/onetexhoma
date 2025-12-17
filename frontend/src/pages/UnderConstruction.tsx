import logoUrl from '@/assets/onetexomalogo.png';

type Props = {
  title: string;
  subtitle?: string;
};

export default function UnderConstruction({ title, subtitle }: Props) {
  return (
    <main>
      <section className="intro">
        <div className="container intro-grid">
          <div className="layer" data-tone="teal">
            <div className="layer-inner intro-card-inner">
              <span className="kicker">Christian Faith • Family • Unity</span>
              <h1>{title}</h1>
              <p>
                {subtitle || 'This page is under construction!'}
              </p>

              <div className="cta">
                <a className="btn" href="/">
                  Back to Home
                </a>
                <a className="btn secondary" href="/#quick-links">
                  Explore Quick Links
                </a>
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
    </main>
  );
}
