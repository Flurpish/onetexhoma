const RAW = (import.meta.env.VITE_CMS_URL || '').trim();
const API_BASE = RAW.replace(/\/+$/, ''); // strip trailing /

const TOKEN = import.meta.env.VITE_CMS_PUBLIC_TOKEN as string | undefined;

if (!API_BASE) {
  // Fail loud so you don't chase ghosts
  throw new Error(
    'VITE_CMS_URL is not set. Create frontend/.env with VITE_CMS_URL=http://localhost:1338 (or your deployed CMS URL), then restart Vite.'
  );
}

function join(base: string, path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/** Fetch JSON from Strapi and fail nicely if you accidentally hit HTML. */
export async function cms<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const url = join(API_BASE, path);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...(init.headers as Record<string, string>),
  };

  const res = await fetch(url, { ...init, headers });
  const ct = res.headers.get('content-type') || '';

  // Read text first so we can show helpful diagnostics when it's HTML
  const text = await res.text();

  if (!res.ok) {
    console.error('[cms] HTTP', res.status, res.statusText, 'URL:', url, 'Body:', text.slice(0, 300));
    throw new Error(`CMS ${res.status} ${res.statusText}`);
  }

  if (!/application\/json/i.test(ct)) {
    console.error(
      '[cms] Expected JSON but got',
      ct || 'unknown-content-type',
      'URL:',
      url,
      'First chars:',
      text.slice(0, 120)
    );
    throw new Error('CMS response is not JSON. Check VITE_CMS_URL, CORS, and your proxy settings.');
  }

  return JSON.parse(text) as T;
}

/** Make Strapi media URLs absolute. */
export function mediaURL(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  // Strapi returns media as /uploads/....
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export { API_BASE };
