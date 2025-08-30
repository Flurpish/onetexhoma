import { useState } from 'react';

export default function Filters({
  primary, secondary, onChange
}: { primary: string[]; secondary: string[]; onChange: (p:string, s:string)=>void }) {
  const [p, setP] = useState('All');
  const [s, setS] = useState('All');

  const apply = (np:string, ns:string) => {
    setP(np); setS(ns); onChange(np, ns);
  };

  return (
    <div className="filters">
      <select className="select" value={p} onChange={(e)=>apply(e.target.value, s)}>
        {['All', ...primary].map(v => <option key={v} value={v}>{v}</option>)}
      </select>
      <select className="select" value={s} onChange={(e)=>apply(p, e.target.value)}>
        {['All', ...secondary].map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  );
}
