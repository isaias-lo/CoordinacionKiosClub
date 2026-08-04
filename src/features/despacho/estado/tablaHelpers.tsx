'use client';

import { useState } from 'react';

// Menú de filtro por columna estilo Excel/Sheets, compartido por el panel Estado/Registros.
// Las funciones puras de orden/comparación viven en tablaSort.ts (testeables sin JSX); se
// re-exportan aquí por comodidad para los consumidores.
export { DATE_COLS, dateMs, compareCells } from './tablaSort';

/** Menú de filtro por columna estilo Excel/Sheets (checkboxes + buscar valor). */
export function ColumnFilterMenu({ values, selected, onApply, onClose, accent }: {
  values: string[]; selected: string[];
  onApply: (vals: string[]) => void; onClose: () => void; accent: string;
}) {
  const [q, setQ] = useState('');
  // draft = valores marcados. Sin filtro activo (selected vacío) ⇒ todos marcados.
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected.length ? selected : values));

  const shown = q.trim() ? values.filter(v => v.toLowerCase().includes(q.toLowerCase())) : values;
  const allShownChecked = shown.length > 0 && shown.every(v => draft.has(v));
  const toggle = (v: string) => setDraft(prev => { const n = new Set(prev); n.has(v) ? n.delete(v) : n.add(v); return n; });
  const toggleAllShown = () => setDraft(prev => {
    const n = new Set(prev);
    if (allShownChecked) shown.forEach(v => n.delete(v)); else shown.forEach(v => n.add(v));
    return n;
  });
  const apply = () => {
    const all = values.length > 0 && values.every(v => draft.has(v));
    onApply(all ? [] : Array.from(draft)); // todos marcados ⇒ sin filtro
    onClose();
  };

  return (
    <div onClick={e => e.stopPropagation()}
      style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 232, background: '#fff',
        border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', zIndex: 40,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', textTransform: 'none', letterSpacing: 'normal' }}>
      <div style={{ padding: 8, borderBottom: '1px solid #F1F5F9' }}>
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar valor…"
          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 6, outline: 'none', color: '#0F172A' }} />
      </div>
      <button onClick={toggleAllShown}
        style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#334155', background: '#F8FAFC', border: 'none', borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}>
        {allShownChecked ? '☑' : '☐'} (Seleccionar todo)
      </button>
      <div style={{ maxHeight: 220, overflowY: 'auto' }}>
        {shown.map(v => (
          <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', fontSize: 12, color: '#1F2937', cursor: 'pointer' }}>
            <input type="checkbox" checked={draft.has(v)} onChange={() => toggle(v)} />
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v === '' ? '(vacío)' : v}</span>
          </label>
        ))}
        {shown.length === 0 && <div style={{ padding: 10, fontSize: 12, color: '#94A3B8' }}>Sin valores</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid #F1F5F9' }}>
        <button onClick={() => { onApply([]); onClose(); }}
          style={{ flex: 1, padding: 6, fontSize: 12, fontWeight: 700, color: '#64748B', background: '#F1F5F9', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Limpiar
        </button>
        <button onClick={apply}
          style={{ flex: 1, padding: 6, fontSize: 12, fontWeight: 700, color: '#fff', background: accent, border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          Aplicar
        </button>
      </div>
    </div>
  );
}
