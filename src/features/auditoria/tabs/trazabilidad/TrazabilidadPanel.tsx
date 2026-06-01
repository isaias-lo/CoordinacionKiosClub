'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, TableProperties, RefreshCw } from 'lucide-react';
import type { AuditEntry, SubTipo } from '../../types';

/* ─── helpers de fecha ────────────────────────────────── */
const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function parseDate(fecha: string) {
  if (fecha.includes('/')) {
    const [d, m, y] = fecha.split('/');
    return { dia: d.padStart(2,'0'), mes: m.padStart(2,'0'), año: y };
  }
  const [y, m, d] = fecha.split('-');
  return { dia: (d ?? '01').padStart(2,'0'), mes: (m ?? '01').padStart(2,'0'), año: y };
}

function ymKey(fecha: string) {
  const { año, mes } = parseDate(fecha);
  return `${año}-${mes}`;
}

/* ─── lógica de expansión por picker ─────────────────── */
type PickerRow = {
  picker: string;
  opsMap: Partial<Record<SubTipo, string>>;
  pallets: number;
};

function expandByPicker(e: AuditEntry): PickerRow[] {
  // Agrupa operaciones por pickerNombre
  const map = new Map<string, Partial<Record<SubTipo, string>>>();

  for (const op of (e.operaciones ?? [])) {
    const pk = op.pickerNombre?.trim() || e.pickerNombre?.trim() || e.picker || '—';
    if (!map.has(pk)) map.set(pk, {});
    map.get(pk)![op.subTipo] = op.codigo || '—';
  }

  if (map.size === 0) {
    return [{ picker: e.pickerNombre || e.picker || '—', opsMap: {}, pallets: e.pallets }];
  }

  if (map.size === 1) {
    const [[pk, opsMap]] = [...map.entries()];
    return [{ picker: pk, opsMap, pallets: e.pallets }];
  }

  // Múltiples pickers: distribuir pallets proporcional a n° de operaciones
  const pickers = [...map.entries()];
  const opCounts = pickers.map(([, ops]) => Object.keys(ops).length);
  const totalOps = opCounts.reduce((a, b) => a + b, 0);

  let remaining = e.pallets;
  return pickers.map(([pk, opsMap], i) => {
    const share = i === pickers.length - 1
      ? remaining
      : Math.round(e.pallets * opCounts[i] / totalOps);
    remaining -= share;
    return { picker: pk, opsMap, pallets: Math.max(0, share) };
  });
}

/* ─── columnas ────────────────────────────────────────── */
const COLS = [
  { key: 'n',         label: 'N°',            w: 48  },
  { key: 'fecha',     label: 'Fecha',          w: 96  },
  { key: 'mes',       label: 'Mes',            w: 110 },
  { key: 'año',       label: 'Año',            w: 60  },
  { key: 'resp',      label: 'Responsable',    w: 150 },
  { key: 'tienda',    label: 'Tienda',         w: 90  },
  { key: 'comida',    label: 'Comida',         w: 160 },
  { key: 'aseo',      label: 'Aseo',           w: 160 },
  { key: 'hogar',     label: 'Hogar',          w: 160 },
  { key: 'pallets',   label: 'Pallets',        w: 72  },
  { key: 'errores',   label: 'Errores',        w: 72  },
  { key: 'productos', label: 'Cód. Producto',  w: 220 },
  { key: 'unidades',  label: 'Unidades',       w: 100 },
  { key: 'corr',      label: 'Corrección',     w: 100 },
  { key: 'resultado', label: 'Resultado',      w: 90  },
  { key: 'obs',       label: 'Observaciones',  w: 200 },
];

const CORR_ES: Record<string, string> = {
  correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante',
};

/* ─── componente ──────────────────────────────────────── */
export function TrazabilidadPanel({
  onBack, history, onRefresh,
}: { onBack: () => void; history: AuditEntry[]; onRefresh: () => void }) {
  const [refreshing, setRefreshing] = useState(false);
  const [filtroMes, setFiltroMes] = useState('');

  const meses = useMemo(() => {
    const set = new Set<string>();
    history.forEach(e => set.add(ymKey(e.fecha)));
    return [...set].sort().reverse();
  }, [history]);

  // Entradas filtradas → filas expandidas por picker
  const flatRows = useMemo(() => {
    const entries = history
      .filter(e => !filtroMes || ymKey(e.fecha) === filtroMes)
      .slice().reverse();

    let globalN = entries.length;
    const result: Array<{ n: number; row: PickerRow; entry: AuditEntry; isFirst: boolean; groupSize: number }> = [];

    for (const e of entries) {
      const pickerRows = expandByPicker(e);
      pickerRows.forEach((row, i) => {
        result.push({ n: globalN, row, entry: e, isFirst: i === 0, groupSize: pickerRows.length });
      });
      globalN--;
    }
    return result;
  }, [history, filtroMes]);

  const totalMinWidth = COLS.reduce((s, c) => s + c.w, 0);

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-border"
        style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
        <button onClick={onBack} className="border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg">
          <ChevronLeft size={22} />
        </button>
        <TableProperties size={18} className="text-navy flex-shrink-0" />
        <span className="font-barlow-condensed text-[20px] font-bold text-navy flex-1">Trazabilidad</span>

        <select
          value={filtroMes}
          onChange={e => setFiltroMes(e.target.value)}
          className="text-[12px] bg-bg border border-border rounded-btn px-2 py-1.5 outline-none focus:border-navy">
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
        <span className="text-[11px] text-text-3">{flatRows.length} fil.</span>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: totalMinWidth }}>
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
            {flatRows.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="py-16 text-center text-text-3 text-[13px]">
                  Sin registros para este período
                </td>
              </tr>
            )}
            {flatRows.map(({ n, row, entry: e, isFirst, groupSize }, idx) => {
              const { dia, mes, año } = parseDate(e.fecha);
              const mesNombre = MESES_ES[parseInt(mes) - 1] ?? mes;
              const isGood = e.resultado === 'bueno';
              const errCount = e.productos?.length ?? 0;
              const baseStyle = idx % 2 === 0 ? 'bg-white' : 'bg-bg/40';
              // Fila de segundo picker tiene borde superior suave
              const borderStyle = !isFirst && groupSize > 1 ? 'border-t border-dashed border-border/60' : 'border-b border-border/50';

              return (
                <tr key={`${e.id}-${idx}`}
                  className={`${borderStyle} ${baseStyle} hover:bg-[rgba(26,37,80,0.03)] transition-colors`}>

                  {/* N° — solo en primera fila del grupo */}
                  <td className="px-3 py-2 text-[11px] font-bold text-text-3 whitespace-nowrap">
                    {isFirst ? n : ''}
                  </td>

                  {/* Fecha — dd/mm/yyyy */}
                  <td className="px-3 py-2 text-[12px] font-mono text-text whitespace-nowrap">
                    {isFirst ? `${dia}/${mes}/${año}` : ''}
                  </td>

                  {/* Mes — nombre completo */}
                  <td className="px-3 py-2 text-[12px] text-text whitespace-nowrap">
                    {isFirst ? mesNombre : ''}
                  </td>

                  {/* Año */}
                  <td className="px-3 py-2 text-[12px] text-text whitespace-nowrap">
                    {isFirst ? año : ''}
                  </td>

                  {/* Responsable — picker de esta fila */}
                  <td className="px-3 py-2 text-[12px] text-text" style={{ maxWidth: 150 }}>
                    <div className="truncate font-semibold">{row.picker}</div>
                    {groupSize > 1 && (
                      <div className="text-[9px] text-text-3">{Object.keys(row.opsMap).join(' + ')}</div>
                    )}
                  </td>

                  {/* Tienda — solo código */}
                  <td className="px-3 py-2 text-[12px] font-mono font-bold text-text whitespace-nowrap">
                    {isFirst ? e.tiendaCod : ''}
                  </td>

                  {/* Comida */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">
                    {row.opsMap['comida'] ?? '—'}
                  </td>

                  {/* Aseo */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">
                    {row.opsMap['aseo'] ?? '—'}
                  </td>

                  {/* Hogar */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">
                    {row.opsMap['hogar'] ?? '—'}
                  </td>

                  {/* Pallets — proporcional a este picker */}
                  <td className="px-3 py-2 text-[12px] text-center font-bold text-text">
                    {row.pallets}
                  </td>

                  {/* Errores — solo en primera fila */}
                  <td className="px-3 py-2 text-center">
                    {isFirst ? (
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${errCount > 0 ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'text-text-3'}`}>
                        {errCount || '0'}
                      </span>
                    ) : ''}
                  </td>

                  {/* Código producto — solo en primera fila */}
                  <td className="px-3 py-2 text-[11px] text-text-2" style={{ maxWidth: 220 }}>
                    {isFirst ? (
                      <div className="truncate">
                        {e.productos?.length
                          ? e.productos.map(p => `[${p.codigo}] ${p.nombre}`).join(', ')
                          : '—'}
                      </div>
                    ) : ''}
                  </td>

                  {/* Unidades (faltante/sobrante) — solo en primera fila */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">
                    {isFirst ? (
                      e.productos?.length
                        ? e.productos.map(p =>
                            p.cantidadEsperada != null
                              ? `${p.unidades}/${p.cantidadEsperada}`
                              : `${p.unidades}`
                          ).join(', ')
                        : '—'
                    ) : ''}
                  </td>

                  {/* Corrección — solo en primera fila */}
                  <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                    {isFirst ? (
                      <span className={`font-semibold ${e.correccion === 'correcto' ? 'text-success' : e.correccion === 'cruce' ? 'text-info' : 'text-red'}`}>
                        {CORR_ES[e.correccion] ?? e.correccion}
                      </span>
                    ) : ''}
                  </td>

                  {/* Resultado — solo en primera fila */}
                  <td className="px-3 py-2">
                    {isFirst ? (
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isGood ? 'bg-[rgba(22,163,74,0.12)] text-success' : 'bg-[rgba(211,47,47,0.12)] text-red'}`}>
                        {isGood ? '✓ BUENO' : '✗ MALO'}
                      </span>
                    ) : ''}
                  </td>

                  {/* Observaciones — solo en primera fila */}
                  <td className="px-3 py-2 text-[11px] text-text-2" style={{ maxWidth: 200 }}>
                    {isFirst ? (
                      <div className="truncate">{e.observaciones || '—'}</div>
                    ) : ''}
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
