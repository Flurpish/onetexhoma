import { useEffect, useState } from 'react';

export default function Filters({
  primary,
  secondary,
  onChange,
}: {
  primary: string[];
  secondary: string[];
  onChange: (p: string, s: string) => void;
}) {
  const [p, setP] = useState('All');
  const [s, setS] = useState('All');

  // If options change and current selection disappears, reset safely.
  useEffect(() => {
    if (p !== 'All' && !primary.includes(p)) setP('All');
  }, [primary, p]);

  useEffect(() => {
    if (s !== 'All' && !secondary.includes(s)) setS('All');
  }, [secondary, s]);

  const apply = (np: string, ns: string) => {
    setP(np);
    setS(ns);
    onChange(np, ns);
  };

  const selectCls =
    "rounded-2xl border border-[rgba(11,47,58,0.14)] bg-white/80 px-3 py-2 text-sm font-semibold " +
    "text-[color:var(--text)] shadow-[0_10px_18px_rgba(11,47,58,0.06)] " +
    "focus:outline-none focus:ring-4 focus:ring-[rgba(17,135,167,0.26)]";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select value={p} onChange={(e) => apply(e.target.value, s)} className={selectCls}>
        {['All', ...primary].map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>

      <select value={s} onChange={(e) => apply(p, e.target.value)} className={selectCls}>
        {['All', ...secondary].map((v) => (
          <option key={v} value={v}>{v}</option>
        ))}
      </select>
    </div>
  );
}
