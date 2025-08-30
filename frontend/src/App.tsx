import { Link, Outlet } from 'react-router-dom';

export default function AppLayout() {
  return (
    <>
      <header className="header">
        <div className="container nav">
          <Link to="/" className="brand">
            <span className="logo" />
            <span>Onetexhoma</span>
          </Link>
          <nav style={{ display: 'flex', gap: 16 }}>
            <Link to="/shop">Shop</Link>
            <a href="https://github.com" target="_blank" rel="noreferrer">Partners</a>
          </nav>
        </div>
      </header>
      <Outlet />
      <footer className="footer">
        <div className="container" style={{ display:'flex', justifyContent:'space-between', gap:16 }}>
          <span>© {new Date().getFullYear()} Onetexhoma</span>
          <span style={{ opacity:.8 }}>Made for food trucks • stay hungry</span>
        </div>
      </footer>
    </>
  );
}
