'use client';

import { useState, useMemo, useCallback } from 'react';
import { RotateCcw, Printer, Inbox } from 'lucide-react';
import type { PickerGroup, PrintRecord, PickerNameChange, PalletSlot } from '../picking-types';
import { TipoBadge } from './TipoBadge';
import { fmtHoraChile } from '@/lib/fechaChile';
import { escapeHtml } from '@/lib/escapeHtml';

const CAT_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  Comida: { bg: 'rgba(22,163,74,0.08)',  color: '#15803D', border: 'rgba(22,163,74,0.25)' },
  Aseo:   { bg: 'rgba(37,99,235,0.08)',  color: '#1D4ED8', border: 'rgba(37,99,235,0.25)' },
  Hogar:  { bg: 'rgba(217,119,6,0.08)',  color: '#92400E', border: 'rgba(217,119,6,0.25)' },
};

function CatPills({ cats }: { cats: string[] }) {
  if (!cats.length) return <span style={{ color: '#CBD5E1' }}>—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {cats.map(c => {
        const s = CAT_COLOR[c] ?? { bg: 'rgba(107,114,128,0.08)', color: '#6B7280', border: 'rgba(107,114,128,0.2)' };
        return (
          <span key={c} className="px-1.5 py-0.5 rounded text-[11px] font-semibold"
            style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
            {c}
          </span>
        );
      })}
    </span>
  );
}


interface Props {
  allGroups:   PickerGroup[];
  nameChanges: PickerNameChange[];
  records:     PrintRecord[];
  palletSlots: PalletSlot[];
  onRefresh:   () => void;
}

export function HistorialTab({ allGroups, nameChanges, records, palletSlots, onRefresh }: Props) {
  const [loading,  setLoading]  = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    onRefresh();
    setLoadedAt(new Date());
    setLoading(false);
  }, [onRefresh]);

  // Categorías por state_key desde los grupos de Odoo
  const catsByKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const g of allGroups) {
      const cats = [...new Set(g.operations.flatMap(o => o.categories))].filter(Boolean);
      if (cats.length) map[g.stateKey] = cats;
    }
    return map;
  }, [allGroups]);

  // Pallets y bultos reales por state_key desde picking_pallets
  const unitsByKey = useMemo(() => {
    const map: Record<string, { pallets: number; bultos: number; tipos: string[] }> = {};
    for (const s of palletSlots) {
      if (!map[s.state_key]) map[s.state_key] = { pallets: 0, bultos: 0, tipos: [] };
      if (s.tipo === 'P') map[s.state_key].pallets++;
      if (s.tipo === 'B') map[s.state_key].bultos++;
      if (!map[s.state_key].tipos.includes(s.tipo)) map[s.state_key].tipos.push(s.tipo);
    }
    return map;
  }, [palletSlots]);

  const totalPallets  = useMemo(() => Object.values(unitsByKey).reduce((s, u) => s + u.pallets, 0), [unitsByKey]);
  const totalBultos   = useMemo(() => Object.values(unitsByKey).reduce((s, u) => s + u.bultos,  0), [unitsByKey]);
  const uniquePickers = new Set(records.map(r => r.picker_label)).size;
  const uniqueStores  = new Set(records.map(r => r.state_key.split('__')[0])).size;

  // Resumen por tienda
  const byStore = useMemo(() => {
    const map: Record<string, { pallets: number; bultos: number; cats: Set<string> }> = {};
    for (const r of records) {
      const cod = r.state_key.split('__')[0];
      if (!map[cod]) map[cod] = { pallets: 0, bultos: 0, cats: new Set() };
      const u = unitsByKey[r.state_key];
      map[cod].pallets += u?.pallets ?? 0;
      map[cod].bultos  += u?.bultos  ?? 0;
      (catsByKey[r.state_key] ?? []).forEach(c => map[cod].cats.add(c));
    }
    return map;
  }, [records, catsByKey, unitsByKey]);

  function exportHistorial() {
    if (!records.length) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = records.map((r, i) => {
      const hora    = fmtHoraChile(r.printed_at);
      const tienda  = escapeHtml(r.state_key.split('__')[0]);
      const u       = unitsByKey[r.state_key];
      const tipos   = u?.tipos ?? [r.tipo];
      const tipotxt = tipos.map(t => t === 'B' ? 'Bulto' : t === 'C' ? 'Contenedor' : t === 'CH' ? 'Chocolate' : 'Pallet').join(' + ');
      const cats    = escapeHtml((catsByKey[r.state_key] ?? []).join(', ') || '—');
      const reimpr = (r.print_count ?? 1) > 1 ? ` ×${r.print_count}` : '';
      return `<tr class="${i % 2 === 0 ? '' : 'alt'}">
<td class="mono">${hora}</td><td>${escapeHtml(r.picker_label)}</td>
<td class="mono">${tienda}</td><td class="mono">${escapeHtml((r.batch || '—') + reimpr)}</td><td>${cats}</td>
<td class="r">${u?.pallets ?? 0}</td><td class="r">${u?.bultos ?? 0}</td><td>${escapeHtml(tipotxt)}</td></tr>`;
    }).join('');
    const storeRows = Object.entries(byStore).map(([cod, { pallets, bultos, cats }]) =>
      `<tr><td class="mono cod">${escapeHtml(cod)}</td><td>${escapeHtml([...cats].join(', ') || '—')}</td><td class="r big">${pallets}</td><td class="r big">${bultos}</td></tr>`
    ).join('');
    win.document.write(`<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><title>Historial del día — Picking</title>
<style>
@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;font-size:13px;color:#111}
header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #1E293B}
h1{font-size:20px;font-weight:900;color:#1E293B}.sub{font-size:12px;color:#666;margin-top:3px}
.meta{font-size:11px;color:#999;text-align:right;line-height:1.6}
table{width:100%;border-collapse:collapse;font-size:12px}
th{background:#1E293B;color:#fff;padding:8px 10px;font-weight:700;text-align:left}
th.r,td.r{text-align:right}td{padding:7px 10px;border-bottom:1px solid #E2E8F0}
tr.alt td{background:#F8FAFC}
tfoot td{background:rgba(15,23,42,0.04)!important;font-weight:700;border-top:2px solid #E2E8F0;color:#1E293B}
.mono{font-family:monospace}.cod{font-weight:900;color:#1E293B}
.big{font-size:15px;font-weight:900;color:#1E293B}
h2{font-size:15px;font-weight:800;color:#1E293B;margin:18px 0 6px}
footer{margin-top:10px;font-size:10px;color:#999;text-align:right}
.print-btn{margin-top:14px;padding:8px 22px;background:#1E293B;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer}
@media print{.print-btn{display:none}}
</style></head><body><header>
<div><h1>Historial del día — Picking</h1>
<div class="sub">${new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
<div class="meta">Generado: ${new Date().toLocaleString('es-CL')}<br>${records.length} impresión${records.length !== 1 ? 'es' : ''} · ${totalPallets} pallets · ${totalBultos} bultos</div>
</header>
<table><thead><tr>
<th>Hora</th><th>Picker</th><th>Tienda</th><th>Batch</th><th>Contenido</th><th class="r">Pallets</th><th class="r">Bultos</th><th>Tipo</th>
</tr></thead><tbody>${rows}</tbody><tfoot><tr>
<td colspan="5"><strong>TOTAL</strong> · ${records.length} impresión${records.length !== 1 ? 'es' : ''} · ${uniquePickers} pickers · ${uniqueStores} tiendas</td>
<td class="r">${totalPallets}</td><td class="r">${totalBultos}</td><td></td>
</tr></tfoot></table>
<h2>Resumen por tienda</h2>
<table><thead><tr><th>Tienda</th><th>Contenido</th><th class="r">Pallets</th><th class="r">Bultos</th></tr></thead>
<tbody>${storeRows}</tbody></table>
<footer>KiosClub · Exportado el ${new Date().toLocaleString('es-CL')}</footer>
<button class="print-btn" onclick="window.print()">Imprimir</button>
</body></html>`);
    win.document.close();
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[15px] font-semibold" style={{ color: '#1E293B' }}>Historial del día</div>
            {loadedAt && (
              <div className="text-[12px] mt-0.5" style={{ color: '#94A3B8' }}>
                Actualizado: {loadedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} disabled={loading}
              className="flex items-center gap-1.5 text-[13px] font-medium border rounded px-3 py-1.5 cursor-pointer disabled:opacity-40"
              style={{ borderColor: '#E2E8F0', color: '#64748B', background: '#fff' }}>
              <RotateCcw size={13} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            {records.length > 0 && (
              <button onClick={exportHistorial}
                className="flex items-center gap-1.5 text-[13px] font-medium px-3 py-1.5 rounded cursor-pointer"
                style={{ background: '#2563EB', color: '#fff', border: 'none' }}>
                <Printer size={13} />
                Exportar
              </button>
            )}
          </div>
        </div>

        {records.length > 0 && (
          <div className="flex gap-2.5 mt-3 flex-wrap">
            {[
              { label: 'Impresiones', value: records.length },
              { label: 'Pickers',     value: uniquePickers },
              { label: 'Tiendas',     value: uniqueStores },
              { label: 'Pallets',     value: totalPallets },
              { label: 'Bultos',      value: totalBultos },
            ].map(({ label, value }) => (
              <div key={label} className="text-center px-3 py-1.5 rounded"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                <div className="text-[17px] font-black leading-tight" style={{ color: '#1E293B' }}>{value}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: '#94A3B8' }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {records.length === 0 ? (
          <div className="text-center py-16">
            <Inbox size={40} className="mx-auto mb-3" style={{ color: '#64748B', opacity: 0.3 }} aria-hidden="true" />
            <div className="text-[15px] font-semibold" style={{ color: '#64748B' }}>Sin impresiones hoy</div>
            <div className="text-[13px] mt-1" style={{ color: '#94A3B8' }}>
              Los registros aparecerán aquí cuando se impriman etiquetas
            </div>
          </div>
        ) : (
          <>
            {/* Resumen por día (arriba, antes de la tabla) */}
            <div className="mt-4 mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>
                Resumen por día
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {Object.entries(byStore).map(([cod, { pallets, bultos, cats }]) => (
                  <div key={cod} className="rounded-xl px-3.5 py-3"
                    style={{ background: '#fff', border: '1.5px solid #CBD5E1', boxShadow: '0 2px 6px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)' }}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="font-mono font-black text-[14px]" style={{ color: '#1E293B' }}>{cod}</span>
                      <div className="flex items-baseline gap-1.5">
                        {pallets > 0 && (
                          <span className="font-black text-[16px] leading-none" style={{ color: '#1E40AF' }}>{pallets}<span className="text-[10px] font-semibold ml-0.5">P</span></span>
                        )}
                        {bultos > 0 && (
                          <span className="font-black text-[16px] leading-none" style={{ color: '#15803D' }}>{bultos}<span className="text-[10px] font-semibold ml-0.5">B</span></span>
                        )}
                      </div>
                    </div>
                    <CatPills cats={[...cats]} />
                  </div>
                ))}
              </div>
            </div>

            {/* Tabla principal */}
            <div className="mt-4 rounded overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
                <caption className="sr-only">Impresiones del día</caption>
                <thead>
                  <tr style={{ background: '#1E293B', color: '#fff' }}>
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-[12px]">Hora</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-[12px]">Picker</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-[12px]">Tienda</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-[12px]">Batch</th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-[12px]">Contenido</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold text-[12px]">Pallets</th>
                    <th scope="col" className="text-right px-4 py-3 font-semibold text-[12px]">Bultos</th>
                    <th scope="col" className="text-center px-4 py-3 font-semibold text-[12px]">Impr.</th>
                    <th scope="col" className="text-center px-4 py-3 font-semibold text-[12px]">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, i) => {
                    const u    = unitsByKey[r.state_key];
                    const tipos = u?.tipos ?? [r.tipo];
                    return (
                      <tr key={r.state_key + r.printed_at} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                        <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: '#94A3B8' }}>
                          {fmtHoraChile(r.printed_at)}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[13px]" style={{ color: '#1E293B' }}>
                          {r.picker_label}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-[12px]" style={{ color: '#475569' }}>
                          {r.state_key.split('__')[0]}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: r.batch ? '#6D28D9' : '#CBD5E1' }}>
                          {r.batch || '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <CatPills cats={catsByKey[r.state_key] ?? []} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-[13px]" style={{ color: '#1E40AF' }}>
                          {u?.pallets ?? 0}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-[13px]" style={{ color: '#15803D' }}>
                          {u?.bultos ?? 0}
                        </td>
                        <td className="px-4 py-2.5 text-center text-[12px] font-bold"
                          style={{ color: (r.print_count ?? 1) > 1 ? '#B45309' : '#94A3B8' }}>
                          {(r.print_count ?? 1) > 1 ? `↻ ×${r.print_count}` : '×1'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <TipoBadge tipos={tipos} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                    <td className="px-4 py-3 font-semibold text-[12px]" colSpan={5} style={{ color: '#475569' }}>
                      TOTAL · {records.length} impresión{records.length !== 1 ? 'es' : ''} · {uniquePickers} pickers · {uniqueStores} tiendas
                    </td>
                    <td className="px-4 py-3 text-right font-black text-[14px]" style={{ color: '#1E40AF' }}>{totalPallets}</td>
                    <td className="px-4 py-3 text-right font-black text-[14px]" style={{ color: '#15803D' }}>{totalBultos}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

          </>
        )}

        {/* Cambios de nombre */}
        {nameChanges.length > 0 && (
          <div className="mt-5 mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: '#94A3B8' }}>
              Cambios de nombre · hoy
            </div>
            <div className="rounded overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                <caption className="sr-only">Cambios de nombre del día</caption>
                <thead>
                  <tr style={{ background: '#1E293B', color: '#fff' }}>
                    <th scope="col" className="text-left px-4 py-2.5 font-semibold text-[11px]">Hora</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-semibold text-[11px]">Picker</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-semibold text-[11px]">Nombre anterior</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-semibold text-[11px]">Nombre nuevo</th>
                    <th scope="col" className="text-left px-4 py-2.5 font-semibold text-[11px]">Modificado por</th>
                  </tr>
                </thead>
                <tbody>
                  {[...nameChanges]
                    .sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime())
                    .map((c, i) => (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                        <td className="px-4 py-2 font-mono text-[11px]" style={{ color: '#94A3B8' }}>
                          {fmtHoraChile(c.changed_at)}
                        </td>
                        <td className="px-4 py-2 font-mono font-bold text-[12px]" style={{ color: '#1E293B' }}>{c.picker_key}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: '#94A3B8' }}>{c.old_name || '—'}</td>
                        <td className="px-4 py-2 font-semibold text-[12px]" style={{ color: '#1E293B' }}>{c.new_name || '—'}</td>
                        <td className="px-4 py-2 text-[12px]" style={{ color: '#475569' }}>{c.changed_by_name || '—'}</td>
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
