'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Search, X, Navigation, GripVertical, Sparkles, Trash2, Building2, Clock, Share2, Check, Plus, Copy, CalendarDays, Flag, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { CD_INICIAL, COLS, type TiendaInfo } from '../data/tiendas';
import type { Vehiculo } from '../data/flota';
import { nn, type Ruta } from '../utils/routing';
import {
  buscarTiendas, virtualStops, googleMapsDeepLink,
  esParadaDireccion, nuevoParadaDireccionId, paradasDireccionPatch,
  construirTextoRuta, formatDuracion, kmRutaAprox, repartirEnNRutas,
  hhmmAMin, minAHHMM, calcularETAs, estadoVentana, type EstadoVentana,
  type ParadaDireccion, type LineaParada,
} from '../utils/planificador';
import { cargarGMaps } from '../utils/maps';
import { tipoTienda, grupoTienda, type TipoTiendaKey } from '../utils/tipoTienda';
import AddressAutocomplete from './AddressAutocomplete';
import { fetchSessionState, subscribeToSessionState, pushSessionStateResult } from '@/lib/userSessionState';
import { mergeRutasPlan, conAlMenosUna, type RutaPlan } from '../utils/planSync';
import { fetchCalendarioCompleto } from '@/features/despacho/utils/useCalendario';
import { fetchCalendarioCongelados } from '@/lib/calendarioCongeladosSync';
import { filtrarPorZonas } from '../utils/planificador';
import type { ZonaRuteo } from '@/lib/sectores';

// Vehículo "virtual" — el planificador es solo visual (rutas sin carga ni patente real).
const PLAN_VEHICLE: Vehiculo = { p: 'PLAN', c: 0, b: 0, t: 'Planificador', tlbd: false, on: true, porton: null, refrigerado: false, empresa: '' };

// Color de cada ruta = su índice en el array (misma paleta que el mapa: dibMapa usa COLS[ri]).
const colorRuta = (index: number) => COLS[index % COLS.length];

// Código sintético del punto de LLEGADA para dibujarlo en el mapa como destino de cada ruta
// (dibMapa rutea origin=partida → waypoints=paradas → destination=última parada; agregar esta al
// final hace que el destino sea la llegada y se dibuje el tramo de vuelta). No es una tienda real.
const END_CODE = 'Llegada';

// Días para "armar desde calendario" (incluye DO; NO usar getDia() que pliega domingo a LU).
const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'] as const;
const DIA_LABEL: Record<string, string> = { LU: 'Lun', MA: 'Mar', MI: 'Mié', JU: 'Jue', VI: 'Vie', SA: 'Sáb', DO: 'Dom' };
const diaHoy = () => ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'][new Date().getDay()];

interface Props {
  gps: Record<string, number[]>;
  tiendas: Record<string, TiendaInfo>;
  /** [Fase 3] Día que se está planificando. El plan se guarda por fecha, como el resto del
   *  Enrutador, y así deja de vivir solo en el navegador de quien lo armó. */
  fecha?: string;
  userId?: string;
  /** Reporta TODAS las rutas (visibles con paradas; ocultas vacías, para conservar el color por
   *  índice) + el punto de partida compartido, para dibujarlas en el MapSection fijo. `ext` lleva
   *  las paradas por DIRECCIÓN (coords + nombre) de todas las rutas visibles. */
  onPlanRutas?: (rutas: Ruta[], cd: number[], ext?: { gps: Record<string, number[]>; tiendas: Record<string, TiendaInfo> }) => void;
  /** Tiempo/dist por tramo (Google) por índice de ruta: `legDataByRoute[i][j]` = tramo j de la ruta i. */
  legDataByRoute?: Record<number, { dist: string; dur: string; durSec?: number }[]>;
  /** Km real (Google) por índice de ruta. */
  kmByRoute?: Record<number, number>;
}

type StartMode = 'cd' | 'tienda' | 'custom';
// Punto de llegada (al terminar la ruta): ninguno (termina en la última parada) / volver al CD /
// volver a la partida / una dirección.
type EndMode = 'none' | 'cd' | 'start' | 'custom';

/** Una ruta del planificador (paradas + orden + direcciones). El punto de partida es compartido. */
interface PlanRoute {
  id: string;
  nombre: string;
  selected: string[];
  orderMode: 'cercania' | 'manual';
  customStops: ParadaDireccion[];
}

/** Badge de tipo (Mall/Strip/Street/…) + ventana horaria de una tienda. */
function MetaTienda({ tienda }: { tienda?: TiendaInfo }) {
  if (!tienda) return null;
  const tp = tipoTienda(tienda.tipo, tienda.d, tienda.z);
  const ventana = (tienda.v ?? '').trim();
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap mt-0.5">
      <span className="text-[10px] font-bold px-1.5 py-px rounded"
        style={{ color: tp.color, background: `${tp.color}1A`, border: `1px solid ${tp.color}40` }}>
        {tp.label}
      </span>
      {ventana && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-kmuted">
          <Clock size={10} aria-hidden="true" /> {ventana}
        </span>
      )}
    </span>
  );
}

// Persistencia del plan (rutas + orden + partida) para que NO se pierda al cambiar de tab
// (el componente se desmonta) ni al recargar. Las rutas del mapa se reconstruyen desde esto.
const PLAN_STATE_KEY = 'enrutador_plan_state';
interface PlanPersist {
  startMode: StartMode; startTienda: string;
  customCoord: { lat: number; lng: number } | null; customAddr: string;
  endMode: EndMode; endCoord: { lat: number; lng: number } | null; endAddr: string;
  horaSalida: string; servicioMin: number;
  routes: PlanRoute[]; visibleIds: string[]; editId: string;
  // Formato viejo (una sola ruta) — se migra a `routes` al cargar.
  selected?: string[]; orderMode?: 'cercania' | 'manual'; customStops?: ParadaDireccion[];
}
function loadPlan(): PlanPersist {
  const def: PlanPersist = {
    startMode: 'cd', startTienda: '', customCoord: null, customAddr: '',
    endMode: 'none', endCoord: null, endAddr: '',
    horaSalida: '08:00', servicioMin: 10,
    routes: [{ id: 'r1', nombre: 'Ruta 1', selected: [], orderMode: 'cercania', customStops: [] }],
    visibleIds: ['r1'], editId: 'r1',
  };
  if (typeof window === 'undefined') return def;
  let raw: Partial<PlanPersist> = {};
  try { raw = JSON.parse(localStorage.getItem(PLAN_STATE_KEY) || '{}') as Partial<PlanPersist>; } catch { /* noop */ }
  // Rutas: usar `routes`; si no hay, migrar el formato viejo (una sola ruta) o arrancar en blanco.
  let routes = Array.isArray(raw.routes) && raw.routes.length ? raw.routes : null;
  if (!routes) {
    routes = [{ id: 'r1', nombre: 'Ruta 1', selected: raw.selected ?? [], orderMode: raw.orderMode ?? 'cercania', customStops: raw.customStops ?? [] }];
  }
  const ids = new Set(routes.map(r => r.id));
  let visibleIds = (Array.isArray(raw.visibleIds) ? raw.visibleIds.filter(id => ids.has(id)) : []);
  if (!visibleIds.length) visibleIds = [routes[0].id];
  const editId = raw.editId && ids.has(raw.editId) ? raw.editId : visibleIds[0];
  return {
    startMode: raw.startMode ?? 'cd', startTienda: raw.startTienda ?? '',
    customCoord: raw.customCoord ?? null, customAddr: raw.customAddr ?? '',
    endMode: raw.endMode ?? 'none', endCoord: raw.endCoord ?? null, endAddr: raw.endAddr ?? '',
    horaSalida: raw.horaSalida ?? '08:00', servicioMin: typeof raw.servicioMin === 'number' ? raw.servicioMin : 10,
    routes, visibleIds, editId,
  };
}

// Las cuatro zonas que se pueden planificar por separado, con el nombre que usa la operación.
const ZONAS_PLAN: { id: ZonaRuteo; label: string }[] = [
  { id: 'santiago', label: 'RM' },
  { id: 'costa',    label: 'Costa' },
  { id: 'sur',      label: 'R. Sur' },
  { id: 'norte',    label: 'R. Norte' },
];

/** Cómo nombrar la selección en los avisos. Vacío = todas, igual que el comportamiento de antes. */
function etiquetaZonas(zonas: ZonaRuteo[]): string {
  if (!zonas.length) return 'todas las zonas';
  const orden = ZONAS_PLAN.filter(z => zonas.includes(z.id)).map(z => z.label);
  return orden.length === 1 ? orden[0] : `${orden.slice(0, -1).join(', ')} y ${orden[orden.length - 1]}`;
}

export default function PlanificadorTab({ gps, tiendas, onPlanRutas, legDataByRoute, kmByRoute, fecha, userId }: Props) {
  // Punto de partida — COMPARTIDO por todas las rutas (el mapa dibuja todas desde un mismo origen).
  const [startMode,   setStartMode]   = useState<StartMode>(() => loadPlan().startMode);
  const [startTienda, setStartTienda] = useState(() => loadPlan().startTienda);
  const [customCoord, setCustomCoord] = useState<{ lat: number; lng: number } | null>(() => loadPlan().customCoord);
  const [customAddr,  setCustomAddr]  = useState(() => loadPlan().customAddr);
  const [geoStatus,   setGeoStatus]   = useState<'idle' | 'loading' | 'error'>('idle');
  // Punto de llegada — COMPARTIDO por todas las rutas (al terminar la ruta).
  const [endMode,     setEndMode]     = useState<EndMode>(() => loadPlan().endMode);
  const [endCoord,    setEndCoord]    = useState<{ lat: number; lng: number } | null>(() => loadPlan().endCoord);
  const [endAddr,     setEndAddr]     = useState(() => loadPlan().endAddr);
  // ETA: hora de salida + minutos de atención por parada (para estimar llegada a cada parada).
  const [horaSalida,  setHoraSalida]  = useState(() => loadPlan().horaSalida);
  const [servicioMin, setServicioMin] = useState(() => loadPlan().servicioMin);
  // Rutas + cuáles se ven en el mapa (multi-select) + cuál se edita.
  const [routes,      setRoutes]      = useState<PlanRoute[]>(() => loadPlan().routes);
  const [visibleIds,  setVisibleIds]  = useState<string[]>(() => loadPlan().visibleIds);
  const [editId,      setEditId]      = useState<string>(() => loadPlan().editId);
  const [paradaAddr,  setParadaAddr]  = useState('');
  const [paradaGeo,   setParadaGeo]   = useState<'idle' | 'loading' | 'error'>('idle');
  const [search,      setSearch]      = useState('');
  const [regionFilter, setRegionFilter] = useState<'all' | 'rm' | 'costa' | 'fal'>('all');
  const [tipoFilter,   setTipoFilter]   = useState<'all' | TipoTiendaKey>('all');
  const [dragIdx,     setDragIdx]     = useState<number | null>(null);
  // Compartir: se arma el texto y se abre un panel (shareText != '') para copiar/mandar por WhatsApp.
  const [shareText,   setShareText]   = useState('');
  const [copied,      setCopied]      = useState(false);
  // Armar desde calendario: fuente (seco/congelados) + día + cuántas rutas.
  const [calFuente,   setCalFuente]   = useState<'seco' | 'congelados'>('seco');
  const [calDia,      setCalDia]      = useState<string>(() => diaHoy());
  const [calN,        setCalN]        = useState(3);
  // Zonas a incluir. VACÍO = todas, que es como se comportaba antes: no elegir nada no puede
  // dejar el plan en blanco. Se filtra por zona y no por el grupo del calendario porque el
  // calendario trata Regiones como una sola cosa y acá hace falta separar norte de sur.
  const [calZonas,    setCalZonas]    = useState<ZonaRuteo[]>([]);
  // Cuántas tiendas tiene cada zona ese día, para mostrarlo en cada opción antes de armar.
  const [calConteo,   setCalConteo]   = useState<Record<ZonaRuteo, number> | null>(null);
  const [calStatus,   setCalStatus]   = useState<'idle' | 'loading' | 'error'>('idle');
  const [calAviso,    setCalAviso]    = useState('');
  // Places no disponible (key sin Places API / sin billing) → se avisa y se usa el fallback (Buscar/Enter).
  const [placesOff,   setPlacesOff]   = useState(false);
  // [Fase 3] Resguardos del sync, iguales a los del tablero: no escribir una fecha que no se leyó,
  // y fusionar por ruta con el plan tal como estaba en el último sync.
  const fechaCargadaRef  = useRef<string | null>(null);
  const baseRutasRef     = useRef<PlanRoute[]>([]);
  const lastPushedPlanRef = useRef<string>('');
  const [calOpen,     setCalOpen]     = useState(true); // panel "Armar desde el calendario" colapsable

  // GMaps se carga para el geocoder de "Dirección" (el mapa lo dibuja el MapSection fijo).
  useEffect(() => { cargarGMaps(); }, []);

  // Cuántas tiendas tiene cada zona el día elegido. Se muestra en cada opción para poder decidir
  // ANTES de armar — si no, elegir "R. Norte" un día sin tiendas del norte se descubre al final.
  // El calendario viene cacheado, así que esto no agrega una llamada por cada tecla.
  useEffect(() => {
    let alive = true;
    (async () => {
      const cal = calFuente === 'seco' ? await fetchCalendarioCompleto() : await fetchCalendarioCongelados();
      const d = cal[calDia];
      const delDia = d ? [...d.rm, ...d.costa, ...d.fal] : [];
      const { porZona } = filtrarPorZonas(delDia, [], c => tiendas[c]?.sector ?? tiendas[c]?.z, c => gps[c]?.[0]);
      if (alive) setCalConteo(porZona);
    })().catch(() => { if (alive) setCalConteo(null); });
    return () => { alive = false; };
  }, [calFuente, calDia, tiendas, gps]);

  const plan = useMemo(() => ({ startMode, startTienda, customCoord, customAddr, endMode, endCoord, endAddr, horaSalida, servicioMin, routes, visibleIds, editId }),
    [startMode, startTienda, customCoord, customAddr, endMode, endCoord, endAddr, horaSalida, servicioMin, routes, visibleIds, editId]);

  // Persistir el plan → se conserva al cambiar de tab (desmontaje) y al recargar.
  useEffect(() => {
    try { localStorage.setItem(PLAN_STATE_KEY, JSON.stringify(plan)); } catch { /* noop */ }
  }, [plan]);

  // ── [Fase 3] El plan deja de vivir solo en este navegador ────────────────────
  // Hasta acá el Planificador era `localStorage` y nada más: una ruta armada en el celular no
  // existía en el computador. No era un sync roto, era una función que faltaba.
  //
  // Se guarda por fecha, como el resto del Enrutador, con los mismos resguardos del tablero: no se
  // escribe una fecha que no se leyó, y lo remoto se FUSIONA por ruta en vez de reemplazar el plan
  // entero — si no, dos personas armando rutas distintas se borrarían entre sí.
  useEffect(() => {
    if (!fecha) return;
    fechaCargadaRef.current = null;
    fetchSessionState('planificador', fecha).then(remote => {
      if (remote && typeof remote === 'object') {
        const p = remote as Partial<PlanPersist>;
        if (Array.isArray(p.routes) && p.routes.length) {
          setRoutes(p.routes);
          setVisibleIds(p.visibleIds?.length ? p.visibleIds : [p.routes[0].id]);
          setEditId(p.editId ?? p.routes[0].id);
          baseRutasRef.current = p.routes;
        }
      }
      fechaCargadaRef.current = fecha;
    }).catch(() => { /* sin remoto: se sigue con lo local */ fechaCargadaRef.current = fecha; });

    return subscribeToSessionState('planificador', userId ?? '', (state) => {
      if (!state || typeof state !== 'object') return;
      const p = state as Partial<PlanPersist>;
      if (!Array.isArray(p.routes)) return;
      setRoutes(prev => {
        const fusion = mergeRutasPlan(p.routes as unknown as RutaPlan[], prev as unknown as RutaPlan[], baseRutasRef.current as unknown as RutaPlan[]);
        const next = conAlMenosUna(fusion, prev[0] as unknown as RutaPlan) as unknown as PlanRoute[];
        baseRutasRef.current = next;
        return next;
      });
    }, undefined, fecha);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, userId]);

  useEffect(() => {
    if (!fecha || fechaCargadaRef.current !== fecha) return;
    const json = JSON.stringify(plan);
    if (json === lastPushedPlanRef.current) return;
    const t = setTimeout(() => {
      const previo = lastPushedPlanRef.current;
      lastPushedPlanRef.current = json;
      pushSessionStateResult('planificador', plan, userId, fecha)
        .then(({ ok }) => {
          if (ok) { baseRutasRef.current = routes; return; }
          if (lastPushedPlanRef.current === json) lastPushedPlanRef.current = previo;
        })
        .catch(() => { if (lastPushedPlanRef.current === json) lastPushedPlanRef.current = previo; });
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, fecha, userId]);

  // ── Ruta activa (la que se edita) + setters ligados a ella ────────────────────
  const activeIdx   = Math.max(0, routes.findIndex(r => r.id === editId));
  const activeRoute = routes[activeIdx] ?? routes[0];
  const activeColor = colorRuta(activeIdx);
  const selected  = activeRoute.selected;
  const orderMode = activeRoute.orderMode;
  const customStops = activeRoute.customStops;

  function patchActive(patch: (r: PlanRoute) => PlanRoute) {
    setRoutes(rs => rs.map(r => (r.id === activeRoute.id ? patch(r) : r)));
  }
  const setSelected  = (u: string[] | ((prev: string[]) => string[])) =>
    patchActive(r => ({ ...r, selected: typeof u === 'function' ? u(r.selected) : u }));
  const setOrderMode = (v: 'cercania' | 'manual') => patchActive(r => ({ ...r, orderMode: v }));
  const setCustomStops = (u: ParadaDireccion[] | ((prev: ParadaDireccion[]) => ParadaDireccion[])) =>
    patchActive(r => ({ ...r, customStops: typeof u === 'function' ? u(r.customStops) : u }));

  // Punto de partida resuelto (coord) — compartido.
  const startCoord = useMemo<{ lat: number; lng: number }>(() => {
    if (startMode === 'tienda' && startTienda && gps[startTienda]) return { lat: gps[startTienda][0], lng: gps[startTienda][1] };
    if (startMode === 'custom' && customCoord) return customCoord;
    return { lat: CD_INICIAL[0], lng: CD_INICIAL[1] };
  }, [startMode, startTienda, customCoord, gps]);

  // Punto de llegada resuelto (coord) — compartido; null = sin llegada (termina en la última parada).
  const endPoint = useMemo<{ lat: number; lng: number } | null>(() => {
    if (endMode === 'cd')     return { lat: CD_INICIAL[0], lng: CD_INICIAL[1] };
    if (endMode === 'start')  return startCoord;
    if (endMode === 'custom' && endCoord) return endCoord;
    return null;
  }, [endMode, endCoord, startCoord]);

  // Armar N rutas desde el calendario (seco/congelados) del día elegido → reemplaza las rutas actuales.
  async function armarDesdeCalendario() {
    setCalStatus('loading'); setCalAviso('');
    try {
      const cal = calFuente === 'seco' ? await fetchCalendarioCompleto() : await fetchCalendarioCongelados();
      const d = cal[calDia];
      const delDia = d ? [...d.rm, ...d.costa, ...d.fal] : [];
      const fuenteLbl = calFuente === 'seco' ? 'Seco' : 'Congelados';
      if (!delDia.length) {
        setCalStatus('error');
        setCalAviso(`No hay tiendas el ${DIA_LABEL[calDia]} en el calendario ${fuenteLbl}.`);
        return;
      }
      // Antes se tomaban los tres grupos del día sin preguntar, así que pedir "Congelados, lunes"
      // traía también Antofagasta y Puerto Montt y las repartía entre las mismas rutas.
      const { incluidas: cods, sinZona } = filtrarPorZonas(
        delDia, calZonas, c => tiendas[c]?.sector ?? tiendas[c]?.z, c => gps[c]?.[0]);
      if (!cods.length) {
        setCalStatus('error');
        setCalAviso(`Ninguna de las ${delDia.length} tiendas del ${DIA_LABEL[calDia]} es de ${etiquetaZonas(calZonas)}.`);
        return;
      }
      const { rutas, sinGps } = repartirEnNRutas(cods, calN, gps, [startCoord.lat, startCoord.lng]);
      const stamp = Date.now().toString(36);
      const nuevas: PlanRoute[] = rutas.map((r, i) => ({
        id: `r${stamp}-${i}`, nombre: `Ruta ${i + 1}`, selected: r, orderMode: 'cercania', customStops: [],
      }));
      setRoutes(nuevas);
      setVisibleIds(nuevas.map(r => r.id));
      setEditId(nuevas[0].id);
      setCalStatus('idle');
      setCalOpen(false); // colapsa el panel tras armar → deja ver las rutas/paradas
      const nConParadas = rutas.filter(r => r.length).length;
      const nTiendas = rutas.reduce((s, r) => s + r.length, 0);
      let aviso = `${nConParadas} ruta${nConParadas === 1 ? '' : 's'} · ${nTiendas} tienda${nTiendas === 1 ? '' : 's'} (${fuenteLbl}, ${DIA_LABEL[calDia]}, ${etiquetaZonas(calZonas)}).`;
      if (sinGps.length) aviso += ` ${sinGps.length} sin ubicación, omitida${sinGps.length === 1 ? '' : 's'}: ${sinGps.slice(0, 6).join(', ')}${sinGps.length > 6 ? '…' : ''}.`;
      // Una tienda sin sector no se puede clasificar: se dice, no se descarta en silencio.
      if (sinZona.length) aviso += ` ${sinZona.length} sin zona en el catálogo, omitida${sinZona.length === 1 ? '' : 's'}: ${sinZona.slice(0, 6).join(', ')}${sinZona.length > 6 ? '…' : ''}.`;
      setCalAviso(aviso);
    } catch {
      setCalStatus('error');
      setCalAviso('No se pudo cargar el calendario.');
    }
  }

  // Cómputo por ruta: paradas geocodificadas (patch) + orden (cercanía/manual) desde la partida.
  const routesComputed = useMemo(() => routes.map((r) => {
    const patch = paradasDireccionPatch(r.customStops);
    const gpsR  = { ...gps, ...patch.gps };
    const ordered = r.orderMode === 'cercania'
      ? nn(virtualStops(r.selected), gpsR, [startCoord.lat, startCoord.lng]).map(s => s.c)
      : r.selected;
    return { id: r.id, nombre: r.nombre, ordered, patch, gpsR };
  }), [routes, gps, startCoord]);

  const activeComputed = routesComputed[activeIdx] ?? routesComputed[0];
  const orderedCods = activeComputed.ordered;
  const gpsAll      = activeComputed.gpsR;                 // catálogo + direcciones de la ruta activa
  const customById  = useMemo(() => Object.fromEntries(customStops.map(p => [p.id, p])), [customStops]);
  const endArr      = useMemo<[number, number] | null>(() => endPoint ? [endPoint.lat, endPoint.lng] : null, [endPoint]);
  const kmAprox     = useMemo(() => kmRutaAprox(orderedCods, gpsAll, [startCoord.lat, startCoord.lng], endArr), [orderedCods, gpsAll, startCoord, endArr]);

  // [B3] Resumen por ruta (para comparar de un vistazo): #paradas, km (real de Google o aprox) y
  // tiempo total. Indexado igual que routesComputed / el mapa (misma posición = misma ruta).
  const routeStats = useMemo(() => routesComputed.map((rc, i) => {
    const paradas = rc.ordered.length;
    const rk = kmByRoute?.[i];
    const km = paradas === 0 ? ''
      : (rk != null && rk > 0 ? `${rk} km` : `~${kmRutaAprox(rc.ordered, rc.gpsR, [startCoord.lat, startCoord.lng], endArr)} km`);
    // Con punto de llegada, el mapa dibuja un tramo extra (→ llegada) ⇒ un leg más.
    const expected = paradas + (endArr ? 1 : 0);
    const legs = legDataByRoute?.[i];
    const min = (legs && legs.length === expected && paradas > 0)
      ? formatDuracion(legs.reduce((s, l) => s + (l.durSec ?? 0), 0)) : '';
    return { paradas, km, min };
  }), [routesComputed, kmByRoute, legDataByRoute, startCoord, endArr]);

  // [Mejora] Totales + balance de las rutas VISIBLES (con paradas) — para dimensionar la jornada y
  // ver de un vistazo si quedaron desparejas. km real de Google si está, si no aprox (haversine).
  const totales = useMemo(() => {
    let paradas = 0, km = 0, sec = 0, tiempoCompleto = true;
    const porRuta = routesComputed
      .map((rc, i) => ({ rc, i }))
      .filter(({ rc }) => visibleIds.includes(rc.id) && rc.ordered.length > 0)
      .map(({ rc, i }) => {
        const p = rc.ordered.length;
        const rk = kmByRoute?.[i];
        const kmNum = (rk != null && rk > 0) ? rk : kmRutaAprox(rc.ordered, rc.gpsR, [startCoord.lat, startCoord.lng], endArr);
        paradas += p; km += kmNum;
        const legs = legDataByRoute?.[i];
        const expected = p + (endArr ? 1 : 0);
        if (legs && legs.length === expected) sec += legs.reduce((s, l) => s + (l.durSec ?? 0), 0);
        else tiempoCompleto = false;
        return { id: rc.id, nombre: rc.nombre, color: colorRuta(i), paradas: p, kmNum: Math.round(kmNum) };
      });
    return { nRutas: porRuta.length, paradas, km: Math.round(km), min: tiempoCompleto && sec > 0 ? formatDuracion(sec) : '', porRuta };
  }, [routesComputed, visibleIds, kmByRoute, legDataByRoute, startCoord, endArr]);

  // Tiempos reales por tramo (Google) de la ruta ACTIVA. `legData[i]` = tramo que llega a la parada
  // i. Solo se usan si coinciden con las paradas actuales (si no, el mapa está recalculando).
  const legData   = legDataByRoute?.[activeIdx];
  const realKm    = kmByRoute?.[activeIdx] ?? null;
  const legsOk    = !!legData && legData.length === orderedCods.length + (endArr ? 1 : 0) && orderedCods.length > 0;
  const totalMin  = legsOk ? formatDuracion(legData!.reduce((s, l) => s + (l.durSec ?? 0), 0)) : '';
  const kmLabel   = legsOk && realKm != null && realKm > 0 ? `${realKm} km` : `~${kmAprox} km`;

  // [Mejora] ETA por parada de la ruta ACTIVA: acumula los tiempos reales de manejo (Google) desde
  // la hora de salida + minutos de atención por parada. Solo con tiempos reales del mapa (legsOk).
  const salidaMin = hhmmAMin(horaSalida);
  const etasActive = useMemo<number[] | null>(() => {
    if (!legsOk || salidaMin == null) return null;
    const legSec = legData!.slice(0, orderedCods.length).map(l => l.durSec ?? 0);
    return calcularETAs(legSec, salidaMin, servicioMin);
  }, [legsOk, legData, orderedCods.length, salidaMin, servicioMin]);

  // Levantar TODAS las rutas al padre (RutasScreen → MapSection). Ref fuera de deps para no
  // reventar el debounce del mapa (el callback llega inline en cada render de RutasScreen).
  const onPlanRutasRef = useRef(onPlanRutas);
  onPlanRutasRef.current = onPlanRutas;
  useEffect(() => {
    // Ocultas → ts vacío (no dibujan) pero conservan su índice ⇒ el color por ruta no cambia. Si hay
    // punto de llegada, se agrega como último destino de cada ruta con paradas (dibuja el tramo de vuelta).
    const rutas: Ruta[] = routesComputed.map(rc => {
      const v = { ...PLAN_VEHICLE, p: rc.nombre }; // nombre de la ruta como "patente" → el mapa lo muestra
      const vis = visibleIds.includes(rc.id);
      if (!vis || rc.ordered.length === 0) return { v, ts: [], tp: 0, tb: 0 };
      const cods = endPoint ? [...rc.ordered, END_CODE] : rc.ordered;
      return { v, ts: virtualStops(cods), tp: 0, tb: 0 };
    });
    const extGps: Record<string, number[]> = {};
    const extTiendas: Record<string, TiendaInfo> = {};
    routesComputed.forEach(rc => {
      if (!visibleIds.includes(rc.id)) return;
      Object.assign(extGps, rc.patch.gps);
      Object.assign(extTiendas, rc.patch.tiendas as unknown as Record<string, TiendaInfo>);
    });
    if (endPoint) {
      extGps[END_CODE] = [endPoint.lat, endPoint.lng];
      extTiendas[END_CODE] = { n: 'Punto de llegada', z: '', v: '', _parada: true } as unknown as TiendaInfo;
    }
    const anyStops = rutas.some(rt => rt.ts.length > 0);
    onPlanRutasRef.current?.(anyStops ? rutas : [], [startCoord.lat, startCoord.lng], { gps: extGps, tiendas: extTiendas });
  }, [routesComputed, visibleIds, startCoord, endPoint]);

  const resultados = useMemo(() => buscarTiendas(tiendas, gps, search), [tiendas, gps, search]);
  const resultadosFiltrados = useMemo(() => resultados.filter(t => {
    const inf = tiendas[t.cod];
    if (regionFilter !== 'all' && grupoTienda(inf?.z, inf?.region) !== regionFilter) return false;
    if (tipoFilter !== 'all' && tipoTienda(inf?.tipo, inf?.d, inf?.z).key !== tipoFilter) return false;
    return true;
  }), [resultados, tiendas, regionFilter, tipoFilter]);
  const startTiendaOpts = useMemo(() => buscarTiendas(tiendas, gps, ''), [tiendas, gps]);
  const fseg = 'px-2.5 py-1 rounded-[7px] text-[11px] font-bold cursor-pointer transition-colors border';
  const fon  = 'bg-knavy text-white border-knavy';
  const foff = 'bg-white text-kmuted border-black/[0.12] hover:border-knavy/40';

  function toggle(cod: string) {
    setSelected(prev => prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]);
  }
  function quitar(cod: string) {
    setSelected(prev => prev.filter(c => c !== cod));
    if (esParadaDireccion(cod)) setCustomStops(prev => prev.filter(p => p.id !== cod));
  }
  function limpiar() { setSelected([]); setCustomStops([]); }

  // ── Rutas: crear / eliminar / mostrar-ocultar / editar ────────────────────────
  function nuevaRuta() {
    const id = `r${Date.now()}`;
    setRoutes(rs => [...rs, { id, nombre: `Ruta ${rs.length + 1}`, selected: [], orderMode: 'cercania', customStops: [] }]);
    setVisibleIds(prev => [...prev, id]);
    setEditId(id);
  }
  function eliminarRuta(id: string) {
    if (routes.length <= 1) return;
    const restantes = routes.filter(r => r.id !== id);
    setRoutes(restantes);
    setVisibleIds(prev => {
      const n = prev.filter(x => x !== id);
      return n.length ? n : [restantes[0].id];
    });
    if (editId === id) setEditId(restantes[0].id);
  }
  function toggleVerRuta(id: string) {
    const vis = visibleIds.includes(id);
    if (vis) {
      if (visibleIds.length === 1) { setEditId(id); return; } // no se puede ocultar la última
      const n = visibleIds.filter(x => x !== id);
      setVisibleIds(n);
      if (editId === id) setEditId(n[0]);
    } else {
      setVisibleIds([...visibleIds, id]);
      setEditId(id); // al mostrar una ruta, pasa a ser la que se edita
    }
  }

  function geocodeAddr() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const G = (window as any).google?.maps;
    if (!G || !customAddr.trim()) { setGeoStatus('error'); return; }
    setGeoStatus('loading');
    new G.Geocoder().geocode({ address: customAddr, region: 'cl' }, (res: unknown[], status: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (status === 'OK' && res[0]) { const loc = (res[0] as any).geometry.location; setCustomCoord({ lat: loc.lat(), lng: loc.lng() }); setStartMode('custom'); setGeoStatus('idle'); }
      else setGeoStatus('error');
    });
  }

  // Fallback del punto de LLEGADA por dirección (si Places no cargó o se escribió sin elegir sugerencia).
  function geocodeEndAddr() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const G = (window as any).google?.maps;
    if (!G || !endAddr.trim()) return;
    new G.Geocoder().geocode({ address: endAddr, region: 'cl' }, (res: unknown[], status: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (status === 'OK' && res[0]) { const loc = (res[0] as any).geometry.location; setEndCoord({ lat: loc.lat(), lng: loc.lng() }); setEndMode('custom'); }
    });
  }

  // Agrega una dirección (ya resuelta a coords) como PARADA (id DIR-<n>) de la ruta ACTIVA,
  // auto-seleccionada. La usa tanto el autocompletado (coords de la sugerencia) como el geocoder.
  function agregarParadaConCoord(label: string, lat: number, lng: number) {
    // ids únicos entre TODAS las rutas (van a un gps compartido en el mapa).
    const usados = [...Object.keys(gps), ...routes.flatMap(r => r.customStops.map(p => p.id))];
    const id = nuevoParadaDireccionId(usados);
    setCustomStops(prev => [...prev, { id, label: label.trim(), gps: [lat, lng] }]);
    setSelected(prev => [...prev, id]);
    setParadaAddr(''); setParadaGeo('idle');
  }

  // Fallback (Places no cargó / se escribió sin elegir sugerencia): geocodifica el texto y agrega.
  function agregarParadaDireccion() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const G = (window as any).google?.maps;
    if (!G || !paradaAddr.trim()) { setParadaGeo('error'); return; }
    setParadaGeo('loading');
    new G.Geocoder().geocode({ address: paradaAddr, region: 'cl' }, (res: unknown[], status: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (status === 'OK' && res[0]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r0 = res[0] as any;
        const loc = r0.geometry.location;
        agregarParadaConCoord((r0.formatted_address as string) || paradaAddr.trim(), loc.lat(), loc.lng());
      } else setParadaGeo('error');
    });
  }

  // Reordenar manual (drag) de la ruta activa: opera sobre el orden mostrado y fija modo manual.
  function reordenar(from: number, to: number) {
    if (from === to) return;
    const base = [...orderedCods];
    const [m] = base.splice(from, 1);
    base.splice(to, 0, m);
    setSelected(base); setOrderMode('manual');
  }

  // Compartir: arma una lista por cada ruta VISIBLE (COD: dirección / tipo / horario) + su link de
  // mapa, y abre un panel para copiar/mandar (no depende del menú del sistema, que no está en compu).
  function compartir() {
    const bloques = routesComputed
      .map((rc, i) => ({ rc, r: routes[i] }))
      .filter(({ r }) => visibleIds.includes(r.id) && r.selected.length > 0)
      .map(({ rc, r }) => {
        const cById = Object.fromEntries(r.customStops.map(p => [p.id, p]));
        const lineas: LineaParada[] = rc.ordered.map(cod => {
          if (esParadaDireccion(cod)) return { cod, esDireccion: true, nombre: cById[cod]?.label };
          const inf = tiendas[cod];
          return {
            cod, esDireccion: false, nombre: inf?.n, direccion: inf?.d,
            tipo: inf ? tipoTienda(inf.tipo, inf.d, inf.z).label : undefined, horario: inf?.v,
          };
        });
        return construirTextoRuta({
          titulo: r.nombre, lineas,
          km: kmRutaAprox(rc.ordered, rc.gpsR, [startCoord.lat, startCoord.lng], endArr),
          mapaUrl: googleMapsDeepLink(startCoord, rc.ordered, rc.gpsR, endPoint),
          regreso: endPoint ? endLabelCorto : undefined,
        });
      });
    if (!bloques.length) return;
    setCopied(false);
    setShareText(bloques.join('\n\n———\n\n'));
  }

  async function copiarTexto() {
    try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* algunos navegadores requieren HTTPS/permiso → el texto igual se puede seleccionar y copiar a mano */ }
  }
  function compartirNativo() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (typeof nav.share === 'function') nav.share({ title: 'Rutas', text: shareText }).catch(() => {});
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puedeCompartirNativo = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';

  const nombre = (cod: string) => customById[cod]?.label ?? tiendas[cod]?.n ?? cod;
  const comuna = (cod: string) => (esParadaDireccion(cod) ? '' : tiendas[cod]?.z ?? '');
  const startLabel = startMode === 'cd' ? 'CD KiosClub'
    : startMode === 'tienda' ? (startTienda ? `${startTienda} · ${tiendas[startTienda]?.n ?? startTienda}` : 'Elegir tienda…')
    : (customCoord ? (customAddr || 'Punto personalizado') : 'Ingresar dirección…');
  // Etiqueta del punto de llegada (para el chip informativo y el texto de compartir).
  const endLabelCorto = endMode === 'cd' ? 'CD KiosClub'
    : endMode === 'start' ? 'la partida'
    : endMode === 'custom' ? (endAddr || 'dirección') : '';
  const endLabel = endMode === 'none' ? 'Termina en la última parada'
    : endMode === 'custom' ? (endCoord ? (endAddr || 'Punto de llegada') : 'Ingresar dirección…')
    : `Volver a ${endLabelCorto}`;

  // `min-w-0` + `whitespace-nowrap`: el segmentado de LLEGADA tiene 4 opciones y en un panel
  // angosto recortaba la última ("Dire…"). Con `flex-wrap` en el contenedor pasa a dos filas
  // en vez de cortarse, y cada botón conserva su texto completo.
  const seg = 'flex-1 min-w-0 whitespace-nowrap py-1.5 px-1 rounded-[8px] text-[12px] font-semibold cursor-pointer transition-colors text-center';
  const visibles = routes.filter(r => visibleIds.includes(r.id));

  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2 text-ktext font-bold text-[15px]">
        <MapPin size={16} className="text-knavy" /> Planificador de rutas
        <span className="font-medium text-[11px] text-kmuted/80 hidden sm:inline">· armá y compará rutas en el mapa</span>
      </div>

      {placesOff && (
        <div className="flex items-start gap-2 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-[10px] px-3 py-2 leading-relaxed">
          <span aria-hidden="true">⚠</span>
          <span>Las <strong>sugerencias de direcciones</strong> no están disponibles (falta habilitar la <strong>Places API</strong> en la key de Google Maps). Igual podés escribir la dirección y tocar <strong>Buscar</strong> o Enter para ubicarla.</span>
        </div>
      )}

      {/* Armar rutas desde el calendario (seco/congelados · día · N rutas) — colapsable */}
      <div className="flex flex-col gap-2.5 rounded-[12px] border border-knavy/20 bg-knavy/[0.03] p-3">
        <button onClick={() => setCalOpen(o => !o)}
          className="flex items-center gap-2 text-[12px] font-bold text-ktext cursor-pointer w-full text-left">
          {calOpen ? <ChevronDown size={15} className="text-knavy" /> : <ChevronRight size={15} className="text-knavy" />}
          <CalendarDays size={14} className="text-knavy" /> Armar desde el calendario
          {!calOpen && (
            <span className="ml-auto font-semibold text-[11px] text-kmuted normal-case">
              {calFuente === 'seco' ? 'Seco' : 'Congelados'} · {DIA_LABEL[calDia]} · {etiquetaZonas(calZonas)} · {calN} ruta{calN === 1 ? '' : 's'}
            </span>
          )}
        </button>
        {calOpen && (<>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {/* Calendario */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-kmuted">Calendario</span>
            <div className="flex gap-1 bg-white rounded-[9px] p-1 border border-black/[0.08]">
              <button onClick={() => setCalFuente('seco')}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-bold cursor-pointer transition-colors ${calFuente === 'seco' ? 'bg-knavy text-white' : 'text-kmuted hover:text-ktext'}`}>Seco</button>
              <button onClick={() => setCalFuente('congelados')}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] font-bold cursor-pointer transition-colors ${calFuente === 'congelados' ? 'bg-[#0EA5E9] text-white' : 'text-kmuted hover:text-ktext'}`}>Congelados</button>
            </div>
          </div>
          {/* Día */}
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-kmuted">Día</span>
            <div className="flex gap-1 flex-wrap">
              {DIAS.map(d => (
                <button key={d} onClick={() => setCalDia(d)}
                  className={`flex-1 sm:flex-none sm:w-[40px] min-w-[38px] min-h-[38px] py-1.5 rounded-[7px] text-[11px] font-bold cursor-pointer border transition-colors ${calDia === d ? 'bg-knavy text-white border-knavy' : 'bg-white text-kmuted border-black/[0.12] hover:border-knavy/40'}`}>
                  {DIA_LABEL[d]}
                </button>
              ))}
            </div>
          </div>
          {/* Zonas — se pueden combinar. Ninguna elegida = todas, como se comportaba antes. */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-kmuted">
              Zonas {calZonas.length === 0 && <span className="normal-case font-semibold text-kmuted/70">· todas</span>}
            </span>
            <div className="flex gap-1 flex-wrap">
              {ZONAS_PLAN.map(({ id, label }) => {
                const on = calZonas.includes(id);
                const n  = calConteo?.[id];
                return (
                  <button key={id}
                    onClick={() => setCalZonas(prev => prev.includes(id) ? prev.filter(z => z !== id) : [...prev, id])}
                    title={n === 0 ? `Sin tiendas de ${label} ese día` : undefined}
                    className={`min-h-[38px] px-2.5 py-1.5 rounded-[7px] text-[11px] font-bold cursor-pointer border transition-colors ${
                      on ? 'bg-knavy text-white border-knavy'
                         : n === 0 ? 'bg-white text-kmuted/40 border-black/[0.08]'
                                   : 'bg-white text-kmuted border-black/[0.12] hover:border-knavy/40'}`}>
                    {label}{n != null && <span className={`ml-1 font-semibold ${on ? 'text-white/70' : 'text-kmuted/70'}`}>{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          {/* N rutas — escribible y sin tope de 5: la flota tiene más camiones que eso. */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-kmuted">Rutas</span>
            <div className="flex items-stretch rounded-[7px] border border-black/[0.12] bg-white overflow-hidden">
              <button onClick={() => setCalN(n => Math.max(1, n - 1))} aria-label="Una ruta menos"
                className="w-9 min-h-[38px] text-[15px] font-bold text-kmuted hover:text-knavy hover:bg-knavy/[0.05] cursor-pointer transition-colors">−</button>
              <input type="number" inputMode="numeric" min={1} max={99} value={calN}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  setCalN(Number.isFinite(v) ? Math.min(99, Math.max(1, v)) : 1);
                }}
                aria-label="Cuántas rutas armar"
                className="w-11 min-h-[38px] text-center text-[13px] font-bold text-ktext border-x border-black/[0.08] outline-none focus:bg-knavy/[0.04] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
              <button onClick={() => setCalN(n => Math.min(99, n + 1))} aria-label="Una ruta más"
                className="w-9 min-h-[38px] text-[15px] font-bold text-kmuted hover:text-knavy hover:bg-knavy/[0.05] cursor-pointer transition-colors">+</button>
            </div>
          </div>
          {/* Armar */}
          <button onClick={armarDesdeCalendario} disabled={calStatus === 'loading'}
            className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 min-h-[42px] rounded-[9px] bg-knavy text-white text-[12px] font-bold cursor-pointer disabled:opacity-50 hover:bg-knavy/90 transition-colors">
            <Sparkles size={13} /> {calStatus === 'loading' ? 'Armando…' : 'Armar rutas'}
          </button>
        </div>
        {calAviso
          ? <div className={`text-[11px] ${calStatus === 'error' ? 'text-[#D42B2B] font-semibold' : 'text-kmuted'}`}>{calAviso}</div>
          : <div className="text-[10px] text-kmuted/80">Trae las tiendas de ese día en las zonas elegidas y las reparte por cercanía. Reemplaza las rutas actuales.</div>}
        </>)}
      </div>

      {/* Rutas — tarjetas con resumen (paradas · km · tiempo); tocá para ver/comparar en el mapa */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted">Rutas <span className="normal-case font-semibold text-kmuted/70">· tocá para ver/comparar</span></div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 items-stretch">
          {routes.map((r, i) => {
            const color = colorRuta(i);
            const vis   = visibleIds.includes(r.id);
            const isEdit = r.id === editId;
            const st = routeStats[i];
            return (
              <div key={r.id}
                className={`flex flex-col gap-0.5 rounded-[10px] border px-2.5 py-1.5 min-w-0 sm:min-w-[130px] transition-colors ${
                  isEdit ? 'border-knavy bg-knavy/[0.06]' : vis ? 'border-black/[0.14] bg-white' : 'border-black/[0.10] bg-white'}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <button onClick={() => toggleVerRuta(r.id)} className="flex items-center gap-1.5 cursor-pointer min-w-0 flex-1"
                    title={vis ? 'Se ve en el mapa · tocá para ocultar' : 'Oculta · tocá para ver'}>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: vis ? color : 'transparent', border: `2px solid ${color}` }} />
                    <span className={`text-[12px] font-bold truncate ${vis ? 'text-ktext' : 'text-kmuted/50'}`}>{r.nombre}</span>
                  </button>
                  {isEdit && <span className="text-[8px] font-extrabold uppercase tracking-wide text-knavy bg-knavy/10 rounded px-1 py-px flex-shrink-0">edit</span>}
                  {routes.length > 1 && (
                    <button onClick={() => eliminarRuta(r.id)} title="Eliminar ruta"
                      className="text-kmuted/40 hover:text-[#D42B2B] cursor-pointer flex-shrink-0"><X size={13} /></button>
                  )}
                </div>
                <div className="pl-4 text-[10px] font-semibold">
                  {st?.paradas > 0
                    ? <span className={vis ? 'text-kmuted' : 'text-kmuted/50'}>{st.paradas} parada{st.paradas === 1 ? '' : 's'}{st.km ? ` · ${st.km}` : ''}{st.min ? ` · ${st.min}` : ''}</span>
                    : <span className="text-kmuted/45">vacía</span>}
                </div>
              </div>
            );
          })}
          <button onClick={nuevaRuta}
            className="flex items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-knavy/50 text-knavy px-2.5 py-1.5 text-[12px] font-bold cursor-pointer hover:bg-knavy/[0.04] min-h-[44px] sm:min-h-0">
            <Plus size={13} /> Nueva ruta
          </button>
        </div>
        {/* Con ≥2 rutas visibles, elegir cuál se EDITA (sin ocultarla). */}
        {visibles.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="text-kmuted font-semibold">Editando:</span>
            {visibles.map(r => (
              <button key={r.id} onClick={() => setEditId(r.id)}
                className={`px-2.5 py-1 rounded-[7px] font-bold cursor-pointer transition-colors ${
                  r.id === editId ? 'bg-knavy text-white' : 'bg-kbg text-kmuted hover:text-ktext'}`}>
                {r.nombre}
              </button>
            ))}
          </div>
        )}

        {/* Totales + balance de las rutas visibles (para comparar la carga entre rutas) */}
        {totales.nRutas > 1 && (
          <div className="rounded-[10px] border border-black/[0.08] bg-kbg/60 p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold uppercase tracking-wider text-kmuted">Total visible</span>
              <span className="font-semibold text-ktext tabular-nums">{totales.nRutas} rutas · {totales.paradas} paradas · ~{totales.km} km{totales.min ? ` · ${totales.min}` : ''}</span>
            </div>
            <div className="flex flex-col gap-1">
              {totales.porRuta.map(r => {
                const max = Math.max(...totales.porRuta.map(x => x.paradas), 1);
                return (
                  <div key={r.id} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold w-[52px] flex-shrink-0 truncate" style={{ color: r.color }}>{r.nombre}</span>
                    <div className="flex-1 h-[8px] rounded-full bg-black/[0.06] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(r.paradas / max) * 100}%`, background: r.color }} />
                    </div>
                    <span className="text-[10px] text-kmuted w-[96px] text-right flex-shrink-0 tabular-nums">{r.paradas} par · ~{r.kmNum} km</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2 columnas cuando el panel REALMENTE es ancho: (izq) partida + agregar tiendas · (der)
          paradas/ruta. Antes usaba `lg:grid-cols-2`, un breakpoint de VIEWPORT: en el tab PLAN el
          mapa se lleva media pantalla, así que el viewport seguía siendo "lg" pero el panel quedaba
          angosto → dos columnas apretadas y textos cortados ("RUTA 2 · 0 PAR…", "Volver a CD K…").
          Con auto-fit + minmax el layout responde al ancho del contenedor y se apila solo. */}
      <div className="grid gap-4 items-start [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]">
        <div className="flex flex-col gap-4 min-w-0">

      {/* Partida + llegada lado a lado en desktop (ahorra alto) */}
      <div className="grid gap-x-4 gap-y-3 items-start [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
      {/* Punto de partida (compartido por todas las rutas) */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted">Punto de partida <span className="normal-case font-semibold text-kmuted/70">· común a todas</span></div>
        <div className="flex flex-wrap gap-1 bg-kbg rounded-[10px] p-1">
          <button onClick={() => setStartMode('cd')}     className={`${seg} ${startMode === 'cd' ? 'bg-knavy text-white' : 'text-kmuted'}`}>CD</button>
          <button onClick={() => setStartMode('tienda')} className={`${seg} ${startMode === 'tienda' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Tienda</button>
          <button onClick={() => setStartMode('custom')} className={`${seg} ${startMode === 'custom' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Dirección</button>
        </div>
        {startMode === 'tienda' && (
          <select value={startTienda} onChange={e => setStartTienda(e.target.value)}
            className="w-full border border-black/[0.12] rounded-[8px] px-2.5 py-2 text-[13px] bg-white text-ktext outline-none">
            <option value="">— Elegir tienda —</option>
            {startTiendaOpts.map(t => <option key={t.cod} value={t.cod}>{t.cod} · {t.nombre}</option>)}
          </select>
        )}
        {startMode === 'custom' && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <AddressAutocomplete
                value={customAddr}
                onChange={v => { setCustomAddr(v); setGeoStatus('idle'); }}
                onSelect={({ address, lat, lng }) => { setCustomAddr(address); setCustomCoord({ lat, lng }); setStartMode('custom'); setGeoStatus('idle'); }}
                onEnter={geocodeAddr}
                onUnavailable={() => setPlacesOff(true)}
                placeholder="Dirección (ej: Av. Vitacura 2909)"
                className="flex-1 border border-black/[0.12] rounded-[8px] px-2.5 py-2 text-[13px] bg-white text-ktext outline-none" />
              <button onClick={geocodeAddr} className="px-3 rounded-[8px] bg-knavy text-white text-[12px] font-semibold cursor-pointer">Buscar</button>
            </div>
            <div className="text-[11px] text-kmuted">{geoStatus === 'loading' ? 'Buscando…' : geoStatus === 'error' ? '⚠ No se encontró la dirección' : 'Escribí y elegí una sugerencia (o tocá Buscar).'}</div>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[12px] text-ktext bg-kbg rounded-[8px] px-2.5 py-1.5 min-w-0">
          <Navigation size={13} className="text-[#D42B2B] flex-shrink-0" /> <span className="font-semibold truncate">{startLabel}</span>
        </div>
      </div>

      {/* Punto de llegada (compartido) — al terminar la ruta */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted">Punto de llegada <span className="normal-case font-semibold text-kmuted/70">· al terminar</span></div>
        <div className="flex flex-wrap gap-1 bg-kbg rounded-[10px] p-1">
          <button onClick={() => setEndMode('none')}   className={`${seg} ${endMode === 'none' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Ninguno</button>
          <button onClick={() => setEndMode('cd')}     className={`${seg} ${endMode === 'cd' ? 'bg-knavy text-white' : 'text-kmuted'}`}>CD</button>
          <button onClick={() => setEndMode('start')}  className={`${seg} ${endMode === 'start' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Partida</button>
          <button onClick={() => setEndMode('custom')} className={`${seg} ${endMode === 'custom' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Dirección</button>
        </div>
        {endMode === 'custom' && (
          <AddressAutocomplete
            value={endAddr}
            onChange={v => setEndAddr(v)}
            onSelect={({ address, lat, lng }) => { setEndAddr(address); setEndCoord({ lat, lng }); setEndMode('custom'); }}
            onEnter={geocodeEndAddr}
            onUnavailable={() => setPlacesOff(true)}
            placeholder="Dirección de llegada (ej: bodega, CD, punto final)"
            className="w-full border border-black/[0.12] rounded-[8px] px-2.5 py-2 text-[13px] bg-white text-ktext outline-none" />
        )}
        {endMode !== 'none' && (
          <div className="flex items-center gap-1.5 text-[12px] text-ktext bg-kbg rounded-[8px] px-2.5 py-1.5 min-w-0">
            <Flag size={13} className="text-[#0E7C6B] flex-shrink-0" /> <span className="font-semibold truncate">{endLabel}</span>
          </div>
        )}
      </div>
      </div>{/* fin partida + llegada */}

      {/* Buscar tiendas + agregar dirección (misma fila, arriba de los filtros) */}
      <div className="flex flex-col gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted">Agregar a <span style={{ color: activeColor }}>{activeRoute.nombre}</span></div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
          {/* Buscar tienda del catálogo — más angosto (~⅓) */}
          <div className="flex items-center gap-2 border border-black/[0.12] rounded-[8px] px-2.5 py-2 bg-white flex-1 sm:flex-[1] min-w-0">
            <Search size={14} className="text-kmuted flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tienda…"
              className="flex-1 text-[13px] outline-none bg-transparent text-ktext min-w-0" />
          </div>
          {/* Separador */}
          <div className="hidden sm:block w-px self-stretch bg-black/10" aria-hidden="true" />
          {/* Agregar una dirección libre como parada (se suma a la ruta activa y al mapa) — más ancho (~⅔) */}
          <div className="flex items-center gap-1.5 flex-1 sm:flex-[2] min-w-0">
            <AddressAutocomplete
              value={paradaAddr}
              onChange={v => { setParadaAddr(v); setParadaGeo('idle'); }}
              onSelect={({ address, lat, lng }) => agregarParadaConCoord(address, lat, lng)}
              onEnter={agregarParadaDireccion}
              onUnavailable={() => setPlacesOff(true)}
              placeholder="Agregar dirección (ej: Av. Vitacura 2909, Las Condes)"
              className="flex-1 border border-black/[0.12] rounded-[8px] px-2.5 py-2 text-[13px] bg-white text-ktext outline-none min-w-0" />
            <button onClick={agregarParadaDireccion} disabled={!paradaAddr.trim() || paradaGeo === 'loading'}
              className="px-2.5 py-1.5 rounded-[8px] bg-knavy text-white text-[11px] font-semibold cursor-pointer disabled:opacity-40 flex items-center gap-1 flex-shrink-0 whitespace-nowrap">
              <MapPin size={12} /> Agregar
            </button>
          </div>
        </div>
        {paradaGeo !== 'idle' && (
          <div className="text-[11px] text-kmuted">{paradaGeo === 'loading' ? 'Buscando dirección…' : '⚠ No se encontró la dirección'}</div>
        )}
        {/* Filtro por región */}
        <div className="flex flex-wrap gap-1.5">
          <button className={`${fseg} ${regionFilter === 'all' ? fon : foff}`} onClick={() => setRegionFilter('all')}>Todas</button>
          <button className={`${fseg} ${regionFilter === 'rm' ? fon : foff}`} onClick={() => setRegionFilter('rm')}>RM</button>
          <button className={`${fseg} ${regionFilter === 'costa' ? fon : foff}`} onClick={() => setRegionFilter('costa')}>Costa</button>
          <button className={`${fseg} ${regionFilter === 'fal' ? fon : foff}`} onClick={() => setRegionFilter('fal')}>Nacional</button>
        </div>
        {/* Filtro por tipo de tienda */}
        <div className="flex flex-wrap gap-1.5">
          <button className={`${fseg} ${tipoFilter === 'all' ? fon : foff}`} onClick={() => setTipoFilter('all')}>Todos</button>
          <button className={`${fseg} ${tipoFilter === 'mall' ? fon : foff}`} onClick={() => setTipoFilter('mall')}>Mall</button>
          <button className={`${fseg} ${tipoFilter === 'strip' ? fon : foff}`} onClick={() => setTipoFilter('strip')}>Strip</button>
          <button className={`${fseg} ${tipoFilter === 'street' ? fon : foff}`} onClick={() => setTipoFilter('street')}>Street</button>
        </div>
        <div className="max-h-[240px] overflow-y-auto flex flex-col gap-0.5">
          {resultadosFiltrados.map(t => {
            const on = selected.includes(t.cod);
            return (
              <button key={t.cod} onClick={() => toggle(t.cod)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] text-left cursor-pointer transition-colors ${on ? 'bg-knavy/10' : 'hover:bg-kbg'}`}>
                <span className={`w-4 h-4 rounded-[4px] flex items-center justify-center flex-shrink-0 border ${on ? 'bg-knavy border-knavy' : 'border-black/20'}`}>
                  {on && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
                </span>
                <Building2 size={13} className="text-kmuted flex-shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-ktext">{t.cod}</span>
                  <span className="text-[12px] text-kmuted"> · {t.nombre}</span>
                  {t.comuna && <span className="block text-[11px] text-kmuted truncate">{t.comuna}</span>}
                  <MetaTienda tienda={tiendas[t.cod]} />
                </span>
              </button>
            );
          })}
          {resultadosFiltrados.length === 0 && <div className="text-[12px] text-kmuted text-center py-3">Sin resultados.</div>}
        </div>
      </div>

        </div>{/* ── fin columna izquierda ── */}
        <div className="flex flex-col gap-4 min-w-0">

      {/* Paradas de la ruta activa */}
      <div className="flex flex-col gap-2">
        {/* `flex-wrap` + `min-w-0`: con el panel angosto el encabezado se cortaba
            ("RUTA 2 · 0 PAR…"). Ahora el resumen envuelve y "Limpiar" nunca queda tapado. */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] font-bold uppercase tracking-wider text-kmuted min-w-0">
            <span style={{ color: activeColor }}>{activeRoute.nombre}</span> · {selected.length} parada{selected.length === 1 ? '' : 's'}{selected.length > 0 ? ` · ${kmLabel}${totalMin ? ` · ${totalMin}` : ''}` : ''}
          </div>
          {selected.length > 0 && (
            <button onClick={limpiar} className="text-[11px] text-[#D42B2B] font-semibold cursor-pointer flex items-center gap-1 flex-shrink-0"><Trash2 size={11} /> Limpiar</button>
          )}
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1 bg-kbg rounded-[10px] p-1">
            <button onClick={() => setOrderMode('cercania')} className={`${seg} flex items-center justify-center gap-1 ${orderMode === 'cercania' ? 'bg-knavy text-white' : 'text-kmuted'}`}><Sparkles size={12} /> Cercanía</button>
            <button onClick={() => setOrderMode('manual')}   className={`${seg} ${orderMode === 'manual' ? 'bg-knavy text-white' : 'text-kmuted'}`}>Manual</button>
          </div>
        )}
        {/* Hora de salida + atención por parada → ETA (hora estimada de llegada) por parada */}
        {selected.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-kmuted flex-wrap">
            <Clock size={12} className="text-knavy flex-shrink-0" aria-hidden="true" />
            <span className="font-semibold">Salida</span>
            <input type="time" value={horaSalida} onChange={e => setHoraSalida(e.target.value)}
              className="border border-black/[0.12] rounded-[7px] px-2 py-1 text-[12px] bg-white text-ktext outline-none" />
            <span className="font-semibold ml-1">Atención</span>
            <input type="number" min={0} max={120} value={servicioMin}
              onChange={e => setServicioMin(Math.max(0, Math.min(120, parseInt(e.target.value) || 0)))}
              className="w-[52px] border border-black/[0.12] rounded-[7px] px-2 py-1 text-[12px] bg-white text-ktext outline-none tabular-nums" />
            <span>min/parada</span>
            {!legsOk && <span className="text-kmuted/70 w-full">La ETA aparece cuando el mapa calcula los tiempos (mostrá esta ruta en el mapa).</span>}
          </div>
        )}
        <div className="flex flex-col gap-1">
          {orderedCods.map((cod, i) => {
            const esDir = esParadaDireccion(cod);
            const eta = etasActive?.[i];
            const estV: EstadoVentana | null = eta == null ? null : (esDir ? 'sin-ventana' : estadoVentana(eta, tiendas[cod]?.v));
            return (
            <div key={cod} draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragIdx !== null) reordenar(dragIdx, i); setDragIdx(null); }}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-[8px] bg-white border border-black/[0.09]">
              <GripVertical size={13} className="text-black/20 cursor-grab flex-shrink-0" />
              <span className="w-5 h-5 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: activeColor }}>{i + 1}</span>
              <span className="flex-1 min-w-0">
                {esDir ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-px rounded"
                      style={{ color: '#D42B2B', background: '#D42B2B1A', border: '1px solid #D42B2B40' }}>
                      <MapPin size={10} /> Dirección
                    </span>
                    <span className="block text-[12px] text-ktext truncate mt-0.5">{nombre(cod)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] font-semibold text-ktext">{cod}</span>
                    <span className="text-[11px] text-kmuted"> · {nombre(cod)}{comuna(cod) ? ` · ${comuna(cod)}` : ''}</span>
                    <MetaTienda tienda={tiendas[cod]} />
                  </>
                )}
              </span>
              {eta != null && (
                <span
                  title={estV === 'tarde' ? `Llegás ~${minAHHMM(eta)} — DESPUÉS de la ventana (${tiendas[cod]?.v})`
                    : estV === 'temprano' ? `Llegás ~${minAHHMM(eta)} — ANTES de que abra (${tiendas[cod]?.v})`
                    : estV === 'ok' ? `Llegás ~${minAHHMM(eta)} — dentro de la ventana (${tiendas[cod]?.v})`
                    : `Hora estimada de llegada ~${minAHHMM(eta)}`}
                  className={`inline-flex items-center gap-0.5 text-[10px] font-bold flex-shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 ${
                    estV === 'tarde' ? 'text-[#D42B2B] bg-[#D42B2B14]'
                    : estV === 'temprano' ? 'text-[#B4690E] bg-[#B4690E14]'
                    : estV === 'ok' ? 'text-[#1A7D3A] bg-[#1A7D3A14]'
                    : 'text-kmuted bg-black/[0.04]'}`}>
                  {estV === 'tarde' ? <AlertTriangle size={10} aria-hidden="true" /> : <Clock size={10} aria-hidden="true" />}
                  {minAHHMM(eta)}
                </span>
              )}
              {legsOk && legData![i]?.dur && (
                <span title="Tiempo de manejo desde la parada anterior (Google)"
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-kmuted flex-shrink-0 whitespace-nowrap">
                  <Clock size={10} aria-hidden="true" /> {legData![i].dur}
                </span>
              )}
              <button onClick={() => quitar(cod)} className="text-kmuted hover:text-[#D42B2B] cursor-pointer flex-shrink-0"><X size={14} /></button>
            </div>
            );
          })}
          {selected.length === 0 && <div className="text-[12px] text-kmuted text-center py-3 border border-dashed border-black/10 rounded-[8px]">Agregá tiendas o direcciones para armar la ruta.</div>}
        </div>
        {selected.length > 0 && (
          <div className="mt-1 flex gap-2">
            <a href={googleMapsDeepLink(startCoord, orderedCods, gpsAll, endPoint)} target="_blank" rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-[10px] bg-[#1B2A6B] text-white text-[13px] font-bold cursor-pointer no-underline">
              <Navigation size={14} /> Abrir en Google Maps
            </a>
            <button onClick={compartir}
              title="Muestra la lista de paradas + el link del mapa para copiar o mandar por WhatsApp"
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-[10px] bg-white border-[1.5px] border-knavy text-knavy text-[13px] font-bold cursor-pointer transition-colors">
              <Share2 size={14} /> Compartir{visibles.length > 1 ? ` (${visibles.length})` : ''}
            </button>
          </div>
        )}
      </div>
        </div>{/* ── fin columna derecha ── */}
      </div>{/* ── fin grid 2 columnas ── */}

      {/* Panel de Compartir — muestra el texto listo para copiar / mandar por WhatsApp */}
      {shareText && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setShareText('')} />
          <div className="relative w-full max-w-[460px] max-h-[86vh] flex flex-col bg-white rounded-[16px] overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.08] flex-shrink-0">
              <div className="flex items-center gap-2 font-bold text-ktext text-[15px]">
                <Share2 size={16} className="text-knavy" /> Compartir {visibles.length > 1 ? `${visibles.length} rutas` : 'ruta'}
              </div>
              <button onClick={() => setShareText('')} aria-label="Cerrar"
                className="w-8 h-8 rounded-full bg-kbg flex items-center justify-center text-kmuted hover:text-ktext cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <textarea readOnly value={shareText} onFocus={e => e.currentTarget.select()}
                className="w-full h-[240px] resize-none border border-black/[0.12] rounded-[10px] p-3 text-[12px] font-mono leading-relaxed text-ktext bg-kbg outline-none focus:border-knavy" />
              <div className="text-[11px] text-kmuted mt-1.5">Tocá el texto para seleccionarlo, o usá los botones de abajo.</div>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-black/[0.08] flex-shrink-0">
              <button onClick={copiarTexto}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] bg-knavy text-white text-[13px] font-bold cursor-pointer">
                {copied ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-[10px] bg-[#25D366] text-white text-[13px] font-bold cursor-pointer no-underline">
                WhatsApp
              </a>
              {puedeCompartirNativo && (
                <button onClick={compartirNativo} title="Menú de compartir del sistema"
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-[10px] bg-white border-[1.5px] border-knavy text-knavy text-[13px] font-bold cursor-pointer">
                  <Share2 size={15} />
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
