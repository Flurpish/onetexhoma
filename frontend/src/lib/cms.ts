const API = import.meta.env.VITE_CMS_URL as string;
const TOKEN = import.meta.env.VITE_CMS_PUBLIC_TOKEN as string | undefined;

if (!API) console.warn('VITE_CMS_URL is not set');

export async function cms<T=any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...(init.headers as Record<string, string>),
  };
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`CMS ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}
