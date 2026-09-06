'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { camposSenduFaltantes } from '@/features/despacho/regiones/data/senduCompletitud';
import { esSectorRegiones } from '@/features/despacho/regiones/data/tiendas';
import { despachoPorSendu } from '@/features/despacho/regiones/data/despachoPorSendu';
import { coherenciaCatalogo, type CalendarioPorDia } from './coherenciaCatalogo';
import AddressAutocomplete from '@/features/despacho/rutas/components/AddressAutocomplete';
import { desarmarDireccion, type ComponenteGoogle } from './direccionGoogle';
import { sugerirSector, type SugerenciaSector } from './sugerirSector';
import { seAbastecePorCalendario } from '@/features/despacho/rutas/utils/codigosEspeciales';
import { ZONAS_DEFAULT, type ConfigZonas } from '@/features/despacho/rutas/utils/zonasTransporte';
import { opcionesSector } from '@/lib/sectores';
import {
  Store, CalendarDays, Snowflake, Plus, RefreshCw, Upload, Truck, History,
  Search, Settings2, ChevronUp, ChevronDown, ToggleLeft, ToggleRight,
} from 'lucide-react';
import CalendarioColumnas from './CalendarioColumnas';
import TransportistasTab from './TransportistasTab';
import BitacoraTab from './BitacoraTab';
import { parseCoord } from './coords';
import { frecuenciasPorTienda } from './frecuencia';
import { fetchCalendarioCompleto, subscribeToCalendarChanges } from '../despacho/utils/useCalendario';
import { fetchCalendarioCongelados, subscribeToCalendarioCongelados } from '@/lib/calendarioCongeladosSync';

export interface Tienda {
  codigo: string; nombre: string; direccion: string; region: string;
  sector_comuna: string; corredor: string; tipo: string; ventana: string;
  frecuencia: string; prom_por_dia: string; lat: number | null; lon: number | null;
  correos: string; tel_encargado: string; supervisor: string;
  // [Fase 4] Datos que el export de Sendu necesita. Antes no tenían columna ni campo: agregar una
  // tienda de Regiones exigía que un desarrollador la escribiera en el código y desplegara.
  region_sendu: string; comuna: string; calle: string; numero: string; complemento: string;
  tel_supervisor: string; transportista: string; recepcion_pallet: string; activo: boolean;
  created_at?: string; updated_at?: string;
}

const EMPTY: Tienda = {
  codigo: '', nombre: '', direccion: '', region: '', sector_comuna: '',
  corredor: '', tipo: '', ventana: '', frecuencia: '', prom_por_dia: '',
  lat: null, lon: null, correos: '', tel_encargado: '', supervisor: '',
  region_sendu: '', comuna: '', calle: '', numero: '', complemento: '',
  tel_supervisor: '', transportista: '', recepcion_pallet: '', activo: true,
};

type SortBy  = 'nombre' | 'codigo' | 'region' | 'estado' | 'recientes' | 'modificadas'
             | 'comuna' | 'tipo' | 'ventana' | 'frecuencia' | 'coords';
type SortDir = 'asc' | 'desc';

const SORT_OPTS: { id: SortBy; label: string }[] = [
  { id: 'nombre',      label: 'Nombre'      },
  { id: 'codigo',      label: 'Código'      },
  { id: 'region',      label: 'Región'      },
  { id: 'estado',      label: 'Estado'      },
  { id: 'recientes',   label: 'Recientes'   },
  { id: 'modificadas', label: 'Modificadas' },
];

// Estilos de la vista Tabla (planilla densa, estilo unificado)
const TABLA_COLS: { label: string; sort: SortBy }[] = [
  { label: 'Código', sort: 'codigo' }, { label: 'Nombre', sort: 'nombre' }, { label: 'Región', sort: 'region' },
  { label: 'Comuna', sort: 'comuna' }, { label: 'Tipo', sort: 'tipo' }, { label: 'Ventana', sort: 'ventana' },
  { label: 'Frecuencia', sort: 'frecuencia' }, { label: 'Coords', sort: 'coords' }, { label: 'Estado', sort: 'estado' },
];
const TH_CELL: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 1, textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1B2A6B', background: '#F1F5F9', borderBottom: '2px solid rgba(27,42,107,0.18)', whiteSpace: 'nowrap' };
const TD_CELL: React.CSSProperties = { padding: '7px 12px', borderBottom: '1px solid #F1F5F9', color: '#374151', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 };

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

function sortTiendas(list: Tienda[], by: SortBy, dir: SortDir, freqByCod: Record<string, string> = {}): Tienda[] {
  return [...list].sort((a, b) => {
    let cmp = 0;
    switch (by) {
      case 'nombre':      cmp = a.nombre.localeCompare(b.nombre, 'es'); break;
      case 'codigo':      cmp = a.codigo.localeCompare(b.codigo, 'es'); break;
      case 'region':      cmp = a.region.localeCompare(b.region, 'es'); break;
      case 'comuna':      cmp = (a.sector_comuna || '').localeCompare(b.sector_comuna || '', 'es'); break;
      case 'tipo':        cmp = (a.tipo || '').localeCompare(b.tipo || '', 'es'); break;
      case 'ventana':     cmp = (a.ventana || '').localeCompare(b.ventana || '', 'es'); break;
      case 'frecuencia':  cmp = (freqByCod[a.codigo] || '').localeCompare(freqByCod[b.codigo] || '', 'es'); break;
      case 'coords':      cmp = (a.lat != null && a.lon != null ? 0 : 1) - (b.lat != null && b.lon != null ? 0 : 1); break;
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
  // Quién transporta cada zona (Config → Transportistas). De acá sale si la tienda va por Sendu.
  const [zonas,     setZonas]     = useState<ConfigZonas>(ZONAS_DEFAULT);
  // Los datos de Sendu no dependen de la geografía sino de QUIÉN transporta: Sendu es el sistema
  // de Falabella, y desde que Luis Fica tomó el sur (31/08/2026) solo el norte pasa por ahí.
  // Preguntar "¿es Regiones?" le pedía esos datos a 14 tiendas que ya no los usan.
  // La latitud se toma del input en vivo: al elegir "Región" a secas, es la que decide la zona.
  const sendu = despachoPorSendu({ sector_comuna: form.sector_comuna, lat: parseCoord(latStr, 90) ?? form.lat }, zonas);
  // En Config los campos se llaman `correos` y `tel_encargado`; en el export de Sendu, `email` y
  // `celular`. Sin mapearlos, los dos saldrían siempre como faltantes.
  const faltaSendu = sendu.aplica
    ? camposSenduFaltantes({ ...form, email: form.correos, celular: form.tel_encargado })
    : [];
  const [saving,    setSaving]    = useState(false);
  const [togglingCod, setTogglingCod] = useState<string | null>(null);
  // [P3] Diálogo de eliminar: se consulta el USO antes de ofrecer el borrado real.
  const [borrar, setBorrar] = useState<{
    tienda: Tienda;
    cargando: boolean;
    puedeEliminar?: boolean;
    enCalendario?: boolean;
    usos?: Record<string, number>;
    confirmacion: string;
    borrando: boolean;
  } | null>(null);
  const [skipped,      setSkipped]      = useState<{ row: number; raw: string; reason: string }[]>([]);
  const [activeTab,    setActiveTab]    = useState<'tiendas' | 'calendario' | 'congelados' | 'transportistas' | 'bitacora'>('tiendas');
  const [activeFilter, setActiveFilter] = useState<'all' | 'activas' | 'inactivas'>('all');
  const [coherenciaAbierta, setCoherenciaAbierta] = useState(false);
  // Autocompletado de dirección: lo que Google devolvió y el sector que se propone a partir de eso.
  const [gmapsCaido,  setGmapsCaido]  = useState(false);
  const [sugerencia,  setSugerencia]  = useState<SugerenciaSector | null>(null);
  const [sortBy,  setSortBy]  = useState<SortBy>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('tiendas_sort_by') as SortBy) ?? 'nombre' : 'nombre');
  const [sortDir, setSortDir] = useState<SortDir>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('tiendas_sort_dir') as SortDir) ?? 'asc' : 'asc');
  const [viewMode, setViewMode] = useState<'cards' | 'tabla'>(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('tiendas_view') as 'cards' | 'tabla') ?? 'cards' : 'cards');
  useEffect(() => { localStorage.setItem('tiendas_view', viewMode); }, [viewMode]);

  // Frecuencia DERIVADA del Calendario de Abastecimiento (cod → "MA-JU-VI"), no del campo manual (que suele
  // quedar vacío). Se actualiza sola cuando cambia el calendario (cross-device).
  const [freqByCod, setFreqByCod] = useState<Record<string, string>>({});
  // El calendario COMPLETO, del mismo fetch: alimenta el chequeo de coherencia sin pedir nada extra.
  const [calCompleto, setCalCompleto] = useState<CalendarioPorDia | null>(null);
  useEffect(() => {
    let alive = true;
    const aplicar = (cal: Parameters<typeof frecuenciasPorTienda>[0]) => {
      setFreqByCod(frecuenciasPorTienda(cal));
      setCalCompleto((cal ?? null) as CalendarioPorDia | null);
    };
    fetchCalendarioCompleto().then(cal => { if (alive) aplicar(cal); }).catch(() => {});
    const unsub = subscribeToCalendarChanges(cal => aplicar(cal));
    return () => { alive = false; unsub(); };
  }, []);

  // [Fase 5] Coherencia del catálogo. El calendario, los grupos y las zonas se derivan del
  // catálogo y nada comprobaba que siguieran coincidiendo: van seis desincronizaciones de este
  // tipo encontradas en dos días, y ninguna falla ruidosamente — la operación se entera cuando
  // el camión sale mal. Se calcula acá, que es donde se arreglan.
  const incoherencias = useMemo(
    () => (calCompleto ? coherenciaCatalogo(tiendas, calCompleto, (_c, tipo) => !seAbastecePorCalendario(tipo)) : []),
    [tiendas, calCompleto],
  );

  // Quién transporta cada zona. Decide a qué tiendas se les piden los datos de Sendu, así que
  // se relee al abrir la pestaña Transportistas y volver: si acabas de traspasar una zona, el
  // formulario tiene que reflejarlo sin recargar la página.
  useEffect(() => {
    let alive = true;
    fetch('/api/zonas-transporte')
      .then(r => (r.ok ? r.json() : null))
      .then((j: { data?: ConfigZonas } | null) => { if (alive && j?.data) setZonas(j.data); })
      .catch(() => {});
    return () => { alive = false; };
  }, [activeTab]);

  // Frecuencia derivada del Calendario de Congelados, mismo patrón que freqByCod.
  const [freqCongByCod, setFreqCongByCod] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    fetchCalendarioCongelados().then(cal => { if (alive) setFreqCongByCod(frecuenciasPorTienda(cal)); }).catch(() => {});
    const unsub = subscribeToCalendarioCongelados(cal => setFreqCongByCod(frecuenciasPorTienda(cal)));
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

  // La sugerencia de sector se limpia al abrir CUALQUIER ficha: es de la dirección que se acaba de
  // elegir, y arrastrarla a la tienda siguiente sería proponerle el sector de otra.
  function openAdd()           { setSugerencia(null); setForm(EMPTY);    setLatStr('');                              setLonStr('');                              setModal('add');  }
  function openEdit(t: Tienda) { setSugerencia(null); setForm({ ...t }); setLatStr(t.lat != null ? String(t.lat) : ''); setLonStr(t.lon != null ? String(t.lon) : ''); setModal('edit'); }

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

  // [P3] Abre el diálogo y consulta si la tienda tiene historial. Una tienda con despachos,
  // picking o manifiestos NO se borra (dejaría filas huérfanas): se ofrece desactivarla.
  async function pedirEliminar(t: Tienda) {
    setBorrar({ tienda: t, cargando: true, confirmacion: '', borrando: false });
    try {
      const res = await fetch(`/api/tiendas/uso?codigo=${encodeURIComponent(t.codigo)}`);
      const j = await res.json() as { puedeEliminar?: boolean; enCalendario?: boolean; usos?: Record<string, number> };
      setBorrar(prev => prev && prev.tienda.codigo === t.codigo
        ? { ...prev, cargando: false, puedeEliminar: !!j.puedeEliminar, enCalendario: !!j.enCalendario, usos: j.usos }
        : prev);
    } catch {
      setBorrar(prev => prev ? { ...prev, cargando: false, puedeEliminar: false } : prev);
    }
  }

  async function confirmarEliminar() {
    if (!borrar?.puedeEliminar || borrar.borrando) return;
    const t = borrar.tienda;
    setBorrar(prev => prev ? { ...prev, borrando: true } : prev);
    try {
      const res = await fetch(`/api/tiendas?codigo=${encodeURIComponent(t.codigo)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({})) as { sheetSynced?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setBorrar(null);
      await load();
      setMsg(data.sheetSynced === false
        ? `Tienda ${t.codigo} eliminada, pero no se pudo quitar del Sheet — revísalo a mano.`
        : `Tienda ${t.codigo} eliminada ✓`);
      setMsgType(data.sheetSynced === false ? 'err' : 'ok');
    } catch (e) {
      setBorrar(prev => prev ? { ...prev, borrando: false } : prev);
      setMsg(e instanceof Error ? e.message : 'No se pudo eliminar');
      setMsgType('err');
    }
  }

  async function desactivarDesdeDialogo() {
    if (!borrar) return;
    const t = borrar.tienda;
    setBorrar(null);
    if (t.activo) await handleToggleActivo(t);
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
  /**
   * Aplica al formulario lo que devolvió Google, y propone el sector aparte.
   *
   * Se rellena solo lo que Google SÍ sabe. El sector NO: es una decisión de negocio —"un typo la
   * cambia de camión", dice `sectores.ts`— y ninguna fuente externa conoce los corredores. Se
   * propone con la evidencia a la vista y lo confirma quien crea la tienda.
   *
   * Los campos que ya tienen algo NO se pisan: editar una tienda para corregirle la dirección no
   * puede borrarle en silencio una comuna que alguien escribió a mano.
   */
  const aplicarDireccionGoogle = useCallback((sel: { address: string; lat: number; lng: number; componentes?: ComponenteGoogle[] }) => {
    const d = desarmarDireccion(sel.componentes);
    setLatStr(String(sel.lat));
    setLonStr(String(sel.lng));
    setForm(prev => ({
      ...prev,
      direccion: sel.address,
      lat: sel.lat, lon: sel.lng,
      comuna: prev.comuna?.trim() ? prev.comuna : d.comuna,
      region: prev.region?.trim() ? prev.region : d.region,
      calle:  prev.calle?.trim()  ? prev.calle  : d.calle,
      numero: prev.numero?.trim() ? prev.numero : d.numero,
    }));
    setSugerencia(sugerirSector({ lat: sel.lat, lon: sel.lng }, d.region || undefined, tiendas));
  }, [tiendas]);

  const filtered = sortTiendas(baseFiltered, sortBy, sortDir, freqByCod);
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
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>Gestión de tiendas y calendario de abastecimiento</div>
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
          { id: 'calendario' as const, label: source === 'armado' ? 'Calendario Armado' : 'Calendario de Abastecimiento', Icon: CalendarDays },
          // El calendario de Congelados es propio del flujo de despacho (no aplica a "armado").
          ...(source === 'despacho'
            ? [
                { id: 'congelados'     as const, label: 'Calendario de Congelados', Icon: Snowflake },
                { id: 'transportistas' as const, label: 'Transportistas',           Icon: Truck },
                { id: 'bitacora' as const,       label: 'Bitácora',                 Icon: History },
              ]
            : []),
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

        {/* Calendario de Congelados tab */}
        {activeTab === 'congelados' && <CalendarioColumnas readOnly={!canEditCalendario} source="congelados" />}

        {/* Transportistas por zona (capa 3 del Enrutador) */}
        {activeTab === 'transportistas' && <TransportistasTab canEdit={canEditTiendas} />}

        {/* [Fase 5] Quién cambió qué. Va acá porque es donde se hacen los cambios que registra. */}
        {activeTab === 'bitacora' && <BitacoraTab />}

        {/* [Fase 5] Coherencia del catálogo — se muestra donde se arregla. Solo aparece si hay
            algo: un aviso que sale todos los días deja de leerse. Verificado contra la base real,
            un catálogo sano no dispara ninguno de los siete chequeos. */}
        {activeTab === 'tiendas' && incoherencias.length > 0 && (
          <div style={{ marginBottom: 16, border: '1px solid #FCD34D', background: '#FFFBEB', borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={() => setCoherenciaAbierta(v => !v)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ fontSize: 14 }} aria-hidden="true">⚠</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                {incoherencias.reduce((n, i) => n + i.items.length, 0)} {incoherencias.reduce((n, i) => n + i.items.length, 0) === 1 ? 'cosa por revisar' : 'cosas por revisar'} en el catálogo
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#A16207', fontWeight: 600 }}>
                {coherenciaAbierta ? 'Ocultar' : 'Ver detalle'}
              </span>
            </button>
            {coherenciaAbierta && (
              <div style={{ padding: '0 14px 12px' }}>
                {incoherencias.map(inc => (
                  <div key={inc.tipo} style={{ paddingTop: 10, borderTop: '1px solid #FDE68A' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#92400E' }}>{inc.titulo}</div>
                    <div style={{ fontSize: 11.5, color: '#78716C', marginTop: 2, lineHeight: 1.45 }}>{inc.consecuencia}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                      {inc.items.map(it => (
                        <span key={it} style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                          {it}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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

              {/* Sort pills. En vista Tabla se ordena clicando el título de la columna, así que
                  ahí solo quedan los ordenamientos SIN columna (Recientes / Modificadas). */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.07em', marginRight: 2 }}>ORDENAR</span>
                {SORT_OPTS.filter(o => viewMode !== 'tabla' || o.id === 'recientes' || o.id === 'modificadas').map(({ id, label }) => {
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
                {/* Toggle Cards / Tabla */}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, background: '#F1F5F9', borderRadius: 7, padding: 2 }}>
                  {(['cards', 'tabla'] as const).map(m => (
                    <button key={m} onClick={() => setViewMode(m)}
                      style={{ height: 24, padding: '0 12px', borderRadius: 5, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                        background: viewMode === m ? '#fff' : 'transparent', color: viewMode === m ? '#1D4ED8' : '#64748B',
                        boxShadow: viewMode === m ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
                      {m === 'cards' ? 'Cards' : 'Tabla'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Grid */}
            {loading ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', paddingTop: 60, fontSize: 14 }}>Cargando…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#94A3B8', paddingTop: 60, fontSize: 14 }}>
                {tiendas.length === 0 ? 'No hay tiendas. Usa "Sheets → DB" para importar.' : 'Sin resultados para esta búsqueda.'}
              </div>
            ) : viewMode === 'tabla' ? (
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #E2E8F0', background: '#fff' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                    <thead>
                      <tr>{TABLA_COLS.map(c => {
                        const active = sortBy === c.sort;
                        return (
                          <th key={c.label} onClick={() => handleSortClick(c.sort)} title={`Ordenar por ${c.label}`}
                            style={{ ...TH_CELL, cursor: 'pointer' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              {c.label}
                              {active && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                            </span>
                          </th>
                        );
                      })}</tr>
                    </thead>
                    <tbody>
                      {filtered.map((t, i) => {
                        const zebra = i % 2 ? '#FAFBFC' : '#fff';
                        return (
                          <tr key={t.codigo} onClick={() => openEdit(t)}
                            style={{ cursor: 'pointer', background: zebra }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#EEF2FF')}
                            onMouseLeave={e => (e.currentTarget.style.background = zebra)}>
                            <td style={TD_CELL}><span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1B2A6B' }}>{t.codigo}</span></td>
                            <td style={TD_CELL}>{t.nombre}</td>
                            <td style={TD_CELL}>{t.region || '—'}</td>
                            <td style={TD_CELL}>{t.sector_comuna || '—'}</td>
                            <td style={TD_CELL}>{t.tipo || '—'}</td>
                            <td style={TD_CELL}>{t.ventana || '—'}</td>
                            <td style={TD_CELL}>{freqByCod[t.codigo] || t.frecuencia || '—'}</td>
                            <td style={TD_CELL}>{t.lat != null && t.lon != null ? '✓' : '—'}</td>
                            <td style={TD_CELL}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: t.activo ? '#DCFCE7' : '#FEE2E2', color: t.activo ? '#16A34A' : '#DC2626' }}>
                                {t.activo ? 'Activa' : 'Inactiva'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '8px 12px', fontSize: 11, color: '#94A3B8', borderTop: '1px solid #F1F5F9' }}>
                  {filtered.length} tiendas · toca una fila para editar
                </div>
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
                        {t.recepcion_pallet && <span style={{ fontSize: 11, color: '#7C3AED', background: '#F3E8FF', borderRadius: 4, padding: '2px 7px', fontWeight: 600, textTransform: 'capitalize' }}>{t.recepcion_pallet}</span>}
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
                          {/* [P3] Eliminar de verdad: solo si la tienda no dejó historial (el
                              diálogo lo consulta). Si tiene uso, ofrece desactivarla. */}
                          <button onClick={() => pedirEliminar(t)} title={`Eliminar ${t.codigo}`}
                            style={{ width: 34, height: 32, borderRadius: 7, border: '1px solid #FECACA', background: '#fff', color: '#DC2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                            🗑
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
            {/* Dirección con autocompletado de Google (el mismo del Planificador). Al elegir una
                sugerencia rellena de una lo que Google SÍ sabe —calle y número por separado, como
                los pide Sendu, más comuna, región y coordenadas— y propone el sector aparte.
                Es la causa raíz de fichas como 59EGN, que se creó sin sector ni corredor. */}
            <div style={{ marginTop: 12 }}>
              <label style={lbl}>Dirección</label>
              <AddressAutocomplete
                value={form.direccion}
                onChange={v => setForm(p => ({ ...p, direccion: v }))}
                onSelect={aplicarDireccionGoogle}
                onUnavailable={() => setGmapsCaido(true)}
                placeholder="Av. Plaza 1250, Las Condes"
                className=""
              />
              {gmapsCaido && (
                <div style={{ fontSize: 11, color: '#A16207', marginTop: 4 }}>
                  El autocompletado de Google no está disponible: escribe la dirección y completa los campos a mano.
                </div>
              )}
              {sugerencia && sugerencia.sector && form.sector_comuna !== sugerencia.sector && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8' }}>Sector sugerido: {sugerencia.sector}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2, lineHeight: 1.45 }}>{sugerencia.motivo}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                    <button
                      onClick={() => setForm(p => ({ ...p, sector_comuna: sugerencia.sector as string }))}
                      style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2563EB', color: '#fff', cursor: 'pointer' }}
                    >
                      Usar {sugerencia.sector}
                    </button>
                    <button
                      onClick={() => setSugerencia(null)}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', color: '#475569', cursor: 'pointer' }}
                    >
                      Elegir otro
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Región</label><input style={inp} value={form.region} onChange={f('region')} placeholder="Región Metropolitana" /></div>
              <div>
                {/* Lista cerrada: este campo decide en qué zona rutea la tienda, así que un typo
                    la cambia de camión. Si ya tenía un valor viejo fuera de la lista se conserva
                    como opción para no perderlo al editar. */}
                <label style={lbl}>Sector / Comuna</label>
                <select style={inp} value={form.sector_comuna} onChange={f('sector_comuna')}>
                  <option value="">— Sector —</option>
                  {opcionesSector(form.sector_comuna).map(o => (
                    <option key={o.valor} value={o.valor}>{o.valor} · {o.detalle}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Corredor</label><input style={inp} value={form.corredor} onChange={f('corredor')} placeholder="Corredor Oriente" /></div>
              <div>
                <label style={lbl}>Tipo</label>
                <select style={inp} value={form.tipo} onChange={f('tipo')}>
                  <option value="">— Tipo —</option>
                  <option value="MALL">Mall</option>
                  <option value="STRIPCENTER">Strip Center</option>
                  <option value="TIENDA">Tienda (calle)</option>
                  <option value="oficina">Oficina</option>
                  {/* Puntos que se cargan para poder rutearlos desde el Planificador (proveedores,
                      distribuidores, retiros). No son tiendas: nadie les programa carga, así que
                      no se les exige estar en el calendario de abastecimiento. */}
                  <option value="punto">Punto (retiro / entrega)</option>
                  {form.tipo && !['MALL', 'STRIPCENTER', 'TIENDA', 'oficina', 'punto'].includes(form.tipo) && <option value={form.tipo}>{form.tipo}</option>}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={lbl}>Recepción del pallet</label>
                <select style={inp} value={form.recepcion_pallet} onChange={f('recepcion_pallet')}>
                  <option value="">— Sin definir —</option>
                  <option value="consolidado">Consolidado (entra armado)</option>
                  <option value="desconsolidado">Desconsolidado (se desarma)</option>
                </select>
              </div>
              <div />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>Ventana horaria</label><input style={inp} value={form.ventana} onChange={f('ventana')} placeholder="09:00-12:00" /></div>
              <div>
                <label style={lbl}>Frecuencia <span style={{ fontWeight: 400, color: '#94A3B8', textTransform: 'none', letterSpacing: 0 }}>· del Calendario de Abastecimiento</span></label>
                <input style={{ ...inp, background: '#F8FAFC', color: '#475569', cursor: 'default' }} readOnly
                  value={freqByCod[form.codigo] || form.frecuencia || ''}
                  placeholder="— (la tienda no está en el calendario)" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={lbl}>Frecuencia <span style={{ fontWeight: 400, color: '#94A3B8', textTransform: 'none', letterSpacing: 0 }}>· del Calendario de Congelados</span></label>
                <input style={{ ...inp, background: '#F8FAFC', color: '#475569', cursor: 'default' }} readOnly
                  value={freqCongByCod[form.codigo] || ''}
                  placeholder="— (la tienda no está en el calendario)" />
              </div>
              <div />
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
            {/* Datos de envío de Sendu. Solo tienen sentido si a la tienda la lleva Falabella:
                son los que arman el Excel que se le manda. Sendu pide la calle y el número por
                separado, y la región en su propio formato ("Los_Lagos", "Araucanía").
                Antes esto se mostraba a TODA tienda de Regiones — incluidas las 14 del sur, que
                desde el traspaso a Luis Fica no pasan por Sendu. */}
            {sendu.aplica && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                  Datos de envío (Sendu)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={lbl}>Región Sendu</label><input style={inp} value={form.region_sendu} onChange={f('region_sendu')} placeholder="Los_Lagos" /></div>
                  <div><label style={lbl}>Comuna</label><input style={inp} value={form.comuna} onChange={f('comuna')} placeholder="Castro" /></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
                  <div><label style={lbl}>Calle (sin número)</label><input style={inp} value={form.calle} onChange={f('calle')} placeholder="Ignacio Serrano" /></div>
                  <div><label style={lbl}>Número</label><input style={inp} value={form.numero} onChange={f('numero')} placeholder="574" /></div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={lbl}>Complemento (opcional)</label>
                  <input style={inp} value={form.complemento} onChange={f('complemento')} placeholder="Local 101 y 102" />
                </div>
                {faltaSendu.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11.5, color: '#A55A06' }}>
                    ⚠ Falta {faltaSendu.join(', ')} — sin eso, el Excel de Sendu sale con esas celdas en blanco.
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, color: '#64748B' }}>
                  Se piden porque {sendu.motivo.charAt(0).toLowerCase() + sendu.motivo.slice(1)}
                </div>
              </div>
            )}

            {/* Que los campos simplemente no aparezcan sería magia: si es una tienda de Regiones
                y aun así no se le piden, hay que decir por qué y dónde se cambia. */}
            {!sendu.aplica && esSectorRegiones(form.sector_comuna) && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Datos de envío (Sendu)
                </div>
                <div style={{ fontSize: 11.5, color: '#64748B', lineHeight: 1.5 }}>
                  No se piden: {sendu.motivo.charAt(0).toLowerCase() + sendu.motivo.slice(1)}{' '}
                  Sendu es el sistema de Falabella. Si esta zona vuelve a Falabella, cámbialo en{' '}
                  <strong style={{ color: '#334155' }}>Transportistas</strong> y los campos reaparecen solos.
                </div>
              </div>
            )}

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

      {/* [P3] Diálogo de eliminar tienda. Borrado REAL solo si no tiene historial; si lo tiene,
          se explica dónde se usa y se ofrece desactivarla (reversible y sin dejar huérfanos). */}
      {borrar && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
             onClick={() => { if (!borrar.borrando) setBorrar(null); }}>
          <div onClick={e => e.stopPropagation()}
               style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', width: '100%', maxWidth: 460, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: '#0F172A' }}>
              Eliminar {borrar.tienda.codigo}
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748B' }}>{borrar.tienda.nombre}</p>

            {borrar.cargando ? (
              <p style={{ fontSize: 13, color: '#64748B' }}>Revisando si tiene historial…</p>
            ) : borrar.puedeEliminar ? (
              <>
                <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: '0 0 12px' }}>
                  No tiene despachos, picking ni manifiestos, y no está en el calendario. Se puede
                  eliminar de forma definitiva (también se quita del Google Sheet).
                </p>
                <p style={{ fontSize: 12.5, color: '#64748B', margin: '0 0 6px' }}>
                  Escribí <b style={{ fontFamily: 'monospace', color: '#DC2626' }}>{borrar.tienda.codigo}</b> para confirmar:
                </p>
                <input value={borrar.confirmacion} autoFocus
                  onChange={e => setBorrar(prev => prev ? { ...prev, confirmacion: e.target.value } : prev)}
                  style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #E2E8F0', padding: '0 10px', fontSize: 14, fontFamily: 'monospace', outline: 'none' }} />
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, margin: '0 0 10px' }}>
                  Esta tienda <b>ya tiene datos asociados</b>, así que no se puede eliminar sin dejar
                  registros huérfanos. Podés <b>desactivarla</b>: deja de aparecer en la operación y
                  se puede reactivar cuando quieras.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
                  {borrar.enCalendario && (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#FEF3C7', color: '#92400E' }}>en el calendario</span>
                  )}
                  {Object.entries(borrar.usos ?? {}).filter(([, n]) => n > 0).map(([k, n]) => (
                    <span key={k} style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569' }}>
                      {({ picking: 'picking', despacho_rm: 'despacho RM', despacho_regiones: 'despacho Regiones', manifiestos: 'manifiestos', sesion: 'sesión del día' } as Record<string, string>)[k] ?? k}: {n}
                    </span>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setBorrar(null)} disabled={borrar.borrando}
                style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              {!borrar.cargando && !borrar.puedeEliminar && borrar.tienda.activo && (
                <button onClick={desactivarDesdeDialogo}
                  style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 0, background: '#D97706', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Desactivar
                </button>
              )}
              {borrar.puedeEliminar && (
                <button onClick={confirmarEliminar}
                  disabled={borrar.borrando || borrar.confirmacion.trim().toUpperCase() !== borrar.tienda.codigo.toUpperCase()}
                  style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 0, background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700,
                           cursor: 'pointer', opacity: borrar.borrando || borrar.confirmacion.trim().toUpperCase() !== borrar.tienda.codigo.toUpperCase() ? 0.5 : 1 }}>
                  {borrar.borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
