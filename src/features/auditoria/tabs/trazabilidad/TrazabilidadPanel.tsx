'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, TableProperties, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Search } from 'lucide-react';
import type { AuditEntry, SubTipo, OperacionEntry, ProductoError } from '../../types';

/* ─── helpers de fecha ────────────────────────────────── */
const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function parseDate(fecha: string) {
  if (fecha.includes('/')) {
    const [d, m, y] = fecha.split('/');
    return { dia: (d ?? '01').padStart(2,'0'), mes: (m ?? '01').padStart(2,'0'), año: y ?? '' };
  }
  const [y, m, d] = fecha.split('-');
  return { dia: (d ?? '01').padStart(2,'0'), mes: (m ?? '01').padStart(2,'0'), año: y ?? '' };
}

function entryDate(e: AuditEntry): Date {
  const { año, mes, dia } = parseDate(e.fecha);
  return new Date(`${año}-${mes}-${dia}`);
}

/* ─── detección de operación de un producto ──────────── */
function detectOpSubTipo(producto: ProductoError, operaciones: OperacionEntry[]): SubTipo | null {
  if (!producto.operacionCod) return null;
  return operaciones.find(o => o.codigo === producto.operacionCod)?.subTipo ?? null;
}

function productoLabel(p: ProductoError, operaciones: OperacionEntry[]): string {
  const sub = detectOpSubTipo(p, operaciones);
  const prefix = sub ? `[${sub.toUpperCase()}] ` : '';
  const code = `[${p.codigo}] ${p.nombre}`;
  return `${prefix}${code}`;
}

function unidadesLabel(p: ProductoError): string {
  return p.cantidadEsperada != null ? `${p.unidades}/${p.cantidadEsperada}` : `${p.unidades}`;
}

/* ─── expansión por picker ────────────────────────────── */
type PickerRow = {
  picker: string;
  opsMap: Partial<Record<SubTipo, string>>;
  pallets: number;
};

function expandByPicker(e: AuditEntry): PickerRow[] {
  const map = new Map<string, Partial<Record<SubTipo, string>>>();

  for (const op of (e.operaciones ?? [])) {
    const pk = op.pickerNombre?.trim() || e.pickerNombre?.trim() || e.picker || '—';
    if (!map.has(pk)) map.set(pk, {});
    map.get(pk)![op.subTipo] = op.codigo || '—';
  }

  if (map.size === 0) return [{ picker: e.pickerNombre || e.picker || '—', opsMap: {}, pallets: e.pallets }];
  if (map.size === 1) {
    const [[pk, opsMap]] = [...map.entries()];
    return [{ picker: pk, opsMap, pallets: e.pallets }];
  }

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

/* ─── tipos de orden ──────────────────────────────────── */
type SortKey = 'fecha_desc' | 'fecha_asc' | 'picker_az' | 'picker_za' | 'resultado_malo' | 'resultado_bueno';

const SORT_LABELS: Record<SortKey, string> = {
  fecha_desc:    'Fecha ↓ (reciente)',
  fecha_asc:     'Fecha ↑ (antigua)',
  picker_az:     'Responsable A→Z',
  picker_za:     'Responsable Z→A',
  resultado_malo:'Malo primero',
  resultado_bueno:'Bueno primero',
};

/* ─── columnas ────────────────────────────────────────── */
const COLS = [
  { key: 'n',         label: 'N°',           w: 48  },
  { key: 'fecha',     label: 'Fecha',         w: 96  },
  { key: 'mes',       label: 'Mes',           w: 110 },
  { key: 'año',       label: 'Año',           w: 60  },
  { key: 'resp',      label: 'Responsable',   w: 150 },
  { key: 'tienda',    label: 'Tienda',        w: 88  },
  { key: 'comida',    label: 'Comida',        w: 160 },
  { key: 'aseo',      label: 'Aseo',          w: 160 },
  { key: 'hogar',     label: 'Hogar',         w: 160 },
  { key: 'pallets',   label: 'Pallets',       w: 72  },
  { key: 'errores',   label: 'Errores',       w: 72  },
  { key: 'productos', label: 'Cód. Producto', w: 240 },
  { key: 'unidades',  label: 'Unidades',      w: 100 },
  { key: 'corr',      label: 'Corrección',    w: 100 },
  { key: 'resultado', label: 'Resultado',     w: 90  },
  { key: 'obs',       label: 'Observaciones', w: 200 },
];

const CORR_ES: Record<string, string> = {
  correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante',
};

/* ─── componente ──────────────────────────────────────── */
export function TrazabilidadPanel({
  onBack, history, onRefresh,
}: { onBack: () => void; history: AuditEntry[]; onRefresh: () => void }) {
  const [refreshing,  setRefreshing]  = useState(false);
  const [sortBy,      setSortBy]      = useState<SortKey>('fecha_desc');
  const [showSort,    setShowSort]    = useState(false);
  const [filtroAño,   setFiltroAño]   = useState('');
  const [filtroMes,   setFiltroMes]   = useState('');
  const [busqueda,    setBusqueda]    = useState('');

  const años = useMemo(() => {
    const s = new Set<string>();
    history.forEach(e => s.add(parseDate(e.fecha).año));
    return [...s].filter(Boolean).sort().reverse();
  }, [history]);

  const mesesDisponibles = useMemo(() => {
    const s = new Set<string>();
    history.forEach(e => {
      const { año, mes } = parseDate(e.fecha);
      if (!filtroAño || año === filtroAño) s.add(mes);
    });
    return [...s].filter(Boolean).sort();
  }, [history, filtroAño]);

  const flatRows = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    let entries = history.filter(e => {
      const { año, mes } = parseDate(e.fecha);
      if (filtroAño && año !== filtroAño) return false;
      if (filtroMes && mes !== filtroMes) return false;
      if (q) {
        const hay = [e.pickerNombre, e.picker, e.tiendaCod, e.tiendaNombre, e.auditor]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    entries = entries.slice().sort((a, b) => {
      switch (sortBy) {
        case 'fecha_desc': return entryDate(b).getTime() - entryDate(a).getTime();
        case 'fecha_asc':  return entryDate(a).getTime() - entryDate(b).getTime();
        case 'picker_az':  return (a.pickerNombre || a.picker || '').localeCompare(b.pickerNombre || b.picker || '');
        case 'picker_za':  return (b.pickerNombre || b.picker || '').localeCompare(a.pickerNombre || a.picker || '');
        case 'resultado_malo':  return a.resultado === b.resultado ? 0 : a.resultado === 'malo' ? -1 : 1;
        case 'resultado_bueno': return a.resultado === b.resultado ? 0 : a.resultado === 'bueno' ? -1 : 1;
        default: return 0;
      }
    });

    const result: Array<{ n: number; row: PickerRow; entry: AuditEntry; isFirstOfEntry: boolean }> = [];
    entries.forEach((e, entryIdx) => {
      const pickerRows = expandByPicker(e);
      pickerRows.forEach((row, i) => {
        result.push({ n: entries.length - entryIdx, row, entry: e, isFirstOfEntry: i === 0 });
      });
    });
    return result;
  }, [history, filtroAño, filtroMes, busqueda, sortBy]);

  const totalMinWidth = COLS.reduce((s, c) => s + c.w, 0);

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-border"
        style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>

        {/* Fila 1: título + acciones */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={onBack} className="border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg">
            <ChevronLeft size={22} />
          </button>
          <TableProperties size={18} className="text-navy flex-shrink-0" />
          <span className="font-barlow-condensed text-[20px] font-bold text-navy flex-1">Trazabilidad</span>

          {/* Orden */}
          <div className="relative">
            <button
              onClick={() => setShowSort(s => !s)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn border border-border text-[12px] text-text-2 font-semibold cursor-pointer active:bg-bg bg-white">
              <ArrowUpDown size={13} />
              Ordenar
            </button>
            {showSort && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-border rounded-card shadow-xl overflow-hidden min-w-[180px]">
                {(Object.keys(SORT_LABELS) as SortKey[]).map(k => (
                  <button key={k} onClick={() => { setSortBy(k); setShowSort(false); }}
                    className={`w-full text-left px-3 py-2 text-[12px] cursor-pointer transition-colors hover:bg-bg ${sortBy === k ? 'font-bold text-navy bg-[rgba(26,37,80,0.05)]' : 'text-text-2'}`}>
                    {SORT_LABELS[k]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }}
            className={`border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw size={16} />
          </button>
          <span className="text-[11px] text-text-3 whitespace-nowrap">{flatRows.length} fil.</span>
        </div>

        {/* Fila 2: filtros */}
        <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
          {/* Búsqueda */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[140px] max-w-[220px] bg-bg border border-border rounded-btn px-2 py-1.5">
            <Search size={13} className="text-text-3 flex-shrink-0" />
            <input
              type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Picker, tienda…"
              className="flex-1 bg-transparent outline-none text-[12px] text-text placeholder:text-text-3" />
          </div>

          {/* Año */}
          <select value={filtroAño} onChange={e => { setFiltroAño(e.target.value); setFiltroMes(''); }}
            className="text-[12px] bg-bg border border-border rounded-btn px-2 py-1.5 outline-none focus:border-navy cursor-pointer">
            <option value="">Todos los años</option>
            {años.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Mes */}
          <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
            className="text-[12px] bg-bg border border-border rounded-btn px-2 py-1.5 outline-none focus:border-navy cursor-pointer">
            <option value="">Todos los meses</option>
            {mesesDisponibles.map(m => (
              <option key={m} value={m}>{MESES_ES[parseInt(m) - 1]}</option>
            ))}
          </select>

          {/* Limpiar filtros */}
          {(filtroAño || filtroMes || busqueda) && (
            <button onClick={() => { setFiltroAño(''); setFiltroMes(''); setBusqueda(''); }}
              className="text-[11px] text-red font-semibold border-none bg-transparent cursor-pointer px-1">
              × Limpiar
            </button>
          )}

          {/* Indicador de orden activo */}
          <span className="ml-auto text-[10px] text-text-3 flex items-center gap-1">
            {sortBy.includes('asc') ? <ArrowUp size={10} /> : sortBy.includes('desc') ? <ArrowDown size={10} /> : null}
            {SORT_LABELS[sortBy]}
          </span>
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="flex-1 overflow-auto" onClick={() => showSort && setShowSort(false)}>
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
            {flatRows.map(({ n, row, entry: e, isFirstOfEntry }, idx) => {
              const { dia, mes, año } = parseDate(e.fecha);
              const mesNombre = MESES_ES[parseInt(mes) - 1] ?? mes;
              const isGood = e.resultado === 'bueno';
              const errCount = e.productos?.length ?? 0;
              const bgClass = idx % 2 === 0 ? 'bg-white' : 'bg-[rgba(26,37,80,0.018)]';
              const borderClass = !isFirstOfEntry
                ? 'border-t border-dashed border-border/40'
                : 'border-b border-border/40';

              const productosText = e.productos?.length
                ? e.productos.map(p => productoLabel(p, e.operaciones)).join(' | ')
                : '—';
              const unidadesText = e.productos?.length
                ? e.productos.map(p => unidadesLabel(p)).join(', ')
                : '—';

              return (
                <tr key={`${e.id}-${idx}`}
                  className={`${borderClass} ${bgClass} hover:bg-[rgba(26,37,80,0.04)] transition-colors`}>

                  {/* N° — solo primera fila del grupo */}
                  <td className="px-3 py-2 text-[11px] font-bold text-text-3 whitespace-nowrap">
                    {isFirstOfEntry ? n : ''}
                  </td>

                  {/* Fecha */}
                  <td className="px-3 py-2 text-[12px] font-mono text-text whitespace-nowrap">
                    {`${dia}/${mes}/${año}`}
                  </td>

                  {/* Mes */}
                  <td className="px-3 py-2 text-[12px] text-text whitespace-nowrap">{mesNombre}</td>

                  {/* Año */}
                  <td className="px-3 py-2 text-[12px] text-text whitespace-nowrap">{año}</td>

                  {/* Responsable */}
                  <td className="px-3 py-2 text-[12px] text-text" style={{ maxWidth: 150 }}>
                    <div className="truncate font-semibold">{row.picker}</div>
                  </td>

                  {/* Tienda — solo código */}
                  <td className="px-3 py-2 text-[12px] font-mono font-bold text-text whitespace-nowrap">
                    {e.tiendaCod}
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

                  {/* Pallets — proporcional al picker */}
                  <td className="px-3 py-2 text-[12px] text-center font-bold text-text">
                    {row.pallets}
                  </td>

                  {/* Errores */}
                  <td className="px-3 py-2 text-center">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${errCount > 0 ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'text-text-3'}`}>
                      {errCount}
                    </span>
                  </td>

                  {/* Código producto */}
                  <td className="px-3 py-2 text-[11px] text-text-2" style={{ maxWidth: 240 }}>
                    <div className="truncate" title={productosText}>{productosText}</div>
                  </td>

                  {/* Unidades */}
                  <td className="px-3 py-2 text-[11px] font-mono text-text-2 whitespace-nowrap">
                    {unidadesText}
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
