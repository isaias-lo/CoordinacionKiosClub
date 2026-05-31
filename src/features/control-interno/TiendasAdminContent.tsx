'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Store, CalendarDays } from 'lucide-react';
import CalendarioColumnas from './CalendarioColumnas';

export interface Tienda {
  codigo: string; nombre: string; direccion: string; region: string;
  sector_comuna: string; corredor: string; tipo: string; ventana: string;
  frecuencia: string; prom_por_dia: string; lat: number | null; lon: number | null;
  correos: string; tel_encargado: string; supervisor: string;
  tel_supervisor: string; transportista: string; activo: boolean;
  created_at?: string; updated_at?: string;
}

const EMPTY: Tienda = {
  codigo: '', nombre: '', direccion: '', region: '', sector_comuna: '',
  corredor: '', tipo: '', ventana: '', frecuencia: '', prom_por_dia: '',
  lat: null, lon: null, correos: '', tel_encargado: '', supervisor: '',
  tel_supervisor: '', transportista: '', activo: true,
};

type ViewMode = 'xl' | 'lg' | 'md' | 'sm' | 'list';
type SortBy  = 'nombre' | 'codigo' | 'region' | 'estado' | 'recientes' | 'modificadas';
type SortDir = 'asc' | 'desc';

const SORT_OPTS: { id: SortBy; label: string; sym: string; defaultDir: SortDir }[] = [
  { id: 'nombre',      label: 'Nombre',      sym: 'Aa', defaultDir: 'asc'  },
  { id: 'codigo',      label: 'Código',      sym: '#',  defaultDir: 'asc'  },
  { id: 'region',      label: 'Región',      sym: '◎',  defaultDir: 'asc'  },
  { id: 'estado',      label: 'Estado',      sym: '●',  defaultDir: 'asc'  },
  { id: 'recientes',   label: 'Recientes',   sym: '⊕',  defaultDir: 'desc' },
  { id: 'modificadas', label: 'Modificadas', sym: '✎',  defaultDir: 'desc' },
];

function relativeTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 2)    return 'hace un momento';
  if (mins < 60)   return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24)  return `hace ${hours}h`;
  const days  = Math.floor(hours / 24);
  if (days < 7)    return `hace ${days}d`;
  if (days < 30)   return `hace ${Math.floor(days / 7)} sem`;
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: days > 365 ? '2-digit' : undefined });
}

function sortTiendas(list: Tienda[], by: SortBy, dir: SortDir): Tienda[] {
  return [...list].sort((a, b) => {
    let cmp = 0;
    switch (by) {
      case 'nombre':      cmp = a.nombre.localeCompare(b.nombre, 'es'); break;
      case 'codigo':      cmp = a.codigo.localeCompare(b.codigo, 'es'); break;
      case 'region':      cmp = a.region.localeCompare(b.region, 'es'); break;
      case 'estado':      cmp = (a.activo === b.activo) ? 0 : a.activo ? -1 : 1; break;
      case 'recientes':
        cmp = new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        return dir === 'desc' ? cmp : -cmp;
      case 'modificadas':
        cmp = new Date(b.updated_at ?? b.created_at ?? 0).getTime()
            - new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        return dir === 'desc' ? cmp : -cmp;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function IconXL() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="1" y="1" width="16" height="16" rx="3"/></svg>;
}
function IconLG() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="1" y="1" width="6.5" height="16" rx="2"/><rect x="10.5" y="1" width="6.5" height="16" rx="2"/></svg>;
}
function IconMD() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="1" y="1" width="4" height="16" rx="1.5"/><rect x="7" y="1" width="4" height="16" rx="1.5"/><rect x="13" y="1" width="4" height="16" rx="1.5"/></svg>;
}
function IconSM() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="1" y="1" width="7" height="7" rx="2"/><rect x="10" y="1" width="7" height="7" rx="2"/><rect x="1" y="10" width="7" height="7" rx="2"/><rect x="10" y="10" width="7" height="7" rx="2"/></svg>;
}
function IconList() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor"><rect x="1" y="2" width="16" height="3" rx="1.5"/><rect x="1" y="7.5" width="16" height="3" rx="1.5"/><rect x="1" y="13" width="16" height="3" rx="1.5"/></svg>;
}

const VIEW_OPTS: { id: ViewMode; label: string; Icon: () => React.ReactElement }[] = [
  { id: 'xl',   label: 'Extra grande', Icon: IconXL },
  { id: 'lg',   label: 'Grande',       Icon: IconLG },
  { id: 'md',   label: 'Mediano',      Icon: IconMD },
  { id: 'sm',   label: 'Pequeño',      Icon: IconSM },
  { id: 'list', label: 'Lista',        Icon: IconList },
];

const GRID_CLASS: Record<ViewMode, string> = {
  xl: 'tg-xl', lg: 'tg-lg', md: 'tg-md', sm: 'tg-sm', list: 'tg-list',
};

const S = {
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' as const },
  modal:   { background: '#1A2550', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '24px 20px', width: '100%', maxWidth: 520 } as React.CSSProperties,
  label:   { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'block' } as React.CSSProperties,
  input:   { width: '100%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: '#fff', padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties,
  syncBtn: { background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 10, color: '#FCD34D', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
  addBtn:  { background: 'rgba(16,185,129,0.2)',  border: '1px solid rgba(16,185,129,0.5)',  borderRadius: 10, color: '#34D399', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' } as React.CSSProperties,
};

export default function TiendasAdminContent({
  canEditTiendas    = true,
  canEditCalendario = true,
  source            = 'despacho',
}: {
  canEditTiendas?:    boolean;
  canEditCalendario?: boolean;
  source?:            'despacho' | 'armado';
}) {
  const [tiendas,   setTiendas]   = useState<Tienda[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg,       setMsg]       = useState('');
  const [search,    setSearch]    = useState('');
  const [modal,     setModal]     = useState<'add' | 'edit' | null>(null);
  const [form,      setForm]      = useState<Tienda>(EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [skipped,      setSkipped]      = useState<{ row: number; raw: string; reason: string }[]>([]);
  const [activeTab,    setActiveTab]    = useState<'tiendas' | 'calendario'>('tiendas');
  const [activeFilter, setActiveFilter] = useState<'all' | 'activas' | 'inactivas'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'lg';
    return (localStorage.getItem('tiendas_view_mode') as ViewMode) ?? 'lg';
  });
  const [sortBy,  setSortBy]  = useState<SortBy>(() => {
    if (typeof window === 'undefined') return 'nombre';
    return (localStorage.getItem('tiendas_sort_by') as SortBy) ?? 'nombre';
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    if (typeof window === 'undefined') return 'asc';
    return (localStorage.getItem('tiendas_sort_dir') as SortDir) ?? 'asc';
  });

  useEffect(() => { localStorage.setItem('tiendas_view_mode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('tiendas_sort_by',  sortBy);   }, [sortBy]);
  useEffect(() => { localStorage.setItem('tiendas_sort_dir', sortDir);  }, [sortDir]);

  function handleSortClick(id: SortBy) {
    if (sortBy === id) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(id);
      setSortDir(SORT_OPTS.find(o => o.id === id)?.defaultDir ?? 'asc');
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tiendas');
      const d   = await res.json() as { tiendas?: Tienda[] };
      setTiendas(d.tiendas ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true); setMsg(''); setSkipped([]);
    try {
      const res  = await fetch('/api/tiendas/sync', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; synced?: number; error?: string; skipped?: { row: number; raw: string; reason: string }[] };
      if (data.ok) {
        setMsg(`✓ Sincronizado: ${data.synced} tiendas${data.skipped?.length ? ` · ${data.skipped.length} saltadas` : ''}`);
        setSkipped(data.skipped ?? []);
        await load();
      } else { setMsg(`Error: ${data.error}`); }
    } catch { setMsg('Error de conexión'); }
    finally { setSyncing(false); }
  }

  async function handleExportSheets() {
    setExporting(true); setMsg('');
    try {
      const res  = await fetch('/api/tiendas/export-sheets', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; exported?: number; error?: string };
      if (data.ok) setMsg(`✓ Exportado: ${data.exported} tiendas → Google Sheets`);
      else setMsg(`Error: ${data.error}`);
    } catch { setMsg('Error de conexión'); }
    finally { setExporting(false); }
  }

  function openAdd()          { setForm(EMPTY);    setModal('add');  }
  function openEdit(t: Tienda){ setForm({ ...t }); setModal('edit'); }

  async function handleSave() {
    if (!form.codigo || !form.nombre) return;
    setSaving(true);
    try {
      const res  = await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json() as { tienda?: Tienda; error?: string };
      if (data.tienda) { setModal(null); await load(); setMsg(modal === 'add' ? '✓ Tienda agregada' : '✓ Tienda actualizada'); }
      else { setMsg(`Error: ${data.error}`); }
    } finally { setSaving(false); }
  }

  async function handleToggleActivo(t: Tienda) {
    await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...t, activo: !t.activo }) });
    await load();
  }

  function f(k: keyof Tienda) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm(prev => ({ ...prev, [k]: v }));
    };
  }

  const searchFiltered = tiendas.filter(t =>
    t.codigo.toLowerCase().includes(search.toLowerCase()) ||
    t.nombre.toLowerCase().includes(search.toLowerCase()) ||
    t.region.toLowerCase().includes(search.toLowerCase())
  );
  const activas   = searchFiltered.filter(t =>  t.activo).length;
  const inactivas = searchFiltered.filter(t => !t.activo).length;
  const baseFiltered = activeFilter === 'activas'   ? searchFiltered.filter(t =>  t.activo)
                     : activeFilter === 'inactivas' ? searchFiltered.filter(t => !t.activo)
                     : searchFiltered;
  const filtered  = sortTiendas(baseFiltered, sortBy, sortDir);

  // Whether any tienda in the current view has timestamp data
  const hasTimestamps = filtered.some(t => t.created_at || t.updated_at);

  // ── Card renderer ────────────────────────────────────────────────────────────
  function renderCard(t: Tienda) {
    const codeBadge = (size: number, pad: string, radius: number) => (
      <span style={{ fontFamily: 'monospace', fontSize: size, fontWeight: 900, background: 'rgba(37,99,235,0.3)', color: '#93C5FD', borderRadius: radius, padding: pad, letterSpacing: '0.03em', whiteSpace: 'nowrap' as const }}>
        {t.codigo}
      </span>
    );
    const statusBadge = (size: number, pad: string) => (
      <span style={{ fontSize: size, fontWeight: 800, borderRadius: 20, padding: pad, background: t.activo ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)', color: t.activo ? '#34D399' : '#F87171', border: `1px solid ${t.activo ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`, letterSpacing: '0.05em', whiteSpace: 'nowrap' as const }}>
        {t.activo ? 'ACTIVO' : 'INACTIVO'}
      </span>
    );

    // Contextual timestamp shown based on active sort
    const tsValue  = sortBy === 'recientes'   ? t.created_at
                   : sortBy === 'modificadas' ? (t.updated_at ?? t.created_at)
                   : t.updated_at;
    const tsLabel  = sortBy === 'recientes'   ? 'agregada'
                   : sortBy === 'modificadas' ? 'modificada'
                   : 'modificada';
    const tsText   = relativeTime(tsValue);
    const tsColor  = (() => {
      if (!tsValue) return 'rgba(255,255,255,0.2)';
      const days = (Date.now() - new Date(tsValue).getTime()) / 86_400_000;
      if (days < 1)  return '#34D399';
      if (days < 7)  return '#FCD34D';
      if (days < 30) return 'rgba(255,255,255,0.45)';
      return 'rgba(255,255,255,0.25)';
    })();

    const tsBadge = (showLabel = true) => tsText ? (
      <span style={{ fontSize: 11, color: tsColor, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' as const }}>
        <span style={{ opacity: 0.7 }}>{showLabel ? `${tsLabel}:` : '◷'}</span> {tsText}
      </span>
    ) : null;

    // ── LISTA ────────────────────────────────────────────────────────────────
    if (viewMode === 'list') {
      return (
        <div key={t.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '9px 14px', flexWrap: 'wrap' }}>
          {codeBadge(13, '2px 9px', 6)}
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 700, flex: 1, minWidth: 140 }}>{t.nombre}</span>
          {t.region  && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.06)', borderRadius: 5, padding: '2px 8px' }}>{t.region}</span>}
          {t.ventana && <span style={{ fontSize: 12, color: '#FCD34D', fontWeight: 600, background: 'rgba(252,211,77,0.1)', borderRadius: 5, padding: '2px 8px' }}>{t.ventana}</span>}
          {tsBadge(false)}
          {statusBadge(11, '3px 10px')}
          {canEditTiendas && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              <button onClick={() => handleToggleActivo(t)} style={{ height: 30, borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: '0 12px', background: t.activo ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: t.activo ? '#F87171' : '#34D399' }}>
                {t.activo ? 'DESACT.' : 'ACTIVAR'}
              </button>
              <button onClick={() => openEdit(t)} style={{ height: 30, borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer', padding: '0 12px', background: 'rgba(59,130,246,0.2)', color: '#93C5FD' }}>
                EDITAR
              </button>
            </div>
          )}
        </div>
      );
    }

    // ── EXTRA GRANDE ─────────────────────────────────────────────────────────
    if (viewMode === 'xl') {
      return (
        <div key={t.codigo} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '22px 26px', display: 'flex', gap: 22, alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 100 }}>
            <div style={{ width: 78, height: 78, borderRadius: 20, background: 'rgba(37,99,235,0.18)', border: '2px solid rgba(37,99,235,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 900, color: '#93C5FD', textAlign: 'center', lineHeight: 1.3, padding: '0 4px' }}>{t.codigo}</span>
            </div>
            {statusBadge(11, '4px 10px')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t.nombre}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {t.region    && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 9px' }}>{t.region}</span>}
              {t.corredor  && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '3px 9px' }}>{t.corredor}</span>}
              {t.ventana   && <span style={{ fontSize: 13, color: '#FCD34D', background: 'rgba(252,211,77,0.12)', borderRadius: 6, padding: '3px 9px', fontWeight: 600 }}>{t.ventana}</span>}
              {t.supervisor && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 9px' }}>Sup: {t.supervisor}</span>}
              {t.transportista && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 9px' }}>{t.transportista}</span>}
            </div>
            {t.direccion && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 8 }}>{t.direccion}</div>}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {t.correos       && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>✉ {t.correos}</span>}
              {t.tel_encargado && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>📞 {t.tel_encargado}</span>}
              {tsText && <span style={{ marginLeft: 'auto' }}>{tsBadge()}</span>}
            </div>
          </div>
          {canEditTiendas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 130 }}>
              <button onClick={() => handleToggleActivo(t)} style={{ height: 40, borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', background: t.activo ? 'linear-gradient(175deg,#EF4444,#B91C1C)' : 'linear-gradient(175deg,#10B981,#059669)', color: '#fff', boxShadow: t.activo ? '0 3px 10px rgba(239,68,68,0.35)' : '0 3px 10px rgba(16,185,129,0.35)' }}>
                {t.activo ? 'DESACTIVAR' : 'ACTIVAR'}
              </button>
              <button onClick={() => openEdit(t)} style={{ height: 40, borderRadius: 10, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.04em', background: 'linear-gradient(175deg,#3B82F6,#1D4ED8)', color: '#fff', boxShadow: '0 3px 10px rgba(59,130,246,0.35)' }}>
                EDITAR
              </button>
            </div>
          )}
        </div>
      );
    }

    // ── GRANDE / MEDIANO / PEQUEÑO ────────────────────────────────────────────
    const isLG = viewMode === 'lg';
    const isSM = viewMode === 'sm';

    return (
      <div key={t.codigo} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: isSM ? 12 : isLG ? 16 : 14, padding: isSM ? '12px 14px' : isLG ? '18px 20px' : '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isSM ? 6 : 8, marginBottom: isSM ? 6 : 8, flexWrap: 'wrap' }}>
          {codeBadge(isSM ? 12 : isLG ? 18 : 14, isSM ? '3px 8px' : isLG ? '4px 12px' : '3px 9px', isSM ? 6 : 8)}
          {statusBadge(isSM ? 10 : 11, isSM ? '2px 7px' : '3px 9px')}
        </div>
        <div style={{ color: '#fff', fontSize: isSM ? 12 : isLG ? 20 : 15, fontWeight: 700, marginBottom: isSM ? 6 : 8, lineHeight: 1.2 }}>{t.nombre}</div>
        {!isSM && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
            {t.region   && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 7px' }}>{t.region}</span>}
            {t.ventana  && <span style={{ fontSize: 12, color: '#FCD34D', background: 'rgba(252,211,77,0.12)', borderRadius: 5, padding: '2px 7px', fontWeight: 600 }}>{t.ventana}</span>}
            {isLG && t.corredor   && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.07)', borderRadius: 5, padding: '2px 7px' }}>{t.corredor}</span>}
            {isLG && t.supervisor && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '2px 7px' }}>Sup: {t.supervisor}</span>}
          </div>
        )}
        {isLG && t.direccion && <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 10 }}>{t.direccion}</div>}
        {isLG && (t.correos || t.tel_encargado) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            {t.correos       && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>✉ {t.correos}</span>}
            {t.tel_encargado && <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>📞 {t.tel_encargado}</span>}
          </div>
        )}
        {isLG && tsText && <div style={{ marginBottom: 10 }}>{tsBadge()}</div>}
        <div style={{ flex: 1 }} />
        {canEditTiendas && (
          <div style={{ display: 'flex', gap: isSM ? 4 : 8, marginTop: 'auto', paddingTop: (!isSM && !(isLG && (t.correos || t.tel_encargado))) ? 14 : 0 }}>
            <button onClick={() => handleToggleActivo(t)} style={{ flex: 1, height: isSM ? 28 : 40, borderRadius: isSM ? 7 : 10, border: 'none', fontSize: isSM ? 10 : 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.03em', background: t.activo ? 'linear-gradient(175deg,#EF4444,#B91C1C)' : 'linear-gradient(175deg,#10B981,#059669)', color: '#fff', boxShadow: t.activo ? '0 3px 10px rgba(239,68,68,0.35)' : '0 3px 10px rgba(16,185,129,0.35)' }}>
              {t.activo ? (isSM ? 'DESACT.' : 'DESACTIVAR') : 'ACTIVAR'}
            </button>
            <button onClick={() => openEdit(t)} style={{ flex: 1, height: isSM ? 28 : 40, borderRadius: isSM ? 7 : 10, border: 'none', fontSize: isSM ? 10 : 14, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.03em', background: 'linear-gradient(175deg,#3B82F6,#1D4ED8)', color: '#fff', boxShadow: '0 3px 10px rgba(59,130,246,0.35)' }}>
              EDITAR
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <style>{`
        .tg-xl{display:grid;grid-template-columns:1fr;gap:14px}
        .tg-lg{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
        .tg-md{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .tg-sm{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .tg-list{display:flex;flex-direction:column;gap:6px}
        @media(max-width:1000px){.tg-sm{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:750px){.tg-lg,.tg-md,.tg-sm{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:480px){.tg-lg,.tg-md,.tg-sm{grid-template-columns:1fr}}
      `}</style>

      {/* Action buttons row */}
      {activeTab === 'tiendas' && canEditTiendas && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button style={S.syncBtn} onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sincronizando…' : '↻ Sheets → Supabase'}
          </button>
          <button onClick={handleExportSheets} disabled={exporting}
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 10, color: '#A5B4FC', padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {exporting ? 'Exportando…' : '↑ Supabase → Sheets'}
          </button>
          <button style={S.addBtn} onClick={openAdd}>+ Nueva</button>
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, background: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 6 }}>
        {([
          { id: 'tiendas'    as const, label: 'GESTIONAR TIENDAS', Icon: Store,        color: '#6366F1', dark: '#4338CA', shadow: 'rgba(99,102,241,0.45)'  },
          { id: 'calendario' as const, label: source === 'armado' ? 'CALENDARIO ARMADO' : 'CALENDARIO DESPACHO', Icon: CalendarDays, color: '#D42B2B', dark: '#991B1B', shadow: 'rgba(212,43,43,0.45)'  },
        ]).map(({ id, label, Icon, color, dark, shadow }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              flex: 1, height: 72, borderRadius: 13, cursor: 'pointer', border: 'none',
              transition: 'all 0.18s ease', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 7,
              background: active ? `linear-gradient(175deg,${color} 0%,${dark} 100%)` : 'transparent',
              boxShadow: active ? `0 4px 20px ${shadow},inset 0 1px 0 rgba(255,255,255,0.15)` : 'none',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? 'rgba(255,255,255,0.22)' : `linear-gradient(145deg,${color},${dark})`,
                boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.3)' : `0 4px 12px ${shadow},inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}>
                <Icon size={20} color="#fff" strokeWidth={1.7} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.07em', color: active ? '#fff' : 'rgba(255,255,255,0.5)' }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Calendario tab */}
      {activeTab === 'calendario' && <CalendarioColumnas readOnly={!canEditCalendario} source={source} />}

      {/* Tiendas tab */}
      {activeTab === 'tiendas' && <>
        {msg && (
          <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 10, color: '#34D399', padding: '10px 14px', marginBottom: skipped.length ? 8 : 14, fontSize: 13 }}>
            {msg}
          </div>
        )}
        {skipped.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ color: '#F87171', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              ⚠️ {skipped.length} fila{skipped.length > 1 ? 's' : ''} no importada{skipped.length > 1 ? 's' : ''} — código no reconocido:
            </div>
            {skipped.map((s, i) => (
              <div key={i} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 4 }}>
                Fila {s.row}: <span style={{ color: '#FCA5A5', fontFamily: 'monospace' }}>{s.raw}</span> — {s.reason}
              </div>
            ))}
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 8 }}>
              Puedes agregarlas manualmente con el botón + Nueva si el código tiene un formato distinto.
            </div>
          </div>
        )}

        {/* Search + stats + view mode */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por código, nombre o región…"
            style={{ ...S.input, flex: 1, minWidth: 180 }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
            <button
              onClick={() => setActiveFilter(f => f === 'activas' ? 'all' : 'activas')}
              style={{ display: 'flex', alignItems: 'baseline', gap: 4, background: activeFilter === 'activas' ? 'rgba(16,185,129,0.2)' : 'transparent', border: activeFilter === 'activas' ? '1px solid rgba(16,185,129,0.5)' : '1px solid transparent', borderRadius: 8, padding: '2px 8px', cursor: 'pointer', transition: 'all 0.15s' }}>
              <span style={{ color: '#34D399', fontWeight: 900, fontSize: 28, lineHeight: 1 }}>{activas}</span>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>activas</span>
            </button>
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, margin: '0 2px' }}>·</span>
            <button
              onClick={() => setActiveFilter(f => f === 'inactivas' ? 'all' : 'inactivas')}
              style={{ display: 'flex', alignItems: 'baseline', gap: 4, background: activeFilter === 'inactivas' ? 'rgba(239,68,68,0.15)' : 'transparent', border: activeFilter === 'inactivas' ? '1px solid rgba(239,68,68,0.4)' : '1px solid transparent', borderRadius: 8, padding: '2px 8px', cursor: 'pointer', transition: 'all 0.15s' }}>
              <span style={{ color: '#F87171', fontWeight: 900, fontSize: 28, lineHeight: 1 }}>{inactivas}</span>
              <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>inactivas</span>
            </button>
          </div>

          {/* View mode toolbar */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 3, border: '1px solid rgba(255,255,255,0.08)' }}>
            {VIEW_OPTS.map(({ id, label, Icon }) => (
              <button key={id} title={label} onClick={() => setViewMode(id)} style={{
                width: 34, height: 34, borderRadius: 8, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: viewMode === id ? 'rgba(99,102,241,0.35)' : 'transparent',
                color: viewMode === id ? '#A5B4FC' : 'rgba(255,255,255,0.3)',
                transition: 'all 0.15s',
              }}>
                <Icon />
              </button>
            ))}
          </div>
        </div>

        {/* Sort toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginRight: 2 }}>ORDENAR</span>
          {SORT_OPTS.map(({ id, label, sym }) => {
            const active = sortBy === id;
            const isTimeBased = id === 'recientes' || id === 'modificadas';
            const unavail = isTimeBased && !hasTimestamps;
            return (
              <button key={id} onClick={() => !unavail && handleSortClick(id)}
                title={unavail ? 'Requiere columna updated_at en Supabase' : label}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  height: 28, borderRadius: 8, padding: '0 10px',
                  border: `1px solid ${active ? 'rgba(99,102,241,0.55)' : 'rgba(255,255,255,0.1)'}`,
                  background: active ? 'rgba(99,102,241,0.2)' : unavail ? 'transparent' : 'rgba(255,255,255,0.04)',
                  color: active ? '#A5B4FC' : unavail ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: unavail ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 11, opacity: 0.8 }}>{sym}</span>
                <span>{label}</span>
                {active && (
                  <span style={{ fontSize: 10, marginLeft: 1, opacity: 0.8 }}>
                    {sortDir === 'asc' ? '↑' : '↓'}
                  </span>
                )}
                {unavail && <span style={{ fontSize: 9, marginLeft: 1 }}>⊘</span>}
              </button>
            );
          })}
          {/* Result count */}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
            {filtered.length} tienda{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>Cargando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', paddingTop: 60 }}>
            {tiendas.length === 0 ? 'No hay tiendas. Usa "Sheets → Supabase" para importar.' : 'Sin resultados'}
          </div>
        ) : (
          <div className={GRID_CLASS[viewMode]}>
            {filtered.map(t => renderCard(t))}
          </div>
        )}
      </>}

      {/* Modal */}
      {modal && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={S.modal}>
            <div style={{ color: '#fff', fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
              {modal === 'add' ? 'Nueva Tienda' : `Editar: ${form.codigo}`}
            </div>
            <div style={S.grid2}>
              <div><label style={S.label}>Código *</label><input style={S.input} value={form.codigo} onChange={f('codigo')} placeholder="ej: 02SCL" disabled={modal === 'edit'} /></div>
              <div><label style={S.label}>Nombre *</label><input style={S.input} value={form.nombre} onChange={f('nombre')} placeholder="San Carlos" /></div>
            </div>
            <div style={{ marginTop: 12 }}><label style={S.label}>Dirección</label><input style={S.input} value={form.direccion} onChange={f('direccion')} placeholder="Av. Plaza 1250, Las Condes" /></div>
            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div><label style={S.label}>Región</label><input style={S.input} value={form.region} onChange={f('region')} placeholder="Región Metropolitana" /></div>
              <div><label style={S.label}>Sector/Comuna</label><input style={S.input} value={form.sector_comuna} onChange={f('sector_comuna')} placeholder="Las Condes" /></div>
            </div>
            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div><label style={S.label}>Corredor</label><input style={S.input} value={form.corredor} onChange={f('corredor')} placeholder="Corredor Oriente" /></div>
              <div><label style={S.label}>Tipo</label><input style={S.input} value={form.tipo} onChange={f('tipo')} placeholder="Premium" /></div>
            </div>
            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div><label style={S.label}>Ventana horaria</label><input style={S.input} value={form.ventana} onChange={f('ventana')} placeholder="09:00-12:00" /></div>
              <div><label style={S.label}>Frecuencia</label><input style={S.input} value={form.frecuencia} onChange={f('frecuencia')} placeholder="Diario" /></div>
            </div>
            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div><label style={S.label}>Latitud</label><input style={S.input} type="number" step="any" value={form.lat ?? ''} onChange={e => setForm(p => ({ ...p, lat: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="-33.391885" /></div>
              <div><label style={S.label}>Longitud</label><input style={S.input} type="number" step="any" value={form.lon ?? ''} onChange={e => setForm(p => ({ ...p, lon: e.target.value ? parseFloat(e.target.value) : null }))} placeholder="-70.506455" /></div>
            </div>
            <div style={{ marginTop: 12 }}><label style={S.label}>Correos (separados por coma)</label><input style={S.input} value={form.correos} onChange={f('correos')} placeholder="encargado@tienda.cl" /></div>
            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div><label style={S.label}>Tel. Encargado</label><input style={S.input} value={form.tel_encargado} onChange={f('tel_encargado')} placeholder="+56 9 1234 5678" /></div>
              <div><label style={S.label}>Supervisor</label><input style={S.input} value={form.supervisor} onChange={f('supervisor')} placeholder="Nombre supervisor" /></div>
            </div>
            <div style={{ ...S.grid2, marginTop: 12 }}>
              <div><label style={S.label}>Tel. Supervisor</label><input style={S.input} value={form.tel_supervisor} onChange={f('tel_supervisor')} placeholder="+56 9 8765 4321" /></div>
              <div><label style={S.label}>Transportista</label><input style={S.input} value={form.transportista} onChange={f('transportista')} placeholder="Chilexpress" /></div>
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="activo-check" checked={form.activo} onChange={f('activo')} style={{ width: 16, height: 16, cursor: 'pointer' }} />
              <label htmlFor="activo-check" style={{ ...S.label, margin: 0, cursor: 'pointer' }}>Tienda activa</label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', padding: '11px 0', fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving || !form.codigo || !form.nombre} style={{ flex: 2, background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 10, color: '#34D399', padding: '11px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!form.codigo || !form.nombre) ? 0.5 : 1 }}>
                {saving ? 'Guardando…' : modal === 'add' ? 'Crear tienda' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
