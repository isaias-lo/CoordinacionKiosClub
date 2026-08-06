'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Store, CalendarDays, Plus, RefreshCw, Upload,
  Search, Settings2, ChevronUp, ChevronDown, ToggleLeft, ToggleRight,
} from 'lucide-react';
import CalendarioColumnas from './CalendarioColumnas';
import { parseCoord } from './coords';
import { frecuenciasPorTienda } from './frecuencia';
import { fetchCalendarioCompleto, subscribeToCalendarChanges } from '../despacho/utils/useCalendario';

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

type SortBy  = 'nombre' | 'codigo' | 'region' | 'estado' | 'recientes' | 'modificadas';
type SortDir = 'asc' | 'desc';

const SORT_OPTS: { id: SortBy; label: string }[] = [
  { id: 'nombre',      label: 'Nombre'      },
  { id: 'codigo',      label: 'Código'      },
  { id: 'region',      label: 'Región'      },
  { id: 'estado',      label: 'Estado'      },
  { id: 'recientes',   label: 'Recientes'   },
  { id: 'modificadas', label: 'Modificadas' },
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

// ── Sub-components ────────────────────────────────────────────────────────────

function Badge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      padding: '2px 8px', borderRadius: 20,
      background: active ? '#DCFCE7' : '#FEE2E2',
      color:      active ? '#16A34A' : '#DC2626',
      border: `1px solid ${active ? '#BBF7D0' : '#FECACA'}`,
    }}>
      {active ? 'Activa' : 'Inactiva'}
    </span>
  );
}

function CodeBadge({ code }: { code: string }) {
  return (
    <span style={{
      fontFamily: 'monospace', fontSize: 12, fontWeight: 800,
      background: '#EFF6FF', color: '#2563EB', borderRadius: 6,
      padding: '2px 8px', letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {code}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

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
  const [msgType,   setMsgType]   = useState<'ok' | 'err'>('ok');
  const [search,    setSearch]    = useState('');
  const [modal,     setModal]     = useState<'add' | 'edit' | null>(null);
  const [form,      setForm]      = useState<Tienda>(EMPTY);
  // Inputs de coordenadas como texto (permiten teclear coma decimal); se parsean al guardar.
  const [latStr,    setLatStr]    = useState('');
  const [lonStr,    setLonStr]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [togglingCod, setTogglingCod] = useState<string | null>(null);
  const [skipped,      setSkipped]      = useState<{ row: number; raw: string; reason: string }[]>([]);
  const [activeTab,    setActiveTab]    = useState<'tiendas' | 'calendario'>('tiendas');
  const [activeFilter, setActiveFilter] = useState<'all' | 'activas' | 'inactivas'>('all');
  const [sortBy,  setSortBy]  = useState<SortBy>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('tiendas_sort_by') as SortBy) ?? 'nombre' : 'nombre');
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('tiendas_sort_dir') as SortDir) ?? 'asc' : 'asc');

  // Frecuencia DERIVADA del Calendario Central (cod → "MA-JU-VI"), no del campo manual (que suele
  // quedar vacío). Se actualiza sola cuando cambia el calendario (cross-device).
  const [freqByCod, setFreqByCod] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    fetchCalendarioCompleto().then(cal => { if (alive) setFreqByCod(frecuenciasPorTienda(cal)); }).catch(() => {});
    const unsub = subscribeToCalendarChanges(cal => setFreqByCod(frecuenciasPorTienda(cal)));
    return () => { alive = false; unsub(); };
  }, []);

  useEffect(() => { localStorage.setItem('tiendas_sort_by',  sortBy);  }, [sortBy]);
  useEffect(() => { localStorage.setItem('tiendas_sort_dir', sortDir); }, [sortDir]);

  function handleSortClick(id: SortBy) {
    if (sortBy === id) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(id); setSortDir('asc'); }
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
        setMsgType('ok');
        setMsg(`Sincronizado: ${data.synced} tiendas${data.skipped?.length ? ` · ${data.skipped.length} saltadas` : ''}`);
        setSkipped(data.skipped ?? []);
        await load();
      } else { setMsgType('err'); setMsg(data.error ?? 'Error desconocido'); }
    } catch { setMsgType('err'); setMsg('Error de conexión'); }
    finally { setSyncing(false); }
  }

  async function handleExportSheets() {
    setExporting(true); setMsg('');
    try {
      const res  = await fetch('/api/tiendas/export-sheets', { method: 'POST' });
      const data = await res.json() as { ok?: boolean; exported?: number; error?: string };
      if (data.ok) { setMsgType('ok'); setMsg(`Exportado: ${data.exported} tiendas → Google Sheets`); }
      else { setMsgType('err'); setMsg(data.error ?? 'Error'); }
    } catch { setMsgType('err'); setMsg('Error de conexión'); }
    finally { setExporting(false); }
  }

  function openAdd()           { setForm(EMPTY);    setLatStr('');                              setLonStr('');                              setModal('add');  }
  function openEdit(t: Tienda) { setForm({ ...t }); setLatStr(t.lat != null ? String(t.lat) : ''); setLonStr(t.lon != null ? String(t.lon) : ''); setModal('edit'); }

  async function handleSave() {
    if (!form.codigo || !form.nombre) return;
    setSaving(true);
    try {
      // Coordenadas: parsear los inputs de texto (aceptan coma o punto) → número o null.
      // Sincroniza la frecuencia derivada del calendario a la columna almacenada (si la tienda está
      // en el calendario) para que otros consumidores (Bodega) usen el mismo dato.
      const payload = { ...form, lat: parseCoord(latStr, 90), lon: parseCoord(lonStr, 180), frecuencia: freqByCod[form.codigo] || form.frecuencia };
      const res  = await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as { tienda?: Tienda; sheetSynced?: boolean; error?: string };
      if (data.tienda) {
        const wasAdd = modal === 'add';
        setModal(null); await load();
        const base = wasAdd ? 'Tienda agregada' : 'Tienda actualizada';
        if (data.sheetSynced === false) {
          setMsgType('err');
          setMsg(`${base} en la BD, pero ⚠ no se pudo sincronizar a Google Sheets. Reintenta con "DB → Sheets".`);
        } else {
          setMsgType('ok'); setMsg(`${base} · Google Sheets sincronizado ✓`);
        }
      } else { setMsgType('err'); setMsg(data.error ?? 'Error'); }
    } catch {
      setMsgType('err'); setMsg('No se pudo guardar (error de conexión o tiempo de espera). Reintenta.');
    } finally { setSaving(false); }
  }

  async function handleToggleActivo(t: Tienda) {
    if (togglingCod) return;               // evita doble clic mientras sincroniza
    setTogglingCod(t.codigo);
    try {
      const res  = await fetch('/api/tiendas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...t, activo: !t.activo }) });
      const data = await res.json().catch(() => ({})) as { sheetSynced?: boolean };
      await load();
      if (data.sheetSynced === false) {
        setMsgType('err'); setMsg('Estado actualizado en la BD, pero ⚠ Google Sheets no se sincronizó.');
      }
    } catch {
      setMsgType('err'); setMsg('No se pudo actualizar el estado (conexión). Reintenta.');
    } finally {
      setTogglingCod(null);
    }
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
  const filtered = sortTiendas(baseFiltered, sortBy, sortDir);
  const hasTimestamps = filtered.some(t => t.created_at || t.updated_at);

  // ── Input/label helpers ───────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', border: '1px solid #E2E8F0', borderRadius: 8,
    padding: '8px 12px', fontSize: 13, outline: 'none',
    background: '#fff', color: '#0F172A', boxSizing: 'border-box',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 4, display: 'block',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F8FAFC', fontFamily: 'inherit' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Settings2 size={18} color="#2563EB" strokeWidth={1.8} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>Config. Tiendas</div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>Gestión de tiendas y calendario central</div>
        </div>

        {/* Stats */}
        {activeTab === 'tiendas' && !loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setActiveFilter(f => f === 'activas' ? 'all' : 'activas')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: `1px solid ${activeFilter === 'activas' ? '#BBF7D0' : '#E2E8F0'}`, background: activeFilter === 'activas' ? '#F0FDF4' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#16A34A' }}>{activas}</span>
              <span style={{ fontSize: 12, color: '#64748B' }}>activas</span>
            </button>
            <button onClick={() => setActiveFilter(f => f === 'inactivas' ? 'all' : 'inactivas')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: `1px solid ${activeFilter === 'inactivas' ? '#FECACA' : '#E2E8F0'}`, background: activeFilter === 'inactivas' ? '#FEF2F2' : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>{inactivas}</span>
              <span style={{ fontSize: 12, color: '#64748B' }}>inactivas</span>
            </button>
          </div>
        )}

        {/* Action buttons */}
        {activeTab === 'tiendas' && canEditTiendas && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSync} disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', opacity: syncing ? 0.6 : 1 }}>
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Sincronizando…' : 'Sheets → DB'}
            </button>
            <button onClick={handleExportSheets} disabled={exporting}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', opacity: exporting ? 0.6 : 1 }}>
              <Upload size={13} />
              {exporting ? 'Exportando…' : 'DB → Sheets'}
            </button>
            <button onClick={openAdd}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} />
              Nueva
            </button>
          </div>
        )}
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', gap: 0, paddingLeft: 24, flexShrink: 0 }}>
        {([
          { id: 'tiendas'    as const, label: 'Tiendas',    Icon: Store        },
          { id: 'calendario' as const, label: source === 'armado' ? 'Calendario Armado' : 'Calendario Central', Icon: CalendarDays },
        ]).map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '11px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? '#2563EB' : '#64748B',
              background: 'none', borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1,
            }}>
              <Icon size={14} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

        {/* Calendario tab */}
        {activeTab === 'calendario' && <CalendarioColumnas readOnly={!canEditCalendario} source={source} />}

        {/* Tiendas tab */}
        {activeTab === 'tiendas' && (
          <>
            {/* Feedback banner */}
            {msg && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, background: msgType === 'ok' ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${msgType === 'ok' ? '#BBF7D0' : '#FECACA'}`, color: msgType === 'ok' ? '#16A34A' : '#DC2626' }}>
                <span>{msg}</span>
                <button onClick={() => setMsg('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: 0 }}>✕</button>
              </div>
            )}

            {/* Skipped rows */}
            {skipped.length > 0 && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ color: '#DC2626', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  {skipped.length} fila{skipped.length > 1 ? 's' : ''} no importada{skipped.length > 1 ? 's' : ''} — código no reconocido
                </div>
                {skipped.map((s, i) => (
                  <div key={i} style={{ color: '#64748B', fontSize: 12, marginTop: 3 }}>
                    Fila {s.row}: <code style={{ background: '#FECACA', padding: '0 4px', borderRadius: 3, color: '#DC2626' }}>{s.raw}</code> — {s.reason}
                  </div>
                ))}
              </div>
            )}

            {/* Search + sort toolbar */}
            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Search */}
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por código, nombre o región…"
                  style={{ ...inp, paddingLeft: 30 }} />
              </div>

              {/* Sort pills */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginRight: 2 }}>ORDENAR</span>
                {SORT_OPTS.map(({ id, label }) => {
                  const active = sortBy === id;
                  const isTimeBased = id === 'recientes' || id === 'modificadas';
                  const unavail = isTimeBased && !hasTimestamps;
                  return (
                    <button key={id} onClick={() => !unavail && handleSortClick(id)}
                      title={unavail ? 'Sin datos de fecha disponibles' : label}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        height: 26, padding: '0 10px', borderRadius: 6, fontSize: 12,
                        fontWeight: active ? 700 : 500,
                        border: `1px solid ${active ? '#BFDBFE' : '#E2E8F0'}`,
                        background: active ? '#EFF6FF' : unavail ? 'transparent' : '#fff',
                        color: active ? '#2563EB' : unavail ? '#CBD5E1' : '#475569',
                        cursor: unavail ? 'not-allowed' : 'pointer',
                        transition: 'all 0.15s',
                      }}>
                      {label}
                      {active && (sortDir === 'asc'
                        ? <ChevronUp size={11} />
                        : <ChevronDown size={11} />
                      )}
                    </button>
                  );
                })}
                <span style={{ marginLeft: 6, fontSize: 12, color: '#94A3B8' }}>
                  {filtered.length} tienda{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Grid */}
            {loading ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', paddingTop: 60, fontSize: 14 }}>Cargando…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', paddingTop: 60, fontSize: 14 }}>
                {tiendas.length === 0 ? 'No hay tiendas. Usa "Sheets → DB" para importar.' : 'Sin resultados para esta búsqueda.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {filtered.map(t => {
                  const tsValue = sortBy === 'recientes' ? t.created_at : (t.updated_at ?? t.created_at);
                  const tsText  = relativeTime(tsValue);
                  return (
                    <div key={t.codigo} style={{ background: '#fff', border: `1px solid ${t.activo ? '#E2E8F0' : '#FECACA'}`, borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s' }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <CodeBadge code={t.codigo} />
                        <Badge active={t.activo} />
                        {tsText && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8' }}>{tsText}</span>}
                      </div>

                      {/* Name */}
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 8, lineHeight: 1.3 }}>{t.nombre}</div>

                      {/* Tags */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                        {t.region    && <span style={{ fontSize: 11, color: '#475569', background: '#F1F5F9', borderRadius: 4, padding: '2px 7px' }}>{t.region}</span>}
                        {t.corredor  && <span style={{ fontSize: 11, color: '#475569', background: '#F1F5F9', borderRadius: 4, padding: '2px 7px' }}>{t.corredor}</span>}
                        {t.ventana   && <span style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>{t.ventana}</span>}
                        {freqByCod[t.codigo] && <span style={{ fontSize: 11, color: '#1D4ED8', background: '#EFF6FF', borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>{freqByCod[t.codigo]}</span>}
                      </div>

                      {/* Details */}
                      {t.direccion && <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>{t.direccion}</div>}
                      {(t.supervisor || t.transportista) && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          {t.supervisor    && <span style={{ fontSize: 11, color: '#64748B' }}>Sup: {t.supervisor}</span>}
                          {t.transportista && <span style={{ fontSize: 11, color: '#64748B' }}>{t.transportista}</span>}
                        </div>
                      )}

                      {/* Actions */}
                      {canEditTiendas && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10 }}>
                          <button onClick={() => handleToggleActivo(t)} disabled={togglingCod === t.codigo}
                            style={{ flex: 1, height: 32, borderRadius: 7, border: `1px solid ${t.activo ? '#FECACA' : '#BBF7D0'}`, background: t.activo ? '#FEF2F2' : '#F0FDF4', color: t.activo ? '#DC2626' : '#16A34A', fontSize: 12, fontWeight: 700, cursor: togglingCod === t.codigo ? 'wait' : 'pointer', opacity: togglingCod === t.codigo ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            {togglingCod === t.codigo
                              ? '…'
                              : t.activo
                                ? <><ToggleLeft size={13} /> Desactivar</>
                                : <><ToggleRight size={13} /> Activar</>
                            }
                          </button>
                          <button onClick={() => openEdit(t)}
                            style={{ flex: 1, height: 32, borderRadius: 7, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Editar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal ────────────────────────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px', width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                {modal === 'add' ? 'Nueva Tienda' : `Editar: ${form.codigo}`}
              </div>
              <button onClick={() => setModal(null)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: 16 }}>✕</button>
            </div>

            {/* Form grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>Código *</label><input style={inp} value={form.codigo} onChange={f('codigo')} placeholder="02SCL" disabled={modal === 'edit'} /></div>
              <div><label style={lbl}>Nombre *</label><input style={inp} value={form.nombre} onChange={f('nombre')} placeholder="San Carlos" /></div>
            </div>
            <div style={{ marginTop: 12 }}><label style={lbl}>Dirección</label><input style={inp} value={form.direccion} onChange={f('direccion')} placeholder="Av. Plaza 1250, Las Condes" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Región</label><input style={inp} value={form.region} onChange={f('region')} placeholder="Región Metropolitana" /></div>
              <div><label style={lbl}>Sector / Comuna</label><input style={inp} value={form.sector_comuna} onChange={f('sector_comuna')} placeholder="Las Condes" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Corredor</label><input style={inp} value={form.corredor} onChange={f('corredor')} placeholder="Corredor Oriente" /></div>
              <div><label style={lbl}>Tipo</label><input style={inp} value={form.tipo} onChange={f('tipo')} placeholder="Premium" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Ventana horaria</label><input style={inp} value={form.ventana} onChange={f('ventana')} placeholder="09:00-12:00" /></div>
              <div>
                <label style={lbl}>Frecuencia <span style={{ fontWeight: 400, color: '#94A3B8', textTransform: 'none', letterSpacing: 0 }}>· del Calendario Central</span></label>
                <input style={{ ...inp, background: '#F8FAFC', color: '#475569', cursor: 'default' }} readOnly
                  value={freqByCod[form.codigo] || form.frecuencia || ''}
                  placeholder="— (la tienda no está en el calendario)" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Latitud</label><input style={inp} type="text" inputMode="decimal" value={latStr} onChange={e => setLatStr(e.target.value)} placeholder="-33.391885" /></div>
              <div><label style={lbl}>Longitud</label><input style={inp} type="text" inputMode="decimal" value={lonStr} onChange={e => setLonStr(e.target.value)} placeholder="-70.506455" /></div>
            </div>
            <div style={{ marginTop: 12 }}><label style={lbl}>Correos (separados por coma)</label><input style={inp} value={form.correos} onChange={f('correos')} placeholder="encargado@tienda.cl" /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Tel. Encargado</label><input style={inp} value={form.tel_encargado} onChange={f('tel_encargado')} placeholder="+56 9 1234 5678" /></div>
              <div><label style={lbl}>Supervisor</label><input style={inp} value={form.supervisor} onChange={f('supervisor')} placeholder="Nombre supervisor" /></div>
            </div>
            {/* Transportista: se define en el Enrutador al asignar patente (viene de la FLOTA), no se
                edita aquí. Se preserva el valor existente al guardar (no se borra la columna). */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Tel. Supervisor</label><input style={inp} value={form.tel_supervisor} onChange={f('tel_supervisor')} placeholder="+56 9 8765 4321" /></div>
            </div>

            {/* Active toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <input type="checkbox" id="activo-check" checked={form.activo} onChange={f('activo')} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#2563EB' }} />
              <label htmlFor="activo-check" style={{ fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Tienda activa</label>
            </div>

            {/* Footer buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setModal(null)} style={{ flex: 1, height: 38, borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.codigo || !form.nombre}
                style={{ flex: 2, height: 38, borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (!form.codigo || !form.nombre) ? 0.5 : 1 }}>
                {saving ? 'Guardando…' : modal === 'add' ? 'Crear tienda' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
