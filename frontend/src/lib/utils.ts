// utils.ts — small UI helpers
export function formatMoney(value?: number, currency = 'USD') {
  if (typeof value !== 'number') return '';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
  catch { return `$${value?.toFixed(2)}`; }
}
export function stripHtml(s?: string) {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, '');
}
