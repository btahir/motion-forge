import { useEffect, useId, useState, type ReactNode } from 'react';

export function NumberField({ label, value, onChange, min, max, step = 1, disabled = false }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  const [draft, setDraft] = useState(String(value)); const id = useId();
  useEffect(() => setDraft(String(Math.round(value * 1000) / 1000)), [value]);
  const commit = () => { const n = Number(draft); if (draft.trim() && Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n); setDraft(String(value)); };
  return <label className="mf-field" htmlFor={id}><span>{label}</span><input id={id} type="number" value={draft} disabled={disabled} min={min} max={max} step={step} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label>;
}
export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value); const id = useId(); useEffect(() => setDraft(value), [value]);
  return <label className="mf-field" htmlFor={id}><span>{label}</span><input id={id} value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => { onChange(draft); setDraft(value); }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/></label>;
}
export function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  const id = useId(); return <label className="mf-field" htmlFor={id}><span>{label}</span><select id={id} value={value} onChange={e => onChange(e.target.value)}>{children}</select></label>;
}
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const hex = /^#[\da-f]{6}$/i.test(value) ? value : /^#[\da-f]{3}$/i.test(value) ? '#' + value.slice(1).split('').map(c => c + c).join('') : '#000000';
  return <div className="mf-color"><input type="color" aria-label={`${label} picker`} value={hex} onChange={e => onChange(e.target.value)}/><TextField label={label} value={value} onChange={onChange}/></div>;
}
export function Icon({ name, size = 16 }: { name: 'play' | 'pause' | 'undo' | 'redo' | 'plus' | 'download' | 'upload' | 'eye' | 'hidden' | 'lock' | 'unlock' | 'trash' | 'diamond' | 'cursor' | 'fit'; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    play: <path d="m8 5 11 7-11 7Z"/>, pause: <path d="M8 5v14M16 5v14"/>, undo: <path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3"/>, redo: <path d="m16 4 5 5-5 5m5-5H11a7 7 0 0 0-7 7v3"/>, plus: <path d="M12 5v14M5 12h14"/>, download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>, upload: <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>, eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>, hidden: <><path d="m3 3 18 18M9 5a11 11 0 0 1 3 0c6 0 10 7 10 7a23 23 0 0 1-4 4M6 6a24 24 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1"/></>, lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>, unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></>, trash: <path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>, diamond: <path d="m12 3 9 9-9 9-9-9Z"/>, cursor: <path d="m5 3 14 10-7 1-3 7Z"/>, fit: <path d="M3 9V3h6m6 0h6v6m0 6v6h-6M9 21H3v-6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
