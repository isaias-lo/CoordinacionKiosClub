'use client';

import { useState, useMemo } from 'react';
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender,
  type ColumnDef, type SortingState, type ColumnFiltersState,
} from '@tanstack/react-table';
import { ChevronLeft, TableProperties, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react';
import type { AuditEntry, SubTipo, ProductoError } from '../../types';

/* ─── helpers de fecha ────────────────────────────────── */
const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function parseDate(fecha: string) {
  if (fecha.includes('/')) {
    const parts = fecha.split('/');
    const [d, m, y] = parts;
    return { dia: (d ?? '01').padStart(2,'0'), mes: (m ?? '01').padStart(2,'0'), año: y ?? '' };
  }
  const [y, m, d] = fecha.split('-');
  return { dia: (d ?? '01').padStart(2,'0'), mes: (m ?? '01').padStart(2,'0'), año: y ?? '' };
}

function entryDate(e: AuditEntry): Date {
  const { año, mes, dia } = parseDate(e.fecha);
  return new Date(`${año}-${mes}-${dia}`);
}

/* ─── expansión por picker ──────────────────────────────── */
type PickerRow = {
  picker: string;
  opsMap: Partial<Record<SubTipo, string>>;
  pallets: number;
  productos: ProductoError[];
};

function expandByPicker(e: AuditEntry): PickerRow[] {
  const map = new Map<string, Partial<Record<SubTipo, string>>>();
  for (const op of (e.operaciones ?? [])) {
    const pk = op.pickerNombre?.trim() || e.pickerNombre?.trim() || e.picker || '—';
    if (!map.has(pk)) map.set(pk, {});
    map.get(pk)![op.subTipo] = op.codigo || '—';
  }

  const todos = e.productos ?? [];

  if (map.size === 0) return [{ picker: e.pickerNombre || e.picker || '—', opsMap: {}, pallets: e.pallets, productos: todos }];
  if (map.size === 1) {
    const [[pk, opsMap]] = [...map.entries()];
    return [{ picker: pk, opsMap, pallets: e.pallets, productos: todos }];
  }

  const pickers = [...map.entries()];
  const opCounts = pickers.map(([, ops]) => Object.keys(ops).length);
  const totalOps = opCounts.reduce((a, b) => a + b, 0);

  const productosAsignados: ProductoError[][] = pickers.map(() => []);
  for (const prod of todos) {
    let asignado = false;
    if (prod.operacionCod) {
      const op = e.operaciones?.find(o => o.codigo === prod.operacionCod);
      if (op) {
        const idx = pickers.findIndex(([, opsMap]) => op.subTipo in opsMap);
        if (idx >= 0) { productosAsignados[idx].push(prod); asignado = true; }
      }
    }
    if (!asignado) productosAsignados[0].push(prod);
  }

  let remaining = e.pallets;
  return pickers.map(([pk, opsMap], i) => {
    const share = i === pickers.length - 1 ? remaining : Math.round(e.pallets * opCounts[i] / totalOps);
    remaining -= share;
    return { picker: pk, opsMap, pallets: Math.max(0, share), productos: productosAsignados[i] };
  });
}

/* ─── helpers de texto ────────────────────────────────── */
function unidadesLabel(p: ProductoError) {
  return p.cantidadEsperada != null ? `${p.unidades}/${p.cantidadEsperada}` : `${p.unidades}`;
}

const CORR_ES: Record<string, string> = {
  correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante',
};

/* ─── tipo de fila plana ───────────────────────────────── */
type FlatRow = {
  n: number;
  row: PickerRow;
  entry: AuditEntry;
  isFirstOfEntry: boolean;
  // campos "aplanados" para TanStack
  fecha: string;
  mesNombre: string;
  year: string;
  picker: string;
  tiendaCod: string;
  comida: string;
  aseo: string;
  hogar: string;
  pallets: number;
  errores: number;
  productos: string;
  unidades: string;
  correccion: string;
  resultado: string;
  observaciones: string;
  auditor: string;
  entryDateTs: number;
};

/* ─── sort icon helper ─────────────────────────────────── */
function SortIcon({ dir }: { dir: 'asc' | 'desc' | false }) {
  if (dir === 'asc') return <ChevronUp size={11} className="inline ml-0.5 text-navy" />;
  if (dir === 'desc') return <ChevronDown size={11} className="inline ml-0.5 text-navy" />;
  return <ChevronsUpDown size={11} className="inline ml-0.5 text-text-3 opacity-50" />;
}

/* ─── componente ──────────────────────────────────────── */
export function TrazabilidadPanel({
  onBack, history, onRefresh,
}: { onBack: () => void; history: AuditEntry[]; onRefresh: () => void }) {
  const [refreshing,       setRefreshing]       = useState(false);
  const [sorting,          setSorting]          = useState<SortingState>([{ id: 'entryDateTs', desc: true }]);
  const [filtroAño,        setFiltroAño]        = useState(() => {
    const años = [...new Set(history.map(e => parseDate(e.fecha).año))].filter(Boolean).sort();
    return años[años.length - 1] ?? '';
  });
  const [filtroMes,        setFiltroMes]        = useState('');
  const [filtroResultado,  setFiltroResultado]  = useState('');
  const [filtroCorr,       setFiltroCorr]       = useState('');
  const [busqueda,         setBusqueda]         = useState('');
  const [columnFilters,    setColumnFilters]    = useState<ColumnFiltersState>([]);

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

  // Construir filas planas con todos los campos para TanStack
  const flatRows: FlatRow[] = useMemo(() => {
    const q = busqueda.toLowerCase().trim();

    let entries = history.filter(e => {
      const { año, mes } = parseDate(e.fecha);
      if (filtroAño && año !== filtroAño) return false;
      if (filtroMes && mes !== filtroMes) return false;
      if (filtroResultado && e.resultado !== filtroResultado) return false;
      if (filtroCorr && e.correccion !== filtroCorr) return false;
      if (q) {
        const hay = [e.pickerNombre, e.picker, e.tiendaCod, e.tiendaNombre, e.auditor]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Ordenamos entries por fecha descendente antes de numerar
    entries = entries.slice().sort((a, b) => entryDate(b).getTime() - entryDate(a).getTime());

    const result: FlatRow[] = [];
    entries.forEach((e, i) => {
      const { dia, mes, año } = parseDate(e.fecha);
      const mesNombre = MESES_ES[parseInt(mes) - 1] ?? mes;
      expandByPicker(e).forEach((row, j) => {
        result.push({
          n: entries.length - i,
          row, entry: e,
          isFirstOfEntry: j === 0,
          fecha: `${dia}/${mes}/${año}`,
          mesNombre, year: año,
          picker: row.picker,
          tiendaCod: e.tiendaCod ?? '',
          comida: row.opsMap['comida'] ?? '—',
          aseo: row.opsMap['aseo'] ?? '—',
          hogar: row.opsMap['hogar'] ?? '—',
          pallets: row.pallets,
          errores: row.productos.length,
          productos: row.productos.length ? row.productos.map(p => `[${p.codigo}] ${p.nombre}`).join(' | ') : '—',
          unidades: row.productos.length ? row.productos.map(p => unidadesLabel(p)).join(', ') : '—',
          correccion: CORR_ES[e.correccion] ?? e.correccion,
          resultado: e.resultado ?? '',
          observaciones: e.observaciones || '—',
          auditor: e.auditor || '—',
          entryDateTs: entryDate(e).getTime(),
        });
      });
    });
    return result;
  }, [history, filtroAño, filtroMes, filtroResultado, filtroCorr, busqueda]);

  /* ─── column defs ──────────────────────────────────── */
  const columns = useMemo<ColumnDef<FlatRow>[]>(() => [
    { id: 'n',         header: 'N°',                   accessorKey: 'n',            size: 48,  enableSorting: false, cell: ({ row }) => row.original.isFirstOfEntry ? <span className="text-[11px] font-bold text-text-3">{row.original.n}</span> : '' },
    { id: 'fecha',     header: 'Fecha',                 accessorKey: 'fecha',        size: 96,  cell: ({ getValue }) => <span className="font-mono text-[12px]">{getValue() as string}</span> },
    { id: 'mes',       header: 'Mes',                   accessorKey: 'mesNombre',    size: 110 },
    { id: 'año',       header: 'Año',                   accessorKey: 'year',         size: 60  },
    { id: 'entryDateTs', header: '', accessorKey: 'entryDateTs', size: 0, enableHiding: true },
    { id: 'picker',    header: 'Responsable',           accessorKey: 'picker',       size: 150, cell: ({ getValue }) => <div className="truncate font-semibold text-[12px]" style={{ maxWidth: 150 }}>{getValue() as string}</div> },
    { id: 'tienda',    header: 'Tienda',                accessorKey: 'tiendaCod',    size: 88,  cell: ({ getValue }) => <span className="font-mono font-bold text-[12px]">{getValue() as string}</span> },
    { id: 'comida',    header: 'Comida',                accessorKey: 'comida',       size: 160, cell: ({ getValue }) => <span className="font-mono text-[11px] text-text-2">{getValue() as string}</span> },
    { id: 'aseo',      header: 'Aseo',                  accessorKey: 'aseo',         size: 160, cell: ({ getValue }) => <span className="font-mono text-[11px] text-text-2">{getValue() as string}</span> },
    { id: 'hogar',     header: 'Hogar',                 accessorKey: 'hogar',        size: 160, cell: ({ getValue }) => <span className="font-mono text-[11px] text-text-2">{getValue() as string}</span> },
    { id: 'pallets',   header: 'Pallets',               accessorKey: 'pallets',      size: 72,  cell: ({ getValue }) => <span className="text-[12px] font-bold text-text block text-center">{getValue() as number}</span> },
    { id: 'errores',   header: 'Errores',               accessorKey: 'errores',      size: 72,  cell: ({ getValue }) => {
        const v = getValue() as number;
        return v > 0
          ? <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(211,47,47,0.10)] text-red block text-center">{v}</span>
          : <span className="text-[11px] text-text-3 block text-center">0</span>;
      }
    },
    { id: 'productos', header: 'Cód. Producto',         accessorKey: 'productos',    size: 240, cell: ({ getValue }) => <div className="truncate text-[11px] text-text-2" style={{ maxWidth: 240 }} title={getValue() as string}>{getValue() as string}</div> },
    { id: 'unidades',  header: 'Unidades',              accessorKey: 'unidades',     size: 100, cell: ({ getValue }) => <span className="font-mono text-[11px] text-text-2">{getValue() as string}</span> },
    { id: 'corr',      header: 'Corrección',            accessorKey: 'correccion',   size: 100, cell: ({ getValue, row }) => {
        const v = getValue() as string;
        const e = row.original.entry;
        const color = e.correccion === 'correcto' ? 'text-success' : e.correccion === 'cruce' ? 'text-info' : 'text-red';
        return <span className={`text-[11px] font-semibold whitespace-nowrap ${color}`}>{v}</span>;
      }
    },
    { id: 'resultado', header: 'Resultado',             accessorKey: 'resultado',    size: 90,  cell: ({ getValue }) => {
        const v = getValue() as string;
        const isGood = v === 'bueno';
        return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isGood ? 'bg-[rgba(22,163,74,0.12)] text-success' : 'bg-[rgba(211,47,47,0.12)] text-red'}`}>{isGood ? '✓ BUENO' : '✗ MALO'}</span>;
      }
    },
    { id: 'obs',       header: 'Observaciones',         accessorKey: 'observaciones', size: 200, cell: ({ getValue }) => <div className="truncate text-[11px] text-text-2" style={{ maxWidth: 200 }}>{getValue() as string}</div> },
    { id: 'auditor',   header: 'Resp. Auditoría',       accessorKey: 'auditor',      size: 160, cell: ({ getValue }) => <div className="truncate font-semibold text-[12px]" style={{ maxWidth: 160 }}>{getValue() as string}</div> },
  ], []);

  const table = useReactTable({
    data: flatRows,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: { columnVisibility: { entryDateTs: false } },
  });

  const visibleRows = table.getRowModel().rows;
  const hayFiltros  = !!(filtroAño || filtroMes || filtroResultado || filtroCorr || busqueda);
  const totalMinWidth = columns.reduce((s, c) => s + (c.size ?? 0), 0);

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 bg-white border-b border-border" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>

        {/* Fila 1: título + refresh */}
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={onBack} className="border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg">
            <ChevronLeft size={22} />
          </button>
          <TableProperties size={18} className="text-navy flex-shrink-0" />
          <span className="font-barlow-condensed text-[20px] font-bold text-navy flex-1">Trazabilidad</span>
          <button
            onClick={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }}
            className={`border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg ${refreshing ? 'animate-spin' : ''}`}>
            <RefreshCw size={16} />
          </button>
          <span className="text-[11px] text-text-3 whitespace-nowrap">{visibleRows.length} fil.</span>
        </div>

        {/* Fila 2: filtros */}
        <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">

          {/* Búsqueda */}
          <div className="flex items-center gap-1.5 bg-bg border border-border rounded-btn px-2 py-1.5 min-w-[130px] max-w-[200px]">
            <Search size={13} className="text-text-3 flex-shrink-0" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Picker, tienda…"
              className="flex-1 bg-transparent outline-none text-[12px] text-text placeholder:text-text-3 min-w-0" />
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

          {/* Resultado */}
          <select value={filtroResultado} onChange={e => setFiltroResultado(e.target.value)}
            className="text-[12px] bg-bg border border-border rounded-btn px-2 py-1.5 outline-none focus:border-navy cursor-pointer">
            <option value="">Todos los resultados</option>
            <option value="bueno">✓ Bueno</option>
            <option value="malo">✗ Malo</option>
          </select>

          {/* Corrección */}
          <select value={filtroCorr} onChange={e => setFiltroCorr(e.target.value)}
            className="text-[12px] bg-bg border border-border rounded-btn px-2 py-1.5 outline-none focus:border-navy cursor-pointer">
            <option value="">Todas las correcciones</option>
            <option value="correcto">Correcto</option>
            <option value="faltante">Faltante</option>
            <option value="sobrante">Sobrante</option>
            <option value="cruce">Cruce</option>
          </select>

          {/* Limpiar */}
          {hayFiltros && (
            <button onClick={() => { setFiltroAño(''); setFiltroMes(''); setFiltroResultado(''); setFiltroCorr(''); setBusqueda(''); }}
              className="text-[11px] text-red font-semibold border-none bg-transparent cursor-pointer px-1">
              × Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: totalMinWidth }}>
          <thead className="sticky top-0 z-10">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(header => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  if (header.column.id === 'entryDateTs') return null;
                  return (
                    <th key={header.id}
                      style={{ width: header.getSize(), minWidth: header.getSize() }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      className={`px-3 py-2.5 text-left text-[10px] font-bold text-text-3 uppercase tracking-wide border-b border-border whitespace-nowrap bg-white select-none ${canSort ? 'cursor-pointer hover:text-navy' : ''}`}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort && <SortIcon dir={sortDir} />}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length - 1} className="py-16 text-center text-text-3 text-[13px]">
                  Sin registros para este período
                </td>
              </tr>
            )}
            {visibleRows.map((vRow, idx) => {
              const { isFirstOfEntry } = vRow.original;
              const bgClass = idx % 2 === 0 ? 'bg-white' : 'bg-[rgba(26,37,80,0.018)]';
              const borderClass = !isFirstOfEntry
                ? 'border-t border-dashed border-border/40'
                : 'border-b border-border/40';
              return (
                <tr key={vRow.id} className={`${borderClass} ${bgClass} hover:bg-[rgba(26,37,80,0.04)] transition-colors`}>
                  {vRow.getVisibleCells().map(cell => {
                    if (cell.column.id === 'entryDateTs') return null;
                    return (
                      <td key={cell.id} className="px-3 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
