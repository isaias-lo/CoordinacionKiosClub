'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type PaginationState,
  type RowSelectionState,
} from '@tanstack/react-table';
import {
  RefreshCw, AlertTriangle, ChevronUp, ChevronDown,
  ChevronsUpDown, Search, X, ChevronRight, Bug, FileSpreadsheet,
  CheckCircle2, Package, ChevronLeft, Filter,
} from 'lucide-react';
import { getOdooConfig } from '@/features/auditoria/utils/odooApi';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/components/AuthProvider';
import SkuModal from './components/SkuModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CruceRow {
  activityId:        number;
  pickingId:         number;
  pickingName:       string;
  storeCod:          string;
  responsableArmado: string;
  fechaArmado:       string;
  fechaDeclaracion:  string | null;
  detalle:           string;
  movAjuste:         string;
  origin:            string;
  state:             string;
  auditado:          'SI' | 'NO';
  auditorName:       string;
  estado:            'COMPLETADO' | 'VENCIDA' | 'PLANIFICADO';
}

interface ManualRow {
  picking_name:         string;
  correcta_declaracion: string;
  movimiento_ajuste:    string;
}

type TableRow = CruceRow & {
  correcta_declaracion: string;
  movimiento_ajuste:    string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Badge sub-components ─────────────────────────────────────────────────────

function StoreCodBadge({ cod }: { cod: string }) {
  return (
    <span style={{
      fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
      background: 'rgba(37,99,235,0.25)', color: '#93C5FD',
      borderRadius: 4, padding: '2px 7px', display: 'inline-block',
    }}>{cod}</span>
  );
}

function DetalleBadge({ detalle }: { detalle: string }) {
  if (!detalle) return <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>;
  const u = detalle.toUpperCase();
  let bg = 'rgba(255,255,255,0.1)', color = 'rgba(255,255,255,0.7)';
  if (u.includes('FALTANTE'))      { bg = 'rgba(220,38,38,0.85)';  color = '#fff'; }
  else if (u.includes('SOBRANTE')) { bg = 'rgba(217,119,6,0.85)';  color = '#fff'; }
  else if (u.includes('MERMA'))    { bg = 'rgba(146,64,14,0.85)';  color = '#fff'; }
  return (
    <span style={{
      background: bg, color, borderRadius: 4, padding: '2px 8px',
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{u}</span>
  );
}

function AuditadoBadge({ value }: { value: 'SI' | 'NO' }) {
  return (
    <span style={{
      background: value === 'SI' ? 'rgba(22,163,74,0.85)' : 'rgba(220,38,38,0.85)',
      color: '#fff', borderRadius: 4, padding: '2px 10px',
      fontSize: 11, fontWeight: 700, display: 'inline-block',
    }}>{value}</span>
  );
}

function EstadoBadge({ estado }: { estado: 'COMPLETADO' | 'VENCIDA' | 'PLANIFICADO' }) {
  const styles: Record<string, { bg: string; color: string }> = {
    COMPLETADO:  { bg: 'rgba(22,163,74,0.85)',  color: '#fff' },
    VENCIDA:     { bg: 'rgba(220,38,38,0.85)',  color: '#fff' },
    PLANIFICADO: { bg: 'rgba(217,119,6,0.85)',  color: '#fff' },
  };
  const s = styles[estado] ?? { bg: 'rgba(100,116,139,0.4)', color: 'rgba(255,255,255,0.6)' };
  return (
    <span style={{
      background: s.bg, color: s.color, borderRadius: 4, padding: '2px 8px',
      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{estado}</span>
  );
}

function IndeterminateCheckbox({
  checked, indeterminate, onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref} type="checkbox"
      checked={checked} onChange={onChange}
      style={{ accentColor: '#6EE7B7', cursor: 'pointer', width: 14, height: 14 }}
    />
  );
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' | false }) {
  if (direction === 'asc')  return <ChevronUp   size={12} style={{ flexShrink: 0 }} />;
  if (direction === 'desc') return <ChevronDown size={12} style={{ flexShrink: 0 }} />;
  return <ChevronsUpDown size={11} style={{ flexShrink: 0, opacity: 0.3 }} />;
}

// ─── Celda editable ───────────────────────────────────────────────────────────

function EditableCell({ value, onSave, placeholder, monospace }: {
  value: string; onSave: (v: string) => void;
  placeholder?: string; monospace?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (local !== value) onSave(local);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter')  commit();
          if (e.key === 'Escape') { setLocal(value); setEditing(false); }
        }}
        style={{
          background: 'rgba(59,130,246,0.2)',
          border: '1px solid rgba(59,130,246,0.6)',
          borderRadius: 4, color: '#fff', padding: '2px 6px',
          fontSize: 12, width: '100%', outline: 'none',
          fontFamily: monospace ? 'monospace' : 'inherit',
        }}
        placeholder={placeholder}
      />
    );
  }
  return (
    <span
      onClick={() => setEditing(true)}
      title="Click para editar"
      style={{
        cursor: 'pointer', display: 'block', padding: '2px 4px', borderRadius: 4,
        fontFamily: monospace ? 'monospace' : 'inherit', fontSize: 12,
        color: local ? '#fff' : 'rgba(255,255,255,0.25)',
        borderBottom: '1px dashed rgba(255,255,255,0.18)', minWidth: 60,
      }}
    >{local || placeholder || '—'}</span>
  );
}

// ─── Dropdown corrección ──────────────────────────────────────────────────────

const CORR_OPTS = ['PENDIENTE', 'SI', 'NO', 'EN REVISIÓN'];

function corrDecBg(v: string): { bg: string; color: string } {
  const u = v.toUpperCase();
  if (u === 'SI')          return { bg: 'rgba(22,163,74,0.85)',   color: '#fff' };
  if (u === 'NO')          return { bg: 'rgba(220,38,38,0.85)',   color: '#fff' };
  if (u.includes('REVIS')) return { bg: 'rgba(217,119,6,0.85)',   color: '#fff' };
  return { bg: 'rgba(100,116,139,0.45)', color: 'rgba(255,255,255,0.6)' };
}

function CorrDropdown({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const c = corrDecBg(value);
  return (
    <select
      value={value}
      onChange={e => onSave(e.target.value)}
      style={{
        background: c.bg, color: c.color, border: 'none', borderRadius: 4,
        fontSize: 11, fontWeight: 700, padding: '2px 6px',
        cursor: 'pointer', textAlign: 'center', width: '100%',
      }}
    >
      {CORR_OPTS.map(o => (
        <option key={o} value={o} style={{ background: '#1e293b', color: '#fff' }}>{o}</option>
      ))}
    </select>
  );
}

// ─── Filter Select ────────────────────────────────────────────────────────────

function FilterSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const active = value !== '';
  return (
    <label style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      <span style={{
        color: active ? '#6EE7B7' : 'rgba(255,255,255,0.35)',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: active ? 'rgba(22,163,74,0.18)' : 'rgba(255,255,255,0.07)',
          border: active ? '1px solid rgba(22,163,74,0.45)' : '1px solid rgba(255,255,255,0.12)',
          borderRadius: 5, color: active ? '#6EE7B7' : 'rgba(255,255,255,0.7)',
          padding: '4px 7px', fontSize: 11, outline: 'none', cursor: 'pointer',
        }}
      >
        <option value="" style={{ background: '#1e293b', color: '#fff' }}>Todos</option>
        {options.map(o => (
          <option key={o} value={o} style={{ background: '#1e293b', color: '#fff' }}>{o}</option>
        ))}
      </select>
      {active && (
        <button
          onClick={() => onChange('')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 0, display: 'flex' }}
        >
          <X size={10} />
        </button>
      )}
    </label>
  );
}

// ─── Date defaults ────────────────────────────────────────────────────────────

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ControlCruceContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  const [rows,          setRows]          = useState<CruceRow[]>([]);
  const [manualMap,     setManualMap]     = useState<Record<string, ManualRow>>({});
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [controlUser,   setControlUser]   = useState('Control Interno');
  const [savingKey,     setSavingKey]     = useState('');
  const [dateFrom,      setDateFrom]      = useState(defaultDateFrom);
  const [dateTo,        setDateTo]        = useState(defaultDateTo);
  const [sorting,       setSorting]       = useState<SortingState>([]);
  const [globalFilter,  setGlobalFilter]  = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination,    setPagination]    = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [debugOpen,     setDebugOpen]     = useState(false);
  const [exporting,     setExporting]     = useState(false);
  const [exportMsg,     setExportMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [skuModalOpen,  setSkuModalOpen]  = useState(false);
  const [skuModalPick,  setSkuModalPick]  = useState('');
  const [skuModalDet,   setSkuModalDet]   = useState('');
  const [skuCounts,          setSkuCounts]          = useState<Record<string, number>>({});
  const [incluyePendientes,  setIncluyePendientes]  = useState(false);
  const [rowSelection,       setRowSelection]       = useState<RowSelectionState>({});

  // Debug state
  const [debugData,       setDebugData]       = useState<Record<string, unknown>[] | null>(null);
  const [debugTypes,      setDebugTypes]      = useState<Record<string, unknown>[] | null>(null);
  const [debugDone,       setDebugDone]       = useState<Record<string, unknown>[] | null>(null);
  const [debugTypeDetail, setDebugTypeDetail] = useState<Record<string, unknown>[] | null>(null);
  const [debugResp,       setDebugResp]       = useState<Record<string, unknown> | null>(null);
  const [debugRespPick,   setDebugRespPick]   = useState('');
  const [debugMsgPick,    setDebugMsgPick]    = useState('');
  const [debugMsgData,    setDebugMsgData]    = useState<Record<string, unknown> | null>(null);

  const odooConfig = getOdooConfig();

  // ── saveManual (race-condition safe: functional setState) ───────────────────
  const saveManual = useCallback(async (
    pickingName: string,
    field: keyof Omit<ManualRow, 'picking_name'>,
    value: string,
  ) => {
    let merged!: ManualRow;
    setManualMap(m => {
      const prev = m[pickingName] ?? {
        picking_name: pickingName, correcta_declaracion: 'PENDIENTE', movimiento_ajuste: '',
      };
      merged = { ...prev, [field]: value };
      return { ...m, [pickingName]: merged };
    });
    setSavingKey(pickingName + field);
    try {
      await fetch('/api/control-cruce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
    } finally {
      setSavingKey('');
    }
  }, []); // no depende de manualMap — usa functional update

  const saveManualRef = useRef(saveManual);
  useEffect(() => { saveManualRef.current = saveManual; }, [saveManual]);

  // ── Carga de datos ──────────────────────────────────────────────────────────
  const loadOdoo = useCallback(async () => {
    if (!odooConfig?.url) { setError('Configura Odoo en Auditoría → Config primero.'); return; }
    if (dateFrom > dateTo) { setError('La fecha DESDE no puede ser mayor que HASTA.'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:             'get_control_activities',
          config:             odooConfig,
          query:              controlUser,
          dateFrom,
          dateTo,
          incluyePendientes,
        }),
      });
      const data = await res.json() as { rows?: CruceRow[]; error?: string; message?: string };
      if (data.error)   { setError(data.error);   return; }
      if (data.message) { setError(data.message); return; }
      setRows(data.rows ?? []);
      setRowSelection({});
      setPagination(p => ({ ...p, pageIndex: 0 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [odooConfig, controlUser, dateFrom, dateTo, incluyePendientes]);

  const loadManual = useCallback(async () => {
    try {
      const res  = await fetch('/api/control-cruce');
      const data = await res.json() as { data?: ManualRow[] };
      const map: Record<string, ManualRow> = {};
      for (const row of (data.data ?? [])) map[row.picking_name] = row;
      setManualMap(map);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { loadManual(); }, [loadManual]);

  // ── SKU counts (bulk via POST — evita overflow URL) ─────────────────────────
  const loadSkuCounts = useCallback(async () => {
    if (!rows.length) return;
    const names = [...new Set(rows.map(r => r.pickingName))];
    try {
      const res  = await fetch('/api/control-cruce/skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'counts', picking_names: names }),
      });
      const data = await res.json() as { counts?: Record<string, number> };
      setSkuCounts(data.counts ?? {});
    } catch { /* silencioso */ }
  }, [rows]);

  useEffect(() => { loadSkuCounts(); }, [loadSkuCounts]);

  // ── Debug helpers ───────────────────────────────────────────────────────────
  async function runDebug() {
    if (!odooConfig?.url) return;
    setDebugData(null); setDebugTypes(null); setDebugDone(null); setDebugTypeDetail(null);
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'debug_activities', config: odooConfig }),
      });
      const data = await res.json() as {
        pending?:    Record<string, unknown>[];
        done?:       Record<string, unknown>[];
        allTypes?:   Record<string, unknown>[];
        typeDetail?: Record<string, unknown>[];
      };
      setDebugData(data.pending ?? []);
      setDebugDone(data.done ?? []);
      setDebugTypes(data.allTypes ?? []);
      setDebugTypeDetail(data.typeDetail ?? []);
    } catch (e) { setDebugData([{ error: String(e) }]); }
  }

  async function runDebugMessages() {
    if (!odooConfig?.url || !debugMsgPick.trim()) return;
    setDebugMsgData(null);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'debug_messages_picking', config: odooConfig, query: debugMsgPick.trim() }),
      });
      setDebugMsgData(await res.json());
    } catch (e) { setDebugMsgData({ error: String(e) }); }
  }

  async function runDebugResponsable() {
    if (!odooConfig?.url || !debugRespPick.trim()) return;
    setDebugResp(null);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'debug_responsable', config: odooConfig, query: debugRespPick.trim() }),
      });
      setDebugResp(await res.json());
    } catch (e) { setDebugResp({ error: String(e) }); }
  }

  // ── Datos de la tabla ───────────────────────────────────────────────────────
  const tableData = useMemo<TableRow[]>(() =>
    rows.map(r => ({
      ...r,
      correcta_declaracion: manualMap[r.pickingName]?.correcta_declaracion ?? 'PENDIENTE',
      movimiento_ajuste:    manualMap[r.pickingName]?.movimiento_ajuste ?? '',
    })),
    [rows, manualMap],
  );

  // ── Opciones únicas para filtros (calculadas desde datos) ───────────────────
  const uniqueDetalles = useMemo(() => {
    const s = new Set(rows.map(r => r.detalle).filter(Boolean));
    return [...s].sort();
  }, [rows]);

  const uniqueResponsables = useMemo(() => {
    const s = new Set(rows.map(r => r.responsableArmado).filter(Boolean));
    return [...s].sort();
  }, [rows]);

  const uniqueStores = useMemo(() => {
    const s = new Set(rows.map(r => r.storeCod).filter(Boolean));
    return [...s].sort();
  }, [rows]);

  // ── Helpers para filtros de columna ────────────────────────────────────────
  function getColFilter(id: string): string {
    return (columnFilters.find(f => f.id === id)?.value as string) ?? '';
  }
  function setColFilter(id: string, value: string) {
    setColumnFilters(prev => {
      const filtered = prev.filter(f => f.id !== id);
      if (!value) return filtered;
      return [...filtered, { id, value }];
    });
    setPagination(p => ({ ...p, pageIndex: 0 }));
  }
  const activeFilterCount = columnFilters.length;

  // ── Definición de columnas ──────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<TableRow>[]>(() => [
    {
      id: 'select', enableSorting: false, size: 36,
      header: ({ table }) => {
        const filteredIds = table.getFilteredRowModel().rows.map(r => r.id);
        const sel = table.getState().rowSelection;
        const allChecked  = filteredIds.length > 0 && filteredIds.every(id => sel[id]);
        const someChecked = !allChecked && filteredIds.some(id => sel[id]);
        function toggleAll() {
          if (allChecked) {
            const next = { ...sel };
            filteredIds.forEach(id => delete next[id]);
            table.setRowSelection(next);
          } else {
            const next = { ...sel };
            filteredIds.forEach(id => { next[id] = true; });
            table.setRowSelection(next);
          }
        }
        return (
          <IndeterminateCheckbox
            checked={allChecked}
            indeterminate={someChecked}
            onChange={toggleAll}
          />
        );
      },
      cell: ({ row }) => (
        <IndeterminateCheckbox
          checked={row.getIsSelected()}
          indeterminate={row.getIsSomeSelected()}
          onChange={() => row.toggleSelected()}
        />
      ),
    },
    {
      id: 'storeCod', accessorKey: 'storeCod', header: 'TIENDA',
      cell: ({ getValue }) => <StoreCodBadge cod={getValue() as string} />,
    },
    {
      id: 'fechaArmado', accessorKey: 'fechaArmado', header: 'FECHA ARMADO',
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
          {fmtDate(getValue() as string)}
        </span>
      ),
    },
    {
      id: 'responsableArmado', accessorKey: 'responsableArmado', header: 'RESPONSABLE ARMADO',
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap' }}>
          {(getValue() as string) || '—'}
        </span>
      ),
    },
    {
      id: 'pickingName', accessorKey: 'pickingName', header: 'MOV ODOO',
      cell: ({ getValue }) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      id: 'fechaDeclaracion', accessorKey: 'fechaDeclaracion', header: 'FECHA DECLARACIÓN',
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
          {fmtDate(getValue() as string | null)}
        </span>
      ),
    },
    {
      id: 'auditado', accessorKey: 'auditado', header: 'AUDITADO',
      filterFn: 'equals',
      cell: ({ getValue }) => <AuditadoBadge value={getValue() as 'SI' | 'NO'} />,
    },
    {
      id: 'auditorName', accessorKey: 'auditorName', header: 'AUDITOR', enableSorting: false,
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
          {(getValue() as string) || '—'}
        </span>
      ),
    },
    {
      id: 'detalle', accessorKey: 'detalle', header: 'DETALLE',
      filterFn: 'equals',
      cell: ({ getValue }) => <DetalleBadge detalle={getValue() as string} />,
    },
    {
      id: 'sku', header: 'SKU', enableSorting: false,
      cell: ({ row }) => {
        const key = `${row.original.pickingName}|${row.original.detalle}`;
        const count = skuCounts[key] ?? 0;
        return (
          <button
            onClick={() => {
              setSkuModalPick(row.original.pickingName);
              setSkuModalDet(row.original.detalle);
              setSkuModalOpen(true);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: count > 0 ? 'rgba(22,163,74,0.15)' : 'rgba(59,130,246,0.12)',
              border: count > 0 ? '1px solid rgba(22,163,74,0.35)' : '1px solid rgba(59,130,246,0.3)',
              borderRadius: 5,
              color: count > 0 ? '#6EE7B7' : '#93C5FD',
              padding: '3px 9px', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'monospace',
            }}
          >
            <Package size={11} />
            {count > 0 ? `${count} SKU${count !== 1 ? 's' : ''}` : 'Agregar SKU'}
          </button>
        );
      },
    },
    {
      id: 'correcta_declaracion', accessorKey: 'correcta_declaracion', header: 'CORRECTA DEC.',
      filterFn: 'equals',
      cell: ({ row }) => (
        <CorrDropdown
          value={row.original.correcta_declaracion}
          onSave={v => saveManualRef.current(row.original.pickingName, 'correcta_declaracion', v)}
        />
      ),
    },
    {
      id: 'movimiento_ajuste', accessorKey: 'movimiento_ajuste', header: 'MOV AJUSTE', enableSorting: false,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.movimiento_ajuste || row.original.movAjuste}
          onSave={v => saveManualRef.current(row.original.pickingName, 'movimiento_ajuste', v)}
          placeholder="99REC/INT/…" monospace
        />
      ),
    },
    {
      id: 'estado', accessorKey: 'estado', header: 'ESTADO',
      enableSorting: false,
      filterFn: 'equals',
      cell: ({ getValue }) => <EstadoBadge estado={getValue() as CruceRow['estado']} />,
    },
  ], [skuCounts]);

  // ── Tabla TanStack ──────────────────────────────────────────────────────────
  const table = useReactTable({
    data: tableData,
    columns,
    state: { sorting, globalFilter, columnFilters, pagination, rowSelection },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    enableRowSelection: true,
    getRowId: row => row.estado === 'COMPLETADO' ? `m_${row.activityId}` : `a_${row.activityId}`,
  });

  const filteredCount       = table.getFilteredRowModel().rows.length;
  const selectedRows        = table.getSelectedRowModel().rows;
  const hasSelection        = selectedRows.length > 0;
  const completadoCount     = table.getFilteredRowModel().rows.filter(r => r.original.estado === 'COMPLETADO').length;
  const selCompletadoCount  = selectedRows.filter(r => r.original.estado === 'COMPLETADO').length;
  const exportCount         = hasSelection ? selCompletadoCount : completadoCount;
  const pageRows            = table.getRowModel().rows;

  // ── Exportar a Sheets (sin stale closure: lee tabla en el momento del click) ──
  async function exportToSheet() {
    // Con selección: exporta las seleccionadas COMPLETADAS.
    // Sin selección: exporta todas las filtradas COMPLETADAS.
    const pool = hasSelection
      ? table.getSelectedRowModel().rows.map(r => r.original)
      : table.getFilteredRowModel().rows.map(r => r.original);
    const currentRows = pool.filter(r => r.estado === 'COMPLETADO');
    if (!currentRows.length) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const res  = await fetch('/api/control-cruce/export-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: currentRows, fecha: dateTo }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; rowsWritten?: number; sheet?: string };
      if (data.ok) {
        setExportMsg({ ok: true, text: `${data.rowsWritten} filas → "${data.sheet}"` });
      } else {
        setExportMsg({ ok: false, text: data.error ?? 'Error al exportar' });
      }
    } catch (e) {
      setExportMsg({ ok: false, text: e instanceof Error ? e.message : 'Error de red' });
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(null), 6000);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--gradient-dark)' }}>

      <PageHeader
        title="Control Cruce"
        backHref="/control-interno"
        breadcrumbs={[
          { label: 'Control Interno', href: '/control-interno' },
          { label: 'Control Cruce' },
        ]}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px 48px' }}>

        {/* ── Barra de controles ── */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 8,
        }}>
          {/* Usuario Odoo */}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>
              USUARIO ODOO
            </span>
            <input
              value={controlUser}
              onChange={e => setControlUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadOdoo()}
              placeholder="Control Interno"
              style={{
                width: 140, background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                color: '#fff', padding: '5px 9px', fontSize: 12, outline: 'none',
              }}
            />
          </label>

          {/* Rango de fechas */}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>
              DESDE
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                width: 130, background: 'rgba(255,255,255,0.07)',
                border: dateFrom > dateTo ? '1px solid rgba(220,38,38,0.7)' : '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6, color: '#fff', padding: '5px 9px', fontSize: 12, outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>
              HASTA
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                width: 130, background: 'rgba(255,255,255,0.07)',
                border: dateFrom > dateTo ? '1px solid rgba(220,38,38,0.7)' : '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6, color: '#fff', padding: '5px 9px', fontSize: 12, outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </label>
          {dateFrom > dateTo && (
            <span style={{ fontSize: 10, color: '#FCA5A5', display: 'flex', alignItems: 'center', gap: 4 }}>
              <AlertTriangle size={10} /> Rango inválido
            </span>
          )}

          {/* Búsqueda global */}
          <div style={{ flex: '1 1 180px', minWidth: 180, position: 'relative' }}>
            <Search size={13} style={{
              position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
              color: 'rgba(255,255,255,0.3)', pointerEvents: 'none',
            }} />
            <input
              value={globalFilter}
              onChange={e => { setGlobalFilter(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })); }}
              placeholder="Buscar tienda, picking, detalle…"
              style={{
                width: '100%', background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6,
                color: '#fff', padding: '5px 30px', fontSize: 12, outline: 'none',
              }}
            />
            {globalFilter && (
              <button
                onClick={() => setGlobalFilter('')}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.3)', padding: 0, display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Toggle vencidas/planificadas */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            userSelect: 'none', whiteSpace: 'nowrap',
          }}>
            <input
              type="checkbox"
              checked={incluyePendientes}
              onChange={e => setIncluyePendientes(e.target.checked)}
              style={{ accentColor: '#F59E0B', width: 14, height: 14, cursor: 'pointer' }}
            />
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              color: incluyePendientes ? '#FCD34D' : 'rgba(255,255,255,0.35)',
            }}>
              INCLUIR VENCIDAS/PLANIFICADAS
            </span>
          </label>

          {/* Botón cargar */}
          <button
            onClick={loadOdoo}
            disabled={loading || dateFrom > dateTo}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#1E40AF', border: 'none', borderRadius: 6,
              color: '#fff', padding: '6px 14px', fontSize: 12, fontWeight: 600,
              cursor: (loading || dateFrom > dateTo) ? 'not-allowed' : 'pointer',
              opacity: (loading || dateFrom > dateTo) ? 0.7 : 1,
            }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Cargando…' : rows.length ? 'Actualizar' : 'Cargar desde Odoo'}
          </button>

          {/* Exportar a Sheet */}
          {tableData.length > 0 && (
            <button
              onClick={exportToSheet}
              disabled={exporting || exportCount === 0}
              title={hasSelection
                ? `Exportar ${selCompletadoCount} seleccionadas COMPLETADAS (${selectedRows.length} seleccionadas total)`
                : `Exportar ${completadoCount} filas COMPLETADAS a Google Sheet`
              }
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: exporting ? 'rgba(22,163,74,0.25)' : hasSelection ? 'rgba(22,163,74,0.35)' : 'rgba(22,163,74,0.18)',
                border: hasSelection ? '1px solid rgba(22,163,74,0.7)' : '1px solid rgba(22,163,74,0.45)',
                borderRadius: 6, color: '#6EE7B7',
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                cursor: (exporting || exportCount === 0) ? 'not-allowed' : 'pointer',
                opacity: (exporting || exportCount === 0) ? 0.5 : 1,
              }}
            >
              <FileSpreadsheet size={13} className={exporting ? 'animate-pulse' : ''} />
              {exporting
                ? 'Exportando…'
                : hasSelection
                  ? `Exportar ${selCompletadoCount} seleccionadas`
                  : `Exportar ${completadoCount} completadas`
              }
            </button>
          )}

          {/* Mensaje exportación */}
          {exportMsg && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, whiteSpace: 'nowrap',
              color: exportMsg.ok ? '#6EE7B7' : '#FCA5A5',
            }}>
              {exportMsg.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {exportMsg.text}
            </span>
          )}

          {/* Contador + saving */}
          {rows.length > 0 && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>
              {filteredCount}{(globalFilter || activeFilterCount > 0) ? ` / ${rows.length}` : ''} fila{filteredCount !== 1 ? 's' : ''}
              {hasSelection && (
                <span style={{ marginLeft: 8, color: '#6EE7B7', fontWeight: 600 }}>
                  · {selectedRows.length} seleccionada{selectedRows.length !== 1 ? 's' : ''}
                  <button
                    onClick={() => setRowSelection({})}
                    title="Limpiar selección"
                    style={{
                      marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer',
                      color: 'rgba(110,231,183,0.6)', padding: 0, display: 'inline-flex',
                    }}
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {savingKey && <span style={{ marginLeft: 8, color: '#FCD34D' }}>· Guardando…</span>}
            </span>
          )}
        </div>

        {/* ── Barra de filtros de columna ── */}
        {tableData.length > 0 && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8, padding: '8px 14px', marginBottom: 14,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.07em' }}>
              <Filter size={10} /> FILTROS
              {activeFilterCount > 0 && (
                <span style={{ background: 'rgba(22,163,74,0.3)', color: '#6EE7B7', borderRadius: 10, padding: '0 5px', fontSize: 9 }}>
                  {activeFilterCount}
                </span>
              )}
            </span>

            <FilterSelect
              label="DETALLE"
              value={getColFilter('detalle')}
              options={uniqueDetalles}
              onChange={v => setColFilter('detalle', v)}
            />
            <FilterSelect
              label="AUDITADO"
              value={getColFilter('auditado')}
              options={['SI', 'NO']}
              onChange={v => setColFilter('auditado', v)}
            />
            <FilterSelect
              label="CORRECTA DEC."
              value={getColFilter('correcta_declaracion')}
              options={CORR_OPTS}
              onChange={v => setColFilter('correcta_declaracion', v)}
            />
            <FilterSelect
              label="TIENDA"
              value={getColFilter('storeCod')}
              options={uniqueStores}
              onChange={v => setColFilter('storeCod', v)}
            />
            <FilterSelect
              label="RESPONSABLE"
              value={getColFilter('responsableArmado')}
              options={uniqueResponsables}
              onChange={v => setColFilter('responsableArmado', v)}
            />
            <FilterSelect
              label="ESTADO"
              value={getColFilter('estado')}
              options={['COMPLETADO', 'VENCIDA', 'PLANIFICADO']}
              onChange={v => setColFilter('estado', v)}
            />

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setColumnFilters([]); setPagination(p => ({ ...p, pageIndex: 0 })); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.3)',
                  borderRadius: 5, color: '#FCA5A5',
                  padding: '3px 9px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <X size={9} /> Limpiar filtros
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
            borderRadius: 6, color: '#FCA5A5', padding: '9px 14px', marginBottom: 14, fontSize: 13,
          }}>
            <AlertTriangle size={15} />
            {error}
          </div>
        )}

        {/* Empty state — sin datos cargados */}
        {!loading && !error && rows.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', paddingTop: 80, fontSize: 13 }}>
            Presiona{' '}
            <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Cargar desde Odoo</strong>
            {' '}para obtener las actividades de Control Interno.
          </div>
        )}

        {/* Empty state — filtros sin resultados */}
        {!loading && tableData.length > 0 && filteredCount === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', paddingTop: 60, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔍</div>
            Ninguna fila coincide con los filtros activos.
            <br />
            <button
              onClick={() => { setGlobalFilter(''); setColumnFilters([]); }}
              style={{
                marginTop: 12, background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                color: 'rgba(255,255,255,0.5)', padding: '5px 14px', fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Limpiar todos los filtros
            </button>
          </div>
        )}

        {/* ── Tabla TanStack ── */}
        {tableData.length > 0 && filteredCount > 0 && (
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
              <thead>
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id} style={{ background: 'rgba(22,163,74,0.28)' }}>
                    {hg.headers.map(header => {
                      const canSort = header.column.getCanSort();
                      const sortDir = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          style={{
                            padding: '8px 10px', fontSize: 10, fontWeight: 800,
                            letterSpacing: '0.07em',
                            color: sortDir ? '#6EE7B7' : 'rgba(255,255,255,0.65)',
                            whiteSpace: 'nowrap', textAlign: 'left',
                            borderBottom: '1px solid rgba(255,255,255,0.12)',
                            cursor: canSort ? 'pointer' : 'default',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {canSort && <SortIcon direction={sortDir} />}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {pageRows.map((row, i) => {
                  const isSaving = savingKey.startsWith(row.original.pickingName);
                  return (
                    <tr
                      key={row.id}
                      style={{
                        background: isSaving
                          ? 'rgba(253,224,71,0.06)'
                          : i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent',
                        outline: isSaving ? '1px solid rgba(253,224,71,0.2)' : 'none',
                        transition: 'background 0.2s',
                      }}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td
                          key={cell.id}
                          style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Paginación ── */}
        {filteredCount > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 8, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => table.firstPage()}
                disabled={!table.getCanPreviousPage()}
                style={paginationBtnStyle(!table.getCanPreviousPage())}
                title="Primera página"
              >«</button>
              <button
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                style={paginationBtnStyle(!table.getCanPreviousPage())}
              >
                <ChevronLeft size={13} />
              </button>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
                Página{' '}
                <strong style={{ color: '#fff' }}>{table.getState().pagination.pageIndex + 1}</strong>
                {' '}de{' '}
                <strong style={{ color: '#fff' }}>{table.getPageCount()}</strong>
              </span>
              <button
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                style={paginationBtnStyle(!table.getCanNextPage())}
              >
                <ChevronRight size={13} />
              </button>
              <button
                onClick={() => table.lastPage()}
                disabled={!table.getCanNextPage()}
                style={paginationBtnStyle(!table.getCanNextPage())}
                title="Última página"
              >»</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.05em' }}>
                  FILAS
                </span>
                <select
                  value={pagination.pageSize}
                  onChange={e => { setPagination({ pageIndex: 0, pageSize: Number(e.target.value) }); }}
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 5, color: '#fff', padding: '3px 6px', fontSize: 11, outline: 'none',
                  }}
                >
                  {[25, 50, 100, 200].map(n => (
                    <option key={n} value={n} style={{ background: '#1e293b' }}>{n}</option>
                  ))}
                </select>
              </label>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                {filteredCount} total
              </span>
            </div>
          </div>
        )}

        {/* Nota de pie */}
        {rows.length > 0 && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', paddingBottom: 16 }}>
            <strong style={{ color: 'rgba(255,255,255,0.35)' }}>SKU / CORRECTA DEC. / MOV AJUSTE</strong> — guardado automático al editar.
            {' · '}
            <strong style={{ color: 'rgba(255,255,255,0.35)' }}>AUDITADO</strong> — calculado automáticamente desde el origin del picking padre.
            {' · '}<strong style={{ color: 'rgba(255,255,255,0.35)' }}>EXPORTAR A SHEET</strong> — escribe las filas visibles al Google Sheet.
            {' · '}Haz click en un encabezado para ordenar.
          </div>
        )}

        {/* ── Herramientas de diagnóstico (solo admin) ── */}
        {isAdmin && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
            <button
              onClick={() => setDebugOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.28)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.07em', padding: '2px 0',
              }}
            >
              <Bug size={12} />
              HERRAMIENTAS DE DIAGNÓSTICO
              <ChevronRight
                size={11}
                style={{ transform: debugOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
              />
            </button>

            {debugOpen && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

                <div>
                  <button
                    onClick={runDebug}
                    title="Ver campos reales de las últimas 10 actividades en Odoo (sin filtro de usuario)"
                    style={{
                      background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)',
                      borderRadius: 6, color: '#C084FC', padding: '5px 11px',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Debug Actividades Odoo
                  </button>
                </div>

                {(debugData || debugTypes) && (
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.3)' }}>
                    <div style={{ background: 'rgba(168,85,247,0.18)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#C084FC' }}>
                      Debug Odoo — Actividades
                    </div>

                    {debugTypes && (
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                          TIPOS DISPONIBLES ({debugTypes.length})
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {debugTypes.map((t, i) => (
                            <span key={i} style={{
                              background: 'rgba(255,255,255,0.07)', borderRadius: 4,
                              padding: '2px 8px', fontSize: 11, color: '#fff', fontFamily: 'monospace',
                            }}>
                              <span style={{ color: '#FCD34D' }}>{String(t.id)}</span>{' → '}{String(t.name)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {debugTypeDetail && debugTypeDetail.length > 0 && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px 8px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                          DETALLE TIPOS 26/27/28
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {debugTypeDetail.map((t, i) => (
                            <span key={i} style={{
                              background: 'rgba(253,224,71,0.08)', border: '1px solid rgba(253,224,71,0.25)',
                              borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#fff', fontFamily: 'monospace',
                            }}>
                              <span style={{ color: '#FCD34D' }}>{String(t.id)}</span>
                              {' → '}{JSON.stringify(t.name)}{' | '}{JSON.stringify(t.summary)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {([
                      { label: 'PENDIENTES (mail.activity)', data: debugData,  cols: ['id','res_name','user_id','activity_type_id','summary','date_deadline'] },
                      { label: 'COMPLETADAS (mail.message)', data: debugDone,  cols: ['id','record_name','author_id','mail_activity_type_id','date','body'] },
                    ] as Array<{ label: string; data: Record<string,unknown>[] | null; cols: string[] }>).map(({ label, data, cols }) => data && (
                      <div key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ padding: '5px 12px 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
                          {label} ({data.length})
                        </div>
                        {data.length === 0
                          ? <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>Sin resultados</div>
                          : (
                            <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                  <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                    {cols.map(h => (
                                      <th key={h} style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.4)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {data.map((row, i) => (
                                    <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                      {cols.map(k => (
                                        <td key={k} style={{ padding: '3px 8px', color: 'rgba(255,255,255,0.65)', borderBottom: '1px solid rgba(255,255,255,0.04)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {JSON.stringify(row[k])}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        }
                      </div>
                    ))}

                    <div style={{ padding: '5px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.22)', borderTop: '1px solid rgba(255,255,255,0.06)', fontStyle: 'italic' }}>
                      Al completar una actividad en Odoo se elimina de mail.activity y queda en mail.message.
                    </div>
                  </div>
                )}

                {/* Debug mensajes de un picking — para analizar fechaDeclaracion */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.05em' }}>
                    DEBUG MENSAJES
                  </span>
                  <input
                    value={debugMsgPick}
                    onChange={e => setDebugMsgPick(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runDebugMessages()}
                    placeholder="Ej: 20CTC/INT/03084"
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 6, color: '#fff', padding: '4px 9px', fontSize: 11,
                      outline: 'none', width: 190,
                    }}
                  />
                  <button
                    onClick={runDebugMessages}
                    style={{
                      background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)',
                      borderRadius: 6, color: '#93C5FD', padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Ver todos los mensajes
                  </button>
                </div>

                {debugMsgData && (
                  <div style={{ borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ background: 'rgba(59,130,246,0.18)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#93C5FD' }}>
                      Mensajes Odoo — {debugMsgPick}
                    </div>

                    {/* Info del picking */}
                    {Boolean((debugMsgData as Record<string,unknown>).picking) && (
                      <div style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>PICKING</div>
                        <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'pre-wrap' }}>
                          {JSON.stringify((debugMsgData as Record<string,unknown>).picking, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Actividades pendientes */}
                    {Array.isArray((debugMsgData as Record<string,unknown>).pendingActivities) && (
                      <div style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#FCD34D', marginBottom: 5 }}>
                          ACTIVIDADES PENDIENTES ({((debugMsgData as Record<string,unknown>).pendingActivities as unknown[]).length})
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: 6 }}>— tienen create_date</span>
                        </div>
                        <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
                          {JSON.stringify((debugMsgData as Record<string,unknown>).pendingActivities, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Tabla de mensajes */}
                    {Array.isArray((debugMsgData as Record<string,unknown>).messages) && (
                      <div style={{ padding: '7px 12px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>
                          MAIL.MESSAGE ({((debugMsgData as Record<string,unknown>).messages as unknown[]).length}) — ordenados por date ASC
                        </div>
                        <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                            <thead>
                              <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                {['id','date','create_date','message_type','mail_activity_type_id','subtype_id','author_id','body(100)'].map(h => (
                                  <th key={h} style={{ padding: '3px 7px', color: 'rgba(255,255,255,0.4)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {((debugMsgData as Record<string,unknown>).messages as Array<Record<string,unknown>>).map((msg, i) => (
                                <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                  <td style={tdStyle}>{String(msg.id)}</td>
                                  <td style={tdStyle}>{String(msg.date)}</td>
                                  <td style={tdStyle}>{String(msg.create_date)}</td>
                                  <td style={{ ...tdStyle, color: msg.message_type === 'activity' ? '#FCD34D' : msg.message_type === 'comment' ? '#6EE7B7' : 'rgba(255,255,255,0.5)' }}>
                                    {String(msg.message_type)}
                                  </td>
                                  <td style={tdStyle}>{JSON.stringify(msg.mail_activity_type_id)}</td>
                                  <td style={tdStyle}>{JSON.stringify(msg.subtype_id)}</td>
                                  <td style={tdStyle}>{JSON.stringify(msg.author_id)}</td>
                                  <td style={{ ...tdStyle, maxWidth: 200 }}>{String(msg.body ?? '').replace(/<[^>]*>/g,' ').slice(0,100)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Debug responsable armado */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.05em' }}>
                    DEBUG RESPONSABLE
                  </span>
                  <input
                    value={debugRespPick}
                    onChange={e => setDebugRespPick(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runDebugResponsable()}
                    placeholder="Ej: 20CTC/INT/03084"
                    style={{
                      background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 6, color: '#fff', padding: '4px 9px', fontSize: 11,
                      outline: 'none', width: 190,
                    }}
                  />
                  <button
                    onClick={runDebugResponsable}
                    style={{
                      background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)',
                      borderRadius: 6, color: '#C084FC', padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Trazar cadena
                  </button>
                </div>

                {debugResp && (
                  <div style={{ borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', overflow: 'hidden' }}>
                    <div style={{ background: 'rgba(168,85,247,0.18)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#C084FC' }}>
                      Cadena Responsable Armado — {debugRespPick}
                    </div>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#FCD34D', marginBottom: 4 }}>RESPUESTA COMPLETA</div>
                      <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
                        {JSON.stringify(debugResp, null, 2)}
                      </pre>
                    </div>
                    {[
                      { label: '① INT Picking',          key: 'intPick'           },
                      { label: '② rawOrigin',             key: 'rawOrigin'         },
                      { label: '③ parsedRefs',            key: 'parsedRefs'        },
                      { label: '④ parentByName',          key: 'parentByName'      },
                      { label: '⑤ sameOriginPickings',    key: 'sameOriginPickings'},
                      { label: '⑥ Moves del INT',         key: 'moves'             },
                      { label: '⑦ Moves Origen',          key: 'origMoves'         },
                      { label: '⑧ Pickings Origen',       key: 'origPickings'      },
                    ].map(({ label, key }) => {
                      const val = (debugResp as Record<string, unknown>)[key];
                      const empty = val === undefined || val === null ||
                        (Array.isArray(val) && val.length === 0) ||
                        (typeof val === 'string' && val === '');
                      return (
                        <div key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: empty ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)', marginBottom: empty ? 0 : 4 }}>
                            {label}
                            {empty && <span style={{ color: 'rgba(220,38,38,0.6)', marginLeft: 6 }}>— VACÍO</span>}
                          </div>
                          {!empty && (
                            <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto' }}>
                              {JSON.stringify(val, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de SKUs */}
      <SkuModal
        open={skuModalOpen}
        pickingName={skuModalPick}
        detalle={skuModalDet}
        onClose={() => setSkuModalOpen(false)}
        onChange={loadSkuCounts}
      />
    </div>
  );
}

// ─── Helpers de estilo paginación ─────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding: '3px 7px', color: 'rgba(255,255,255,0.65)',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
};

function paginationBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 5, color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)',
    padding: '4px 8px', fontSize: 11, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', minWidth: 28,
  };
}
