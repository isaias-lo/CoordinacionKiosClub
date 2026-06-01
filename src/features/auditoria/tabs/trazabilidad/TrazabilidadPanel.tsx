'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, TableProperties, RefreshCw } from 'lucide-react';
import type { AuditEntry, SubTipo } from '../../types';

export function TrazabilidadPanel({ onBack, history, onRefresh }: { onBack: () => void; history: AuditEntry[]; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [filtroMes, setFiltroMes] = useState('');

  const meses = useMemo(() => {
    const set = new Set<string>();
    history.forEach(e => {
      const parts = e.fecha.split('-');
      if (parts.length === 3) set.add(`${parts[0]}-${parts[1]}`);
      else {
        // formato dd/mm/yyyy
        const p2 = e.fecha.split('/');
        if (p2.length === 3) set.add(`${p2[2]}-${p2[1].padStart(2,'0')}`);
      }
    });
    return Array.from(set).sort().reverse();
  }, [history]);

  const rows = useMemo(() => {
    return history
      .filter(e => {
        if (!filtroMes) return true;
        const p = e.fecha.includes('-') ? e.fecha.split('-') : e.fecha.split('/').reverse();
        const ym = `${p[0]}-${(p[1] ?? '').padStart(2,'0')}`;
        return ym === filtroMes;
      })
      .slice().reverse(); // más recientes primero
  }, [history, filtroMes]);

  const parseDate = (fecha: string) => {
    if (fecha.includes('/')) {
      const [d, m, y] = fecha.split('/');
      return { dia: d, mes: m, año: y };
    }
    const [y, m, d] = fecha.split('-');
    return { dia: d, mes: m, año: y };
  };

  const MESES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const opCod = (e: AuditEntry, sub: SubTipo) =>
    e.operaciones?.find(o => o.subTipo === sub)?.codigo ?? '—';

  const productosCodes = (e: AuditEntry) =>
    e.productos?.map(p => `[${p.codigo}] ${p.nombre}`).join(', ') || '—';

  const errCount = (e: AuditEntry) => e.productos?.length ?? 0;

  const CORR_ES: Record<string, string> = {
    correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante'
  };

  const COLS = [
    { key: 'n',         label: 'N°',         w: 48 },
    { key: 'fecha',     label: 'Fecha',       w: 88 },
    { key: 'mes',       label: 'Mes',         w: 52 },
    { key: 'año',       label: 'Año',         w: 60 },
    { key: 'resp',      label: 'Responsable', w: 140 },
    { key: 'tienda',    label: 'Tienda',      w: 160 },
    { key: 'comida',    label: 'Comida',      w: 160 },
    { key: 'aseo',      label: 'Aseo',        w: 160 },
    { key: 'hogar',     label: 'Hogar',       w: 160 },
    { key: 'pallets',   label: 'Pallets',     w: 72 },
    { key: 'errores',   label: 'Errores',     w: 72 },
    { key: 'productos', label: 'Cód. producto',w: 220 },
    { key: 'corr',      label: 'Corrección',  w: 100 },
    { key: 'resultado', label: 'Resultado',   w: 90 },
    { key: 'obs',       label: 'Observaciones',w: 200 },
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-border" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
        <button onClick={onBack} className="border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg">
          <ChevronLeft size={22} />
        </button>
        <TableProperties size={18} className="text-navy flex-shrink-0" />
        <span className="font-barlow-condensed text-[20px] font-bold text-navy flex-1">Trazabilidad</span>
        <select
          value={filtroMes}
          onChange={e => setFiltroMes(e.target.value)}
          className="text-[12px] bg-bg border border-border rounded-btn px-2 py-1.5 outline-none focus:border-navy"
        >
          <option value="">Todos los meses</option>
          {meses.map(m => {
            const [y, mo] = m.split('-');
            return <option key={m} value={m}>{MESES_ES[parseInt(mo) - 1]} {y}</option>;
          })}
        </select>
        <button
          onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }}
          className={`border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg ${refreshing ? 'animate-spin' : ''}`}>
          <RefreshCw size={16} />
        </button>
        <span className="text-[11px] text-text-3">{rows.length} reg.</span>
      </div>

      {/* Tabla con scroll horizontal */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: COLS.reduce((s, c) => s + c.w, 0) }}>
          <thead className="sticky top-0 z-10 bg-white shadow-sm">
            <tr>
              {COLS.map(c => (
                <th key={c.key} style={{ width: c.w, minWidth: c.w }}
                  className="px-3 py-2.5 text-left text-[10px] font-bold text-text-3 uppercase tracking-wide border-b border-border whitespace-nowrap bg-white">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="py-16 text-center text-text-3 text-[13px]">
                  Sin registros para este período
                </td>
              </tr>
            )}
            {rows.map((e, idx) => {
              const { dia, mes, año } = parseDate(e.fecha);
              const mesNombre = MESES_ES[parseInt(mes) - 1] ?? mes;
              const isGood = e.resultado === 'bueno';
              return (
                <tr key={e.id} className={`border-b border-border/50 ${idx % 2 === 0 ? 'bg-white' : 'bg-bg/40'} hover:bg-[rgba(26,37,80,0.03)] transition-colors`}>
                  {/* N° */}
                  <td className="px-3 py-2 text-[11px] font-bold text-text-3 whitespace-nowrap">{rows.length - idx}</td>
                  {/* Fecha */}
                  <td className="px-3 py-2 text-[12px] font-mono text-text whitespace-nowrap">{dia}/{mes}/{año}</td>
                  {/* Mes */}
                  <td className="px-3 py-2 text-[12px] text-text whitespace-nowrap">{mesNombre}</td>
                  {/* Año */}
                  <td className="px-3 py-2 text-[12px] text-text whitespace-nowrap">{año}</td>
                  {/* Responsable */}
                  <td className="px-3 py-2 text-[12px] text-text" style={{ maxWidth: 140 }}>
                    <div className="truncate font-semibold">{e.pickerNombre || e.picker || '—'}</div>
                  </td>
                  {/* Tienda */}
                  <td className="px-3 py-2 text-[12px] text-text" style={{ maxWidth: 160 }}>
                    <div className="font-mono text-[10px] text-text-3">{e.tiendaCod}</div>
                    <div className="truncate font-semibold">{e.tiendaNombre}</div>
                  </td>
                  {/* Comida */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">{opCod(e, 'comida')}</td>
                  {/* Aseo */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">{opCod(e, 'aseo')}</td>
                  {/* Hogar */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">{opCod(e, 'hogar')}</td>
                  {/* Pallets */}
                  <td className="px-3 py-2 text-[12px] text-center font-bold text-text">{e.pallets}</td>
                  {/* Errores */}
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${errCount(e) > 0 ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'text-text-3'}`}>
                      {errCount(e) || '0'}
                    </span>
                  </td>
                  {/* Código producto */}
                  <td className="px-3 py-2 text-[11px] text-text-2" style={{ maxWidth: 220 }}>
                    <div className="truncate">{productosCodes(e)}</div>
                  </td>
                  {/* Corrección */}
                  <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                    <span className={`font-semibold ${e.correccion === 'correcto' ? 'text-success' : e.correccion === 'cruce' ? 'text-info' : 'text-red'}`}>
                      {CORR_ES[e.correccion] ?? e.correccion}
                    </span>
                  </td>
                  {/* Resultado */}
                  <td className="px-3 py-2">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isGood ? 'bg-[rgba(22,163,74,0.12)] text-success' : 'bg-[rgba(211,47,47,0.12)] text-red'}`}>
                      {isGood ? '✓ BUENO' : '✗ MALO'}
                    </span>
                  </td>
                  {/* Observaciones */}
                  <td className="px-3 py-2 text-[11px] text-text-2" style={{ maxWidth: 200 }}>
                    <div className="truncate">{e.observaciones || '—'}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
