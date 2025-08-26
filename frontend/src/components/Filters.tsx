// apps/web/components/Filters.tsx
'use client';
import { useState } from 'react';


export default function Filters({ primary, secondary }:{ primary:string[]; secondary:string[] }){
const [p, setP] = useState<string>('All');
const [s, setS] = useState<string>('All');
// In a full build, sync to router query params and filter server-side.
return (
<div className="flex flex-wrap items-center gap-3">
<Select label="Category" value={p} onChange={setP} options={["All", ...primary]} />
<Select label="Subcategory" value={s} onChange={setS} options={["All", ...secondary]} />
</div>
);
}


function Select({ label, value, onChange, options }:{label:string; value:string; onChange:(v:string)=>void; options:string[]}){
return (
<label className="text-sm">{label}
<select className="ml-2 rounded-xl border px-3 py-2" value={value} onChange={e=>onChange(e.target.value)}>
{options.map(o=> <option key={o}>{o}</option>)}
</select>
</label>
)
}