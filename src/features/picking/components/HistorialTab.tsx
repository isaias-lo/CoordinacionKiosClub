'use client';

import { useState, useMemo, useCallback } from 'react';
import type { PickerGroup, PrintRecord, PickerNameChange } from '../picking-types';

const CAT_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  Comida: { bg: 'rgba(22,163,74,0.1)',   color: '#15803D', border: 'rgba(22,163,74,0.3)' },
  Aseo:   { bg: 'rgba(37,99,235,0.1)',   color: '#1D4ED8', border: 'rgba(37,99,235,0.3)' },
  Hogar:  { bg: 'rgba(217,119,6,0.1)',   color: '#92400E', border: 'rgba(217,119,6,0.3)' },
};

function CatPills({ cats }: { cats: string[] }) {
  if (!cats.length) return <span style={{ color: '#CBD5E1' }}>—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {cats.map(c => {
        const s = CAT_COLOR[c] ?? { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', border: 'rgba(107,114,128,0.2)' };
        return (
          <span key={c} className="px-1.5 py-0.5 rounded-full text-[11px] font-bold"
            style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
            {c}
          </span>
        );
      })}
    </span>
  );
}

interface Props {
  allGroups: PickerGroup[];
  nameChanges: PickerNameChange[];
  records: PrintRecord[];
  onRefresh: () => void;
}

export function HistorialTab({ allGroups, nameChanges, records, onRefresh }: Props) {
  const [loading, setLoading]   = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    onRefresh();
    setLoadedAt(new Date());
    setLoading(false);
  }, [onRefresh]);

  const catsByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const g of allGroups) {
      const cats = [...new Set(g.operations.flatMap(o => o.categories))].filter(Boolean);
      if (cats.length) map[g.stateKey] = cats;
    }
    return map;
  }, [allGroups]);

  const totalPallets  = records.reduce((s, r) => s + r.pallets, 0);
  const uniquePickers = new Set(records.map(r => r.picker_label)).size;
  const uniqueStores  = new Set(records.map(r => r.state_key.split('__')[0])).size;

  const byStore = useMemo(() => {
    const map: Record<string, { pallets: number; cats: Set<string> }> = {};
    for (const r of records) {
      const cod = r.state_key.split('__')[0];
      if (!map[cod]) map[cod] = { pallets: 0, cats: new Set() };
      map[cod].pallets += r.pallets;
      (catsByKey[r.state_key] ?? []).forEach(c => map[cod].cats.add(c));
    }
    return map;
  }, [records, catsByKey]);

  function exportHistorial() {
    if (!records.length) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = records.map((r, i) => {
      const hora   = new Date(r.printed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      const tienda = r.state_key.split('__')[0];
      const tipo   = r.tipo === 'C' ? 'Contenedor' : r.tipo === 'B' ? 'Bulto' : r.tipo === 'CH' ? 'Chocolate' : 'Pallet';
      const cats   = (catsByKey[r.state_key] ?? []).join(', ') || '—';
      return `<tr class="${i % 2 === 0 ? '' : 'alt'}">
<td class="mono">${hora}</td><td>${r.picker_label}</td>
<td class="mono">${tienda}</td><td>${cats}</td>
<td class="r">${r.pallets}</td><td>${tipo}</td></tr>`;
    }).join('');
    const storeRows = Object.entries(byStore).map(([cod, { pallets, cats }]) =>
      `<tr><td class="mono cod">${cod}</td><td>${[...cats].join(', ') || '—'}</td><td class="r big">${pallets}</td></tr>`
    ).join('');
    win.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><title>Historial del día — Picking</title>
<style>
@page{size:A4 landscape;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;font-size:13px;color:#111}
header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1B2A6B}
h1{font-size:20px;font-weight:900;color:#1B2A6B}.sub{font-size:12px;color:#666;margin-top:3px}
.meta{font-size:11px;color:#999;text-align:right;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:linear-gradient(135deg,#1B2A6B,#2563EB);color:#fff;padding:8px 10px;font-weight:700}
th.r,td.r{text-align:right}td{padding:7px 10px;border-bottom:1px solid #E5E7EB}
tr.alt td{background:#FAFBFF}
tfoot td{background:rgba(26,37,80,0.06)!important;font-weight:700;border-top:2px solid rgba(26,37,80,0.15);color:#1A2550}
.mono{font-family:monospace}.cod{font-weight:900;color:#1A2550}
.big{font-size:15px;font-weight:900;color:#1A2550}
h2{font-size:15px;font-weight:800;color:#1B2A6B;margin:18px 0 6px}
footer{margin-top:10px;font-size:10px;color:#999;text-align:right}
.print-btn{margin-top:14px;padding:8px 22px;background:#1B2A6B;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}
@media print{.print-btn{display:none}}
</style></head><body><header>
<div><h1>Historial del día — Picking</h1>
<div class="sub">${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
<div class="meta">Generado: ${new Date().toLocaleString('es-CL')}<br>${records.length} impresión${records.length !== 1 ? 'es' : ''} · ${totalPallets} pallets</div>
</header>
<table><thead><tr>
<th>Hora</th><th>Picker</th><th>Tienda</th><th>Contenido</th><th class="r">Pallets</th><th>Tipo</th>
</tr></thead><tbody>${rows}</tbody><tfoot><tr>
<td colspan="4"><strong>TOTAL</strong> · ${records.length} impresión${records.length !== 1 ? 'es' : ''} · ${uniquePickers} pickers · ${uniqueStores} tiendas</td>
<td class="r">${totalPallets}</td><td></td>
</tr></tfoot></table>
<h2>Resumen por tienda</h2>
<table><thead><tr><th>Tienda</th><th>Contenido</th><th class="r">Pallets</th></tr></thead>
<tbody>${storeRows}</tbody></table>
<footer>KiosClub · Exportado el ${new Date().toLocaleString('es-CL')}</footer>
<button class="print-btn" onclick="window.print()">🖨 Imprimir</button>
</body></html>`);
    win.document.close();
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: '#F0F2F5' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[16px] font-bold" style={{ color: '#1A2550' }}>Historial del día</div>
            {loadedAt && (
              <div className="text-[12px] mt-0.5" style={{ color: '#9CA3AF' }}>
                Actualizado: {loadedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} disabled={loading}
              className="text-[13px] font-semibold border rounded-full px-3 py-1.5 cursor-pointer transition-all disabled:opacity-40"
              style={{ borderColor: 'rgba(217,119,6,0.4)', color: '#D97706', background: 'rgba(217,119,6,0.06)' }}>
              {loading ? '⏳' : '↻ Actualizar'}
            </button>
            {records.length > 0 && (
              <button onClick={exportHistorial}
                className="text-[13px] font-bold px-3 py-1.5 rounded-full cursor-pointer"
                style={{ background: 'linear-gradient(135deg,#1B2A6B,#2563EB)', color: '#fff' }}>
                🖨 Exportar
              </button>
            )}
          </div>
        </div>
        {records.length > 0 && (
          <div className="flex gap-3 mt-3 flex-wrap">
            {([
              { label: 'Impresiones', value: records.length },
              { label: 'Pickers',     value: uniquePickers },
              { label: 'Tiendas',     value: uniqueStores },
              { label: 'Pallets',     value: totalPallets },
            ]).map(({ label, value }) => (
              <div key={label} className="text-center px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(26,37,80,0.06)', border: '1px solid rgba(26,37,80,0.1)' }}>
                <div className="text-[18px] font-black leading-tight" style={{ color: '#1A2550' }}>{value}</div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: '#9CA3AF' }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading && records.length === 0 ? (
          <div className="text-center py-16 text-[14px]" style={{ color: '#9CA3AF' }}>Cargando…</div>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-[52px] mb-3">📭</div>
            <div className="text-[16px] font-bold" style={{ color: '#6B7280' }}>Sin impresiones hoy</div>
            <div className="text-[13px] mt-1" style={{ color: '#9CA3AF' }}>Los registros aparecerán aquí cuando se impriman etiquetas</div>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(26,37,80,0.1)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg,#1B2A6B,#2563EB)', color: '#fff' }}>
                    <th className="text-left px-4 py-3 font-bold">Hora</th>
                    <th className="text-left px-4 py-3 font-bold">Picker</th>
                    <th className="text-left px-4 py-3 font-bold">Tienda</th>
                    <th className="text-left px-4 py-3 font-bold">Contenido</th>
                    <th className="text-right px-4 py-3 font-bold">Pallets</th>
                    <th className="text-center px-4 py-3 font-bold">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFF', borderBottom: '1px solid #F1F5F9' }}>
                      <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: '#9CA3AF' }}>
                        {new Date(r.printed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: '#1A2550' }}>{r.picker_label}</td>
                      <td className="px-4 py-2.5 font-mono font-bold" style={{ color: '#4B5563' }}>
                        {r.state_key.split('__')[0]}
                      </td>
                      <td className="px-4 py-2.5"><CatPills cats={catsByKey[r.state_key] ?? []} /></td>
                      <td className="px-4 py-2.5 text-right font-bold" style={{ color: '#1A2550' }}>{r.pallets}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            background: r.tipo === 'C' ? 'rgba(107,33,168,0.1)' : r.tipo === 'B' ? 'rgba(6,95,70,0.1)' : r.tipo === 'CH' ? 'rgba(120,53,15,0.1)' : 'rgba(30,58,138,0.1)',
                            color: r.tipo === 'C' ? '#6B21A8' : r.tipo === 'B' ? '#065F46' : r.tipo === 'CH' ? '#92400E' : '#1E3A8A',
                            border: `1px solid ${r.tipo === 'C' ? 'rgba(107,33,168,0.25)' : r.tipo === 'B' ? 'rgba(6,95,70,0.25)' : r.tipo === 'CH' ? 'rgba(120,53,15,0.25)' : 'rgba(30,58,138,0.2)'}`,
                          }}>
                          {r.tipo === 'C' ? 'Cont.' : r.tipo === 'B' ? 'Bulto' : r.tipo === 'CH' ? 'Choc.' : 'Pallet'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(26,37,80,0.06)', borderTop: '2px solid rgba(26,37,80,0.15)' }}>
                    <td className="px-4 py-3 font-bold" colSpan={4} style={{ color: '#1A2550' }}>
                      TOTAL · {records.length} impresión{records.length !== 1 ? 'es' : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-[15px]" style={{ color: '#1A2550' }}>{totalPallets}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-5 mb-2">
              <div className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9CA3AF' }}>Resumen por tienda</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {Object.entries(byStore).map(([cod, { pallets, cats }]) => (
                  <div key={cod} className="rounded-xl px-3 py-2.5"
                    style={{ background: '#fff', border: '1px solid rgba(26,37,80,0.1)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="font-mono font-black text-[15px]" style={{ color: '#1A2550' }}>{cod}</span>
                      <span className="font-black text-[20px] leading-none" style={{ color: '#1A2550' }}>{pallets}</span>
                    </div>
                    <div className="text-[10px] font-semibold mb-1.5" style={{ color: '#9CA3AF' }}>pallets</div>
                    <CatPills cats={[...cats]} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {nameChanges.length > 0 && (
          <div className="mt-5 mb-2">
            <div className="text-[12px] font-bold uppercase tracking-widest mb-2" style={{ color: '#9CA3AF' }}>Cambios de nombre · hoy</div>
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(26,37,80,0.1)', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg,#1B2A6B,#2563EB)', color: '#fff' }}>
                    <th className="text-left px-4 py-2.5 font-bold">Hora</th>
                    <th className="text-left px-4 py-2.5 font-bold">Picker</th>
                    <th className="text-left px-4 py-2.5 font-bold">Nombre anterior</th>
                    <th className="text-left px-4 py-2.5 font-bold">Nombre nuevo</th>
                    <th className="text-left px-4 py-2.5 font-bold">Modificado por</th>
                  </tr>
                </thead>
                <tbody>
                  {[...nameChanges].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()).map((c, i) => (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFBFF', borderBottom: '1px solid #F1F5F9' }}>
                      <td className="px-4 py-2 font-mono text-[11px]" style={{ color: '#9CA3AF' }}>
                        {new Date(c.changed_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-2 font-mono font-bold" style={{ color: '#1A2550' }}>{c.picker_key}</td>
                      <td className="px-4 py-2" style={{ color: '#9CA3AF' }}>{c.old_name || '—'}</td>
                      <td className="px-4 py-2 font-semibold" style={{ color: '#1A2550' }}>{c.new_name || '—'}</td>
                      <td className="px-4 py-2" style={{ color: '#4B5563' }}>{c.changed_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
