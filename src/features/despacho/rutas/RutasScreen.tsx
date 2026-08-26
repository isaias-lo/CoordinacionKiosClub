'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import InputSection   from './components/InputSection';
import DespachoHeader from './components/DespachoHeader';
import { useIsMobile } from './utils/useIsMobile';
import MapSection     from './components/MapSection';
import ResultsSection from './components/ResultsSection';
import ManualDispatch from './components/ManualDispatch';
import ManifiestoPanel from './components/ManifiestoPanel';
import CierreJornadaPanel from './components/CierreJornadaPanel';
import ComparisonView from './components/ComparisonView';
import ParadasAdicionales, { type Parada } from './components/ParadasAdicionales';

import { TIENDAS_INICIAL, GPS_INICIAL, CD_INICIAL } from './data/tiendas';
import { FLOTA_INICIAL } from './data/flota';
import { CAL_INICIAL, DNOM } from './data/calendar';
import { getDia, norm, todayStr, fechaTxt, poolPendiente } from './utils/helpers';
import { grupoArmada } from './utils/flujoArmada';
import { grupoCongelados } from './utils/congeladosPool';
import { reconstruirAsignaciones, type ManifiestoGuardado } from './utils/reconstruirAsignaciones';
import { esFantasmaCalT } from './utils/calTFantasma';
import { ordenarCalT } from './utils/ordenarCalT';
import { tiendasArmadasSinRutear } from './utils/tiendasSinRutear';
import { asignar, nn, rutasDesdeAsignaciones } from './utils/routing';
import type { Ruta, StoreItem } from './utils/routing';
import { enrutarV2, type ResultadoEnrutador } from './utils/enrutadorV2';
import { poolDesdeCalT } from './utils/poolDespacho';
import { asignarPorClusters, type CentroideCluster } from './utils/asignarPorClusters';
import { faseEnrutador } from './utils/faseEnrutador';
import type { IAStore, IATruck } from './ia/types';
import { rutasAAsignacion, contarEdiciones } from './ia/feedback';
import { fetchAuthenticatedSheet, parseTSheetAuth, parseFSheetAuth, parseCalendarioAuth, guardarDespachoSplitFn, actualizarPionetasRMFn } from './utils/sheets';
import { splitRoutingPorTabla, buildControlRows, type Grupo, type RutaControl, type PendienteControl } from './utils/vueltaRegistro';
import { fechasBacklogV2, poolV2ParaFecha, conteoPorFecha } from './utils/segundaVueltaFechas';
import { parseCerradas, serializeCerradas, mergeCerradas, isCerrada, rutasNoCerradas, todasCerradas, normPatente } from './utils/cierrePorVehiculo';
import { fetchCounts, subscribeToSesion } from '../../../lib/despachoSesion';
import { pushSessionState, fetchSessionState, subscribeToSessionState, fetchUnregisteredRutasDays, fetchPendientesV2Pasadas, type PendienteV2 } from '../../../lib/userSessionState';
import { supabase } from '../../../lib/supabase';
import { fetchCalendarioSupa, subscribeToCalendarioSupa } from '../../../lib/calendarioSync';
import { writeCalendario } from '../utils/useCalendario';
import { reaplicarCounts } from './utils/reaplicarCounts';
import { useDayRollover } from '@/hooks/useDayRollover';
import type { SesionRow } from '../../../lib/despachoSesion';
import type { TiendaInfo } from './data/tiendas';
import type { Vehiculo } from './data/flota';

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
// [Enrutador V2] Interruptor del motor geográfico nuevo. En true usa enrutarV2 (medido: 14% menos
// km que el armado manual, 31% menos que asignar(), cero llegadas fuera de ventana); en false cae a
// asignar() sin revertir el commit. asignar()/asignarPorClusters quedan como respaldo.
const ENRUTADOR_V2 = true;

type CalData   = { on: boolean; p: number; b: number; c: number; ch: number; g?: string };

function mergeCalT(
  newCal: CalRecord,
  fechaStr: string,
  prevCalT: Record<string, CalData>,
  activeGrps: Set<string>
): Record<string, CalData> {
  const dia = getDia(fechaStr);
  const calDia = (newCal[dia] || newCal.LU || {}) as Record<string, string[]>;

  // Build map cod → grp for all stores in newCal for this day
  const newStoreMap = new Map<string, string>();
  ['rm', 'costa', 'fal'].forEach(grp => {
    (calDia[grp] || []).forEach(c => {
      if (c && c.length >= 2) newStoreMap.set(c, grp);
    });
  });

  const next: Record<string, CalData> = {};

  // Phase 1: keep prevCalT stores still in newCal — preserves prevCalT insertion order
  Object.keys(prevCalT).forEach(c => {
    const grp = newStoreMap.get(c);
    if (grp !== undefined) {
      next[c] = { ...prevCalT[c], g: grp };
      newStoreMap.delete(c);
    }
  });

  // Phase 2: append brand-new stores from newCal not previously seen
  newStoreMap.forEach((grp, c) => {
    next[c] = { on: activeGrps.has(grp), p: 0, b: 0, c: 0, ch: 0, g: grp };
  });

  // Phase 3: preserve manual / non-empty stores removed from newCal
  Object.keys(prevCalT).forEach(c => {
    if (!next[c] && (prevCalT[c].g === 'manual' || prevCalT[c].p > 0 || prevCalT[c].b > 0)) {
      next[c] = prevCalT[c];
    }
  });

  return next;
}

interface Results {
  ts: StoreItem[];
  rutas: Ruta[];
  extGps?: Record<string, number[]>;
  extTiendas?: Record<string, TiendaInfo & { _parada?: boolean; _tipo?: string; _desc?: string }>;
}

interface ComparisonData {
  manual: Ruta[];
  optima: Ruta[];            // columna alternativa: propuesta IA o, si la IA no está, optimizador GPS
  ts: StoreItem[];
  extGps?: Record<string, number[]>;
  extTiendas?: Record<string, TiendaInfo>;
  rebalanceada?: boolean;
  // Fase 4 PR-B: transparencia del motor de la columna alternativa.
  fuenteAlt: 'ia' | 'gps';   // qué motor produjo `optima` (IA o el optimizador GPS de respaldo)
  iaCargando?: boolean;      // true mientras se consulta la IA en segundo plano (muestra GPS entretanto)
  iaError?: string;          // si la IA falló → se cayó a GPS; se avisa al usuario
}

type PendientesGuardados = { savedAt: string; stores: { c: string; p: number; b: number; ch: number }[] };

export default function RutasScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  useDayRollover();  // recarga al cruzar medianoche → evita arrastrar tiendas/cantidades de ayer

  const [pendientes, setPendientes] = useState<PendientesGuardados | null>(() => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem('despacho_pendientes');
      if (!raw) return null;
      const data = JSON.parse(raw) as PendientesGuardados;
      const today = new Date().toISOString().split('T')[0];
      return data.savedAt && data.savedAt !== today && data.stores?.length > 0 ? data : null;
    } catch { return null; }
  });
  const [showPendientesModal, setShowPendientesModal] = useState(false);

  // 2ª vuelta: pendientes cross-device (keyed by dispatch fecha, NOT today)
  const [pendientesV2, setPendientesV2] = useState<{ c: string; p: number; b: number; ch: number }[]>([]);
  // Cierre de jornada: marca cross-device de "listo por hoy" (keyed by dispatch fecha)
  const [cerrado, setCerrado] = useState(false);

  const [tiendas, setTiendas] = useState<Record<string, TiendaInfo>>(() => ({ ...TIENDAS_INICIAL }));
  const [gps,     setGps]     = useState<Record<string, number[]>>(() => ({ ...GPS_INICIAL }));
  const cdRef                 = useRef<number[]>([...CD_INICIAL]);
  const [flota,   setFlota]   = useState<Vehiculo[]>(() => FLOTA_INICIAL.map(v => ({ ...v })));
  // [F2] patente→ts de activación (ordena los camiones). Persiste en localStorage → sobrevive al
  // recargar en este equipo (no se sincroniza cross-device: es una comodidad de armado local).
  const [flotaActivadaEn, setFlotaActivadaEn] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem('flotaOrdenActivacion') || '{}') as Record<string, number>; } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem('flotaOrdenActivacion', JSON.stringify(flotaActivadaEn)); } catch {}
  }, [flotaActivadaEn]);
  const [cal,     setCal]     = useState<CalRecord>(() => {
    // Fast-path: use localStorage cache written by the Calendario de Abastecimiento (if fresh)
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('_calCentral');
        if (raw) {
          const { cal: cached, ts } = JSON.parse(raw) as { cal: CalRecord; ts: number };
          if (Date.now() - ts < 60 * 60 * 1000) return cached;
        }
      }
    } catch {}
    return JSON.parse(JSON.stringify(CAL_INICIAL));
  });

  const [modo,       setModo]       = useState('drag');
  const [grps,       setGrps]       = useState(new Set(['rm']));
  const [calT,       setCalT]       = useState<Record<string, CalData>>({});
  const [supervisor, setSupervisor] = useState('');
  const [fecha,      setFecha]      = useState(todayStr);
  const [manualText, setManualText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [iaLoading] = useState(false); // (LLM parkeado; el botón "Asignar" usa clusters instantáneos)
  // Días PASADOS con asignaciones en el Enrutador pero sin registrar (aviso de recuperación).
  const [unregisteredDays, setUnregisteredDays] = useState<string[]>([]);

  const [results, setResults]           = useState<Results | null>(null);
  const kmTotalRealRef                  = useRef<number | null>(null);
  // Filtro de grupo (RM/COSTA/REGIONES) de DespachoHeader — antes vivía dentro de
  // InputSection (sidebarFilter); ahora la barra global lo controla y el board DESPACHO
  // (ManualDispatch, vía InputSection) solo lo consume para filtrar el pool "Sin asignar".
  const [grupoFiltro, setGrupoFiltro]   = useState<'all' | 'rm' | 'costa' | 'fal'>('all');
  // Camión elegido en el tablero DESPACHO (click en la tarjeta) para previsualizar su ruta
  // en el mapa ANTES de calcular — se limpia al cambiar de tab o al limpiar el tablero.
  const [camionSeleccionado, setCamionSeleccionado] = useState<string | null>(null);
  // [Cerrar en masa] Patentes marcadas para cerrar de una en el tablero DESPACHO. Se limpia al cambiar de fecha.
  const [cerrarSel, setCerrarSel] = useState<Set<string>>(new Set());
  // Km real (Google Directions) de esa preview — se muestra en la tarjeta del camión
  // elegido. null mientras el mapa todavía no resuelve la ruta (o no hay camión elegido).
  const [previewKm, setPreviewKm] = useState<number | null>(null);
  // [Planificador] Ruta ordenada + partida del tab PLAN, para dibujarla en el MapSection fijo.
  const [planRutas, setPlanRutas] = useState<Ruta[]>([]);
  const [planCd,    setPlanCd]    = useState<number[] | null>(null);
  // Paradas por DIRECCIÓN del planificador (coords + nombre) que el mapa no conoce por catálogo.
  const [planExt,   setPlanExt]   = useState<{ gps: Record<string, number[]>; tiendas: Record<string, TiendaInfo> }>({ gps: {}, tiendas: {} });
  // Km real + tiempo por tramo (Google Directions) de las rutas del Planificador, POR ÍNDICE de
  // ruta (el mapa dibuja varias). Se calculan al dibujar y suben por onKmReady.
  const [planLegsByRoute, setPlanLegsByRoute] = useState<Record<number, { dist: string; dur: string; durSec?: number }[]>>({});
  const [planKmByRoute,   setPlanKmByRoute]   = useState<Record<number, number>>({});
  // (El divisor board ↔ mapa vive ahora en InputSection: el mapa es la columna derecha del
  //  contenido, con los tabs a ancho completo arriba.)
  // Km real + detalle por tramo del mapa persistente (MapSection) — antes vivía dentro de
  // ResultsSection (que montaba su propio MapSection); ahora el mapa es un panel fijo fuera
  // de ResultsSection, así que el resultado se sube acá y baja a ResultsSection por props.
  const [kmPorRuta,      setKmPorRuta]      = useState<Record<number, number>>({});
  const [legDataPorRuta, setLegDataPorRuta] = useState<Record<number, {dist: string; dur: string; durSec?: number}[]>>({});
  const comparacionTokenRef             = useRef(0); // evita que una respuesta IA vieja pise una comparación nueva
  const [updateStatus,  setUpdateStatus]  = useState('idle');
  const [historialStatus, setHistorialStatus] = useState('idle');
  const [flotaStatus, setFlotaStatus]     = useState('idle');
  const [historialMsg,  setHistorialMsg]  = useState('');

  const [manualAsignaciones, setManualAsignaciones] = useState<Record<string, StoreItem[]>>({});
  // [E4·4b] Clusters históricos ("líneas" del coordinador) para la auto-asignación instantánea.
  const [clusters, setClusters] = useState<{ clusterDeTienda: Record<string, number>; centroides: Record<number, CentroideCluster> } | null>(null);
  const clustersRef = useRef<typeof clusters>(null);
  clustersRef.current = clusters;
  // ── Tab CONGELADOS (Enrutador): pool + asignación PARALELOS al despacho SECO ──
  // calTCong se alimenta SOLO de las filas de despacho_sesion con fuente 'congelados-*'
  // (bodega CONGELADOS, PR #341) — las cajas vienen en `bultos`. asignacionesCong es local
  // (v1 efímero: la asignación de congelados a camiones todavía no genera manifiesto; ese es
  // el follow-up 7b-iii). NO comparte estado con el pool seco (calT/manualAsignaciones).
  const [calTCong,         setCalTCong]         = useState<Record<string, CalData>>({});
  const [asignacionesCong, setAsignacionesCong] = useState<Record<string, StoreItem[]>>({});
  // Manifiestos YA guardados para la fecha (fuente de verdad persistente, cross-device). Se usan
  // para un banner "ya hay manifiestos guardados" y para reconstruir el tablero si hiciera falta
  // (p. ej. al abrir desde otro dispositivo y ver el lienzo vacío). No pisa el flujo de armado.
  const [manifiestosGuardados, setManifiestosGuardados] = useState<ManifiestoGuardado[]>([]);
  // Fase B: patentes CERRADAS individualmente en 1ª vuelta (cierre por vehículo), keyed por fecha.
  // Cross-device vía shared_session_state fuente 'rutas_cerradas'. El registro global SALTA estas
  // rutas (HISTORIAL append-only) y el día se marca 'rutas_reg' solo cuando TODAS están cerradas.
  const [cerradasV1, setCerradasV1] = useState<Set<string>>(new Set());
  // ── Tab "2ª VUELTA": pendientes de días anteriores, board y manifiesto AISLADOS del día actual ──
  const [pendientesV2Origen, setPendientesV2Origen] = useState<PendienteV2[]>([]);
  // Tablero V2 por FECHA de origen: fecha → (patente → tiendas). Antes era plano (patente → tiendas)
  // y sumaba todas las fechas por código; ahora cada fecha se asigna y cierra por separado.
  const [asignacionesV2, setAsignacionesV2]         = useState<Record<string, Record<string, StoreItem[]>>>({});
  const [v2Fecha, setV2Fecha]                       = useState<string>(''); // sub-pestaña de fecha activa
  const [manifiestoV2, setManifiestoV2]             = useState<Ruta[] | null>(null);
  // Fase B: manifiesto de un solo camión cerrado en 1ª vuelta (cierre por vehículo).
  const [manifiestoV1, setManifiestoV1]             = useState<Ruta[] | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);

  const [paradasAdicionales, setParadasAdicionales] = useState<Parada[]>([]);
  const paradaCounter = useRef(0);
  const [paradasOpen, setParadasOpen] = useState(false);
  // Panel de Cierre de Jornada — compartido entre ResultsSection (post-Calcular) y el
  // botón "Terminar día" del tablero DESPACHO (ver CierreJornadaPanel más abajo).
  const [cierreOpen, setCierreOpen] = useState(false);
  // Contenedor con scroll real del board de 2ª vuelta — mismo motivo que en InputSection:
  // auto-scroll al arrastrar cerca del borde más confiable que buscarlo por DOM-walk.
  const v2ScrollRef = useRef<HTMLDivElement>(null);

  const grpsRef = useRef(grps);
  useEffect(() => { grpsRef.current = grps; }, [grps]);

  const fechaRef = useRef(fecha);
  useEffect(() => { fechaRef.current = fecha; }, [fecha]);
  const tiendasRef = useRef(tiendas);
  useEffect(() => { tiendasRef.current = tiendas; }, [tiendas]);

  // "Actualizar datos" ahora vive en la barra superior (app/despacho/page.tsx), no en un menú.
  // Se comunica por eventos: escuchamos `enrutador-refresh` (clic) → recargamos; y publicamos
  // `enrutador-status` para que el botón refleje loading/success/error + total de tiendas.
  const actualizarRef = useRef<() => void>(() => {});
  actualizarRef.current = () => { void handleActualizarDatos(); };
  useEffect(() => {
    const h = () => actualizarRef.current();
    window.addEventListener('enrutador-refresh', h);
    return () => window.removeEventListener('enrutador-refresh', h);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('enrutador-status', {
      detail: { status: updateStatus, total: Object.keys(tiendas).length },
    }));
  }, [updateStatus, tiendas]);
  // Últimas filas de despacho_sesion (de otros equipos), por cod normalizado.
  // Se re-aplican al inicializar calT desde el calendario (evita perder counts si
  // los counts llegan antes de que cargue el calendario). #4
  const sesionRowsRef = useRef<Map<string, SesionRow>>(new Map());

  const sessionRestoredRef = useRef(false);
  const restoringRef       = useRef(false);

  // ── Real-time sync: manualAsignaciones across devices ────────────
  const lastPushedManualRef = useRef<string>('');
  const debounceManualRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualInitRef     = useRef(false);
  // ── Real-time sync: asignacionesV2 (2ª vuelta) across devices ────
  const lastPushedV2Ref     = useRef<string>('');
  const debounceV2Ref       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isV2InitRef         = useRef(false);

  // ── Real-time sync: cerradasV1 (patentes cerradas por vehículo) across devices ──
  const lastPushedCerradasRef = useRef<string>('');
  const isCerradasInitRef      = useRef(false);

  // ── Sync cal from the Calendario de Abastecimiento (cross-tab) ────
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== '_calCentral' || !e.newValue) return;
      try {
        const { cal: newCal } = JSON.parse(e.newValue) as { cal: CalRecord; ts: number };
        setCal(newCal);
        // Merge new calendar into calT, preserving manually-entered p/b counts
        setCalT(prev => mergeCalT(newCal, fechaRef.current, prev, grpsRef.current));
      } catch {}
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // ── Calendario autoritativo desde la BD + Realtime cross-device ───
  // Antes el Enrutador SOLO leía el cache localStorage (_calCentral) y, si faltaba o expiraba,
  // caía al estático CAL_INICIAL. Cuando la BD tenía tiendas que el estático no (p. ej. 26ALC en
  // martes o 57CAS en Regiones), esas tiendas: (a) no aparecían en un equipo, o (b) entraban por
  // despacho_sesion pero como "extras" AL FINAL, rompiendo el orden Regiones→Costa→Santiago — y el
  // resultado difería entre PC y Mac (cada uno con su cache). Ahora traemos la verdad de la BD al
  // montar y escuchamos cambios cross-device; nunca degradamos a estático (si la BD no responde,
  // fetch=null y se conserva el cal actual).
  useEffect(() => {
    let alive = true;
    const aplicarCalBD = (dbCal: CalRecord) => {
      if (!alive) return;
      writeCalendario(dbCal);   // coherencia del cache in-memory + _calCentral (beneficia otras pestañas)
      setCal(dbCal);
      setCalT(prev => reaplicarCounts(
        mergeCalT(dbCal, fechaRef.current, prev, grpsRef.current),
        sesionRowsRef.current,
        new Set(),
        (cod) => tiendasRef.current[cod]?.region,
      ));
    };
    fetchCalendarioSupa().then(dbCal => { if (dbCal) aplicarCalBD(dbCal); }).catch(() => {});
    const unsub = subscribeToCalendarioSupa(dbCal => aplicarCalBD(dbCal));
    return () => { alive = false; unsub(); };
  }, []);

  // ── Pre-load from Santiago dispatch ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('rutasInput');
      if (raw) {
        const items: StoreItem[] = JSON.parse(raw);
        if (items.length) {
          const newCalT: Record<string, CalData> = {};
          items.forEach(t => {
            newCalT[norm(t.c)] = { on: true, p: t.p, b: t.b, c: 0, ch: (t as { ch?: number }).ch ?? 0, g: 'rm' };
          });
          setCalT(newCalT);
          setGrps(new Set(['rm']));
          localStorage.removeItem('rutasInput');
        }
      }
    } catch (_) {}
  }, []);

  // ── Sync in real-time with Santiago dispatch ───────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFromSantiago = () => {
      // One-shot: user clicked "Enrutar" in Santiago
      try {
        const raw = localStorage.getItem('rutasInput');
        if (raw) {
          const items: StoreItem[] = JSON.parse(raw);
          if (items.length) {
            const newCalT: Record<string, CalData> = {};
            items.forEach(t => {
              newCalT[norm(t.c)] = { on: true, p: t.p, b: t.b, c: 0, ch: (t as { ch?: number }).ch ?? 0, g: 'rm' };
            });
            setCalT(prev => {
              const merged = { ...prev };
              Object.keys(newCalT).forEach(key => {
                if (!merged[key] || merged[key].p !== newCalT[key].p || merged[key].b !== newCalT[key].b || merged[key].ch !== newCalT[key].ch) {
                  merged[key] = newCalT[key];
                }
              });
              return merged;
            });
            setGrps(new Set(['rm']));
            localStorage.removeItem('rutasInput');
          }
        }
      } catch (_) {}

      // Live: continuous sync from Santiago bodega item registration
      try {
        const rawCounts = localStorage.getItem('santiagoCounts');
        if (rawCounts) {
          const sc: { date?: string; counts?: Record<string, { p: number; b: number; c?: number; ch?: number }> } = JSON.parse(rawCounts);
          const d = new Date();
          const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const counts = (sc.date && sc.date === todayKey)
            ? (sc.counts ?? null)
            : (!sc.date ? null : null); // reject legacy or wrong-date data
          if (counts) {
            setCalT(prev => {
              const merged = { ...prev };
              let changed = false;
              Object.entries(counts).forEach(([cod, data]) => {
                const c = norm(cod);
                const newC  = data.c  ?? 0;
                const newCh = data.ch ?? 0;
                if (merged[c]) {
                  if (merged[c].p !== data.p || merged[c].b !== data.b || merged[c].c !== newC || merged[c].ch !== newCh) {
                    merged[c] = { ...merged[c], p: data.p, b: data.b, c: newC, ch: newCh, on: data.p > 0 || data.b > 0 || newC > 0 || newCh > 0 };
                    changed = true;
                  }
                }
              });
              return changed ? merged : prev;
            });
          }
        }
      } catch (_) {}

      // Live: continuous sync from Regiones bodega item registration
      try {
        const rawRegiones = localStorage.getItem('regionesCounts');
        if (rawRegiones) {
          const rc: { date?: string; counts?: Record<string, { p: number; b: number; c?: number; ch?: number }> } = JSON.parse(rawRegiones);
          const d = new Date();
          const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          const counts = (rc.date && rc.date === todayKey) ? (rc.counts ?? null) : null;
          if (counts) {
            setCalT(prev => {
              const merged = { ...prev };
              let changed = false;
              Object.entries(counts).forEach(([cod, data]) => {
                const c = norm(cod);
                const newC  = data.c  ?? 0;
                const newCh = data.ch ?? 0;
                if (merged[c]) {
                  if (merged[c].p !== data.p || merged[c].b !== data.b || merged[c].c !== newC || merged[c].ch !== newCh) {
                    merged[c] = { ...merged[c], p: data.p, b: data.b, c: newC, ch: newCh, on: data.p > 0 || data.b > 0 || newC > 0 || newCh > 0 };
                    changed = true;
                  }
                } else if (data.p > 0 || data.b > 0 || newC > 0 || newCh > 0) {
                  merged[c] = { on: true, p: data.p, b: data.b, c: newC, ch: newCh, g: 'fal' };
                  changed = true;
                }
              });
              return changed ? merged : prev;
            });
          }
        }
      } catch (_) {}
    };

    syncFromSantiago();
    window.addEventListener('storage', syncFromSantiago);
    const interval = setInterval(syncFromSantiago, 2000);

    return () => {
      window.removeEventListener('storage', syncFromSantiago);
      clearInterval(interval);
    };
  }, []);

  // ── Supabase Realtime: cross-device sync ───────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const today = todayStr();

    function applyRow(row: SesionRow) {
      // Congelados NO fluye al pool SECO del Enrutador: tiene su propio flujo (fuentes
      // 'congelados-santiago'/'congelados-regiones' → tab CONGELADOS). Sin este guard, los
      // counts de la bodega Congelados inflaban el pool seco (una tienda congelada aparecía
      // como si fuera despacho seco).
      if ((row.fuente ?? '').startsWith('congelados')) return;
      const c = norm(row.tienda_cod);
      sesionRowsRef.current.set(c, row);  // recordar para re-aplicar si el calendario carga después
      setCalT(prev => {
        const rowCh = row.chocolates ?? 0;
        const cc = row.contenedores ?? 0;
        const hasCounts = row.pallets > 0 || row.bultos > 0 || cc > 0 || rowCh > 0;
        if (!prev[c]) {
          // Cualquier tienda ARMADA hoy en Bodega con carga fluye al Enrutador aunque no esté en el
          // calendario del día (p. ej. 55ITA agregada desde Picking), colocada en su GRUPO. Guard:
          // solo HOY, con cantidades, y con el calendario ya cargado (calT no vacío) para no
          // saltarse el init. El orden lo resuelve `ordenarCalT` (extras van en su grupo).
          if (fechaRef.current !== today || !hasCounts || Object.keys(prev).length === 0) return prev;
          const g = grupoArmada(row.fuente, tiendasRef.current[c]?.region);
          return { ...prev, [c]: { on: true, p: row.pallets, b: row.bultos, c: cc, ch: rowCh, g } };
        }
        if (prev[c].p === row.pallets && prev[c].b === row.bultos && prev[c].c === cc && (prev[c].ch ?? 0) === rowCh) return prev;
        return {
          ...prev,
          [c]: { ...prev[c], p: row.pallets, b: row.bultos, c: cc, ch: rowCh, on: hasCounts },
        };
      });
    }

    // Alimenta SOLO el pool CONGELADOS (tab del Enrutador) desde las filas 'congelados-*'.
    // Las cajas vienen en `bultos` (p/c/ch = 0). Es el espejo inverso del guard de applyRow.
    function applyRowCong(row: SesionRow) {
      if (!(row.fuente ?? '').startsWith('congelados')) return;
      const c = norm(row.tienda_cod);
      const boxes = row.bultos ?? 0;
      setCalTCong(prev => {
        if (!prev[c]) {
          if (boxes <= 0) return prev;
          // Grupo para el filtro RM/Costa/Regiones (helper puro, testeado).
          const g = grupoCongelados(row.fuente ?? '', tiendasRef.current[c]?.region);
          return { ...prev, [c]: { on: true, p: 0, b: boxes, c: 0, ch: 0, g } };
        }
        if (prev[c].b === boxes) return prev;
        return { ...prev, [c]: { ...prev[c], b: boxes, on: boxes > 0 } };
      });
    }

    // Initial load: fetch any counts already in Supabase (from other devices today)
    const initTimeout = setTimeout(() => {
      fetchCounts(today).then(rows => rows.forEach(row => { applyRow(row); applyRowCong(row); })).catch(() => {});
    }, 1500);

    // Subscribe to real-time changes from other devices
    const unsub = subscribeToSesion(today, row => { applyRow(row); applyRowCong(row); });

    return () => {
      clearTimeout(initTimeout);
      unsub();
    };
  }, []);

  // ── One-time restore: merge saved despachoCounts into calT ────────
  // Only restores if the saved payload was written for the same fecha;
  // stale data from a previous day is silently discarded.
  useEffect(() => {
    if (sessionRestoredRef.current || Object.keys(calT).length === 0) return;
    sessionRestoredRef.current = true;
    try {
      const saved = localStorage.getItem('despachoCounts');
      if (!saved) return;
      const payload: { date?: string; counts?: Record<string, { p: number; b: number; c?: number }> } = JSON.parse(saved);
      const savedDate = payload.date;
      const session   = payload.counts ?? (payload as Record<string, { p: number; b: number; c?: number }>);
      // Reject if no date stamp (legacy) or if date doesn't match current session
      if (!savedDate || savedDate !== fecha) return;
      const entries = Object.entries(session).filter(([, d]) => d.p > 0 || d.b > 0 || (d.c ?? 0) > 0);
      if (!entries.length) return;
      restoringRef.current = true;
      setCalT(prev => {
        const merged = { ...prev };
        entries.forEach(([cod, data]) => {
          const c = norm(cod);
          // Only restore counts for stores already in today's calendar — never inject
          // stores from a different day's session into the current day's view.
          if (merged[c]) merged[c] = { ...merged[c], p: data.p, b: data.b, c: data.c ?? 0, ch: (data as { ch?: number }).ch ?? 0, on: true };
        });
        return merged;
      });
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calT]);

  // ── Write despachoCounts → Santiago bodega ────────────────────────
  // Skipped during the restore cycle so we never overwrite the saved session
  // with the transient all-zero calendar state that exists before restore applies.
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionRestoredRef.current) return;
    if (restoringRef.current) { restoringRef.current = false; return; }
    const counts: Record<string, { p: number; b: number; c: number }> = {};
    Object.entries(calT).forEach(([cod, data]) => {
      if (data.p > 0 || data.b > 0 || data.c > 0) counts[cod] = { p: data.p, b: data.b, c: data.c };
    });
    localStorage.setItem('despachoCounts', JSON.stringify({ date: fecha, counts }));
  }, [calT, fecha]);

  // ── Load fleet from Supabase (source of truth) ───────────────────
  useEffect(() => {
    fetch('/api/flota')
      .then(r => r.ok ? r.json() : null)
      .then((json: { flota: Vehiculo[] } | null) => {
        if (json?.flota && json.flota.length > 0) {
          setFlota(json.flota);
        } else if (json?.flota && json.flota.length === 0) {
          // Table is empty — seed it with FLOTA_INICIAL
          FLOTA_INICIAL.forEach(v => {
            fetch('/api/flota', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify(v),
            }).catch(() => {});
          });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load sheets data ──────────────────────────────────────────────
  useEffect(() => { handleActualizarDatos(); }, []);

  // ── Load tiendas from Supabase (source of truth) ─────────────────
  // Merges Supabase records over TIENDAS_INICIAL/GPS_INICIAL (which stay as fallback).
  // Skips inactive stores (activo === false), same criterion as CalendarioColumnas.
  // Resilient: silently ignores errors so the router keeps working on failure.
  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.ok ? r.json() : null)
      .then((json: {
        tiendas?: Array<{
          codigo: string;
          nombre: string;
          direccion?: string;
          region?: string;
          sector_comuna?: string;
          corredor?: string;
          tipo?: string;
          ventana?: string;
          frecuencia?: string;
          lat?: number | null;
          lon?: number | null;
          activo?: boolean;
        }>
      } | null) => {
        if (!json?.tiendas?.length) return;
        const tiendasPatch: Record<string, TiendaInfo> = {};
        const gpsPatch: Record<string, number[]> = {};
        for (const t of json.tiendas) {
          if (t.activo === false) continue;
          const cod = norm(t.codigo);
          if (!cod) continue;
          tiendasPatch[cod] = {
            n: t.nombre,
            z: t.sector_comuna || t.corredor || '',
            v: t.ventana || '',
            d: t.direccion,
            region: t.region,
            corredor: t.corredor,
            tipo: t.tipo,
            frecuencia: t.frecuencia,
          };
          // Valid Chile GPS range (same bounds as parseTSheetAuth)
          if (
            t.lat != null && t.lon != null &&
            !isNaN(t.lat) && !isNaN(t.lon) &&
            t.lat > -60 && t.lat < -17 &&
            t.lon > -76 && t.lon < -66
          ) {
            gpsPatch[cod] = [t.lat, t.lon];
          }
        }
        if (Object.keys(tiendasPatch).length > 0) {
          setTiendas(prev => ({ ...prev, ...tiendasPatch }));
        }
        if (Object.keys(gpsPatch).length > 0) {
          setGps(prev => ({ ...prev, ...gpsPatch }));
        }
      })
      .catch(() => {}); // Resilient: never break the router on API failure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync manual assignments when calT changes ────────────────────
  useEffect(() => {
    setManualAsignaciones(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach(plate => {
        next[plate] = next[plate].map(s => {
          const updated = calT[s.c];
          if (updated && (updated.p !== s.p || updated.b !== s.b)) {
            changed = true;
            return { ...s, p: updated.p, b: updated.b };
          }
          return s;
        });
      });
      return changed ? next : prev;
    });
  }, [calT]);

  // ── Fetch + subscribe manualAsignaciones (cross-device, por fecha) ──────────
  // Depende de `fecha`: al cambiar el día (p. ej. a uno pasado que quedó sin registrar),
  // recarga las asignaciones de ESE día. El guard isManualInitRef evita que el push
  // debounced pise el día recién cargado con las asignaciones del día anterior.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    isManualInitRef.current = false;

    fetchSessionState('rutas', fecha).then(remote => {
      const remoteObj = (remote && typeof remote === 'object') ? remote as Record<string, StoreItem[]> : {};
      setManualAsignaciones(remoteObj);
      lastPushedManualRef.current = JSON.stringify(remoteObj);
      isManualInitRef.current = true;
    }).catch(() => { isManualInitRef.current = true; });

    const unsub = subscribeToSessionState('rutas', userId ?? '', (state) => {
      if (!state || typeof state !== 'object') return;
      const remoteJson = JSON.stringify(state);
      if (remoteJson === lastPushedManualRef.current) return;
      lastPushedManualRef.current = remoteJson;
      setManualAsignaciones(state as Record<string, StoreItem[]>);
    }, undefined, fecha);

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  // ── Manifiestos ya guardados para la fecha (persistente, cross-device) ──────
  // Independiente del lienzo efímero: si abres el Enrutador desde otro equipo y el tablero se ve
  // vacío pero el despacho ya está guardado, este fetch lo detecta (banner + "Cargar en tablero").
  useEffect(() => {
    let cancel = false;
    fetch(`/api/rutas-despacho?fecha=${encodeURIComponent(fecha)}`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then((j: { data?: ManifiestoGuardado[] }) => { if (!cancel) setManifiestosGuardados(Array.isArray(j.data) ? j.data : []); })
      .catch(() => { if (!cancel) setManifiestosGuardados([]); });
    return () => { cancel = true; };
  }, [fecha]);

  // Reconstruir el tablero desde los manifiestos guardados (opt-in, no pisa trabajo en curso):
  // activa esas patentes y coloca sus tiendas. Fuente de verdad = rutas_despacho (igual en todo
  // dispositivo). No re-guarda nada; solo llena el lienzo para que veas lo que ya quedó registrado.
  function handleCargarManifiestosGuardados() {
    const asig = reconstruirAsignaciones(manifiestosGuardados);
    if (!Object.keys(asig).length) return;
    const patentes = new Set(Object.keys(asig).map(p => normPatente(p)));
    setFlota(prev => prev.map(v => (patentes.has(normPatente(v.p)) ? { ...v, on: true } : v)));
    setManualAsignaciones(asig);
  }

  // ── Debounced push manualAsignaciones → Supabase ─────────────────
  useEffect(() => {
    if (!isManualInitRef.current) return;
    const json = JSON.stringify(manualAsignaciones);
    if (json === lastPushedManualRef.current) return;
    if (debounceManualRef.current) clearTimeout(debounceManualRef.current);
    debounceManualRef.current = setTimeout(() => {
      lastPushedManualRef.current = json;
      pushSessionState('rutas', manualAsignaciones, userId, fecha).catch(() => {});
    }, 800);
    return () => {
      if (debounceManualRef.current) clearTimeout(debounceManualRef.current);
    };
  }, [manualAsignaciones, userId, fecha]);

  // ── Fetch + subscribe asignacionesV2 (2ª vuelta) cross-device ─────
  // La 2ª vuelta se trabaja "hoy" (independiente de la fecha seleccionada). Se sincroniza para que
  // lo asignado en un dispositivo (p. ej. el móvil) aparezca en el otro (el desktop) y se pueda
  // cerrar el camión desde cualquiera. Mismo patrón que manualAsignaciones, fuente 'rutas_v2'.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hoy = todayStr();
    isV2InitRef.current = false;

    // Migración: la forma vieja del board V2 era plana (patente → tiendas, valores = array).
    // Ahora es por fecha (fecha → patente → tiendas). Si llega la vieja se descarta (es efímero;
    // el backlog real vive en pendientesV2Origen, solo se resetea la asignación en curso).
    const esFormaVieja = (raw: Record<string, unknown>) => Object.values(raw).some(v => Array.isArray(v));

    fetchSessionState('rutas_v2', hoy).then(remote => {
      const raw = (remote && typeof remote === 'object') ? remote as Record<string, unknown> : {};
      const remoteObj = esFormaVieja(raw) ? {} : raw as Record<string, Record<string, StoreItem[]>>;
      setAsignacionesV2(remoteObj);
      lastPushedV2Ref.current = JSON.stringify(remoteObj);
      isV2InitRef.current = true;
    }).catch(() => { isV2InitRef.current = true; });

    const unsub = subscribeToSessionState('rutas_v2', userId ?? '', (state) => {
      if (!state || typeof state !== 'object') return;
      if (esFormaVieja(state as Record<string, unknown>)) return; // forma vieja → ignorar
      const remoteJson = JSON.stringify(state);
      if (remoteJson === lastPushedV2Ref.current) return;
      lastPushedV2Ref.current = remoteJson;
      setAsignacionesV2(state as Record<string, Record<string, StoreItem[]>>);
    }, undefined, hoy);

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // ── Debounced push asignacionesV2 → Supabase ─────────────────────
  useEffect(() => {
    if (!isV2InitRef.current) return;
    const json = JSON.stringify(asignacionesV2);
    if (json === lastPushedV2Ref.current) return;
    if (debounceV2Ref.current) clearTimeout(debounceV2Ref.current);
    debounceV2Ref.current = setTimeout(() => {
      lastPushedV2Ref.current = json;
      pushSessionState('rutas_v2', asignacionesV2, userId, todayStr()).catch(() => {});
    }, 800);
    return () => {
      if (debounceV2Ref.current) clearTimeout(debounceV2Ref.current);
    };
  }, [asignacionesV2, userId]);

  // ── Fetch + subscribe cerradasV1 (cross-device, por fecha) ─────────────────
  // Mismo patrón que manualAsignaciones: fetch al montar/cambiar fecha + subscribe realtime.
  // El merge es la UNIÓN (cerrar es monótono) para no perder cierres locales ante ecos viejos.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    isCerradasInitRef.current = false;

    fetchSessionState('rutas_cerradas', fecha).then(remote => {
      const set = parseCerradas(remote);
      setCerradasV1(set);
      lastPushedCerradasRef.current = JSON.stringify([...set].sort());
      isCerradasInitRef.current = true;
    }).catch(() => { isCerradasInitRef.current = true; });

    const unsub = subscribeToSessionState('rutas_cerradas', userId ?? '', (state) => {
      const remote = parseCerradas(state);
      setCerradasV1(prev => {
        const merged = mergeCerradas(prev, remote);
        lastPushedCerradasRef.current = JSON.stringify([...merged].sort());
        return merged;
      });
    }, undefined, fecha);

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  // Persistir cerradasV1 (cross-device). Se llama tras cada cierre por vehículo.
  const pushCerradasV1 = (next: Set<string>) => {
    const json = JSON.stringify([...next].sort());
    if (json === lastPushedCerradasRef.current) return;
    lastPushedCerradasRef.current = json;
    void pushSessionState('rutas_cerradas', serializeCerradas(next), userId, fecha).catch(() => {});
  };

  // ── Días pasados con asignaciones sin registrar (aviso de recuperación) ──
  useEffect(() => {
    fetchUnregisteredRutasDays().then(setUnregisteredDays).catch(() => {});
  }, []);

  // Descartar un día del aviso de forma PERMANENTE (no solo ocultar): marca ese día como
  // cerrado en el Enrutador (p. ej. ya se registró a mano en las hojas). Usa el mismo marcador
  // que el registro ('rutas_reg') para que fetchUnregisteredRutasDays deje de listarlo.
  const dismissUnregisteredDay = (d: string) => {
    setUnregisteredDays(prev => prev.filter(x => x !== d));
    void pushSessionState('rutas_reg', { dismissed: true, at: new Date().toISOString() }, userId, d);
  };

  // ── Sync manual text → calT ───────────────────────────────────────
  useEffect(() => {
    if (modo !== 'man') return;
    const txt = manualText.trim();
    if (!txt) return;
    const result = parseManual(txt);
    if (result.ts.length === 0) return;
    setCalT(prev => {
      const next = { ...prev };
      let changed = false;
      result.ts.forEach(t => {
        if (!next[t.c]) { next[t.c] = { on: true, p: t.p, b: t.b, c: 0, ch: 0, g: 'manual' }; changed = true; }
        else if (next[t.c].p !== t.p || next[t.c].b !== t.b) { next[t.c] = { ...next[t.c], on: true, p: t.p, b: t.b }; changed = true; }
      });
      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualText, modo]);

  // ── Init calT from calendar when empty ───────────────────────────
  useEffect(() => {
    if (Object.keys(calT).length > 0) return;
    const dia    = getDia(fecha);
    const calDia = cal[dia] || cal.LU || {};
    const newCalT: Record<string, CalData> = {};
    ['rm','costa','fal'].forEach(grp => {
      ((calDia as Record<string, string[]>)[grp] || []).forEach(c => {
        if (c && c.length >= 2) newCalT[c] = { on: grpsRef.current.has(grp), p: 0, b: 0, c: 0, ch: 0, g: grp };
      });
    });
    // #4: re-aplicar counts de despacho_sesion ya recibidos. Cubre la carrera "counts llegan
    // antes que el calendario". A las tiendas del calendario les actualiza los counts; a OFIKC
    // (excepción, fuera del calendario) la inyecta si fue armada hoy con cantidades.
    sesionRowsRef.current.forEach((row, c) => {
      const cc = row.contenedores ?? 0;
      const chh = row.chocolates ?? 0;
      const hasCounts = row.pallets > 0 || row.bultos > 0 || cc > 0 || chh > 0;
      if (newCalT[c]) {
        newCalT[c] = { ...newCalT[c], p: row.pallets, b: row.bultos, c: cc, ch: chh, on: hasCounts };
      } else if (hasCounts) {
        // Armada hoy fuera del calendario → inyectar en su grupo (ver applyRow / reaplicarCounts).
        const g = grupoArmada(row.fuente, tiendasRef.current[c]?.region);
        newCalT[c] = { on: true, p: row.pallets, b: row.bultos, c: cc, ch: chh, g };
      }
    });
    setCalT(newCalT);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, cal]);

  // ── Sorted calT — orden del calendario: Regiones (fal) → Costa → Santiago (rm) ──
  // Lógica pura extraída a utils/ordenarCalT (testeable). Oculta "fantasmas" (fuera de catálogo
  // y sin cantidades, ej. "ALC" tecleado en vez de "26ALC"). El orden depende del calendario del
  // día → por eso el Enrutador ahora trae el calendario autoritativo de la BD (efecto de arriba).
  const sortedCalT = useMemo(() => {
    const dia    = getDia(fecha);
    const calDia = (cal[dia] || cal.LU || {}) as Record<string, string[]>;
    return ordenarCalT<CalData>(
      calT,
      { rm: calDia.rm || [], costa: calDia.costa || [], fal: calDia.fal || [] },
      (c) => !!tiendas[c],
      esFantasmaCalT,
    );
  }, [calT, cal, fecha, tiendas]);

  // Orden del pool CONGELADOS. No hay orden de calendario cargado para congelados en el
  // Enrutador (v1): las tiendas se ordenan por grupo (RM/Costa/Regiones) como "extras".
  const sortedCalTCong = useMemo(() => ordenarCalT<CalData>(
    calTCong,
    { rm: [], costa: [], fal: [] },
    (c) => !!tiendas[c],
    esFantasmaCalT,
  ), [calTCong, tiendas]);

  // ── Sync calT → manual text ───────────────────────────────────────
  // La generación del texto (con tabs RM/COSTA/REGIONES, CH y totales)
  // ahora vive en ManualMode, que recibe sortedCalT como prop.

  // ── Calendar handlers ─────────────────────────────────────────────
  function handleToggleGroup(gid: string) {
    setGrps(prev => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      setCalT(prevCalT => {
        const c2 = { ...prevCalT };
        Object.keys(c2).forEach(c => { if (c2[c].g === gid) c2[c] = { ...c2[c], on: next.has(gid) }; });
        return c2;
      });
      return next;
    });
  }

  // Pill de filtro de grupo (Todas/RM/COSTA/REGIONES) — se movió del DespachoHeader (arriba, al
  // lado de Supervisor) a la fila "Sin asignar" de ManualDispatch. Misma lógica que tenía el
  // header: activa/filtra el grupo y togglea su visibilidad.
  function handleGroupPill(id: 'all' | 'rm' | 'costa' | 'fal') {
    if (id === 'all') { setGrupoFiltro('all'); return; }
    if (!grps.has(id)) { handleToggleGroup(id); setGrupoFiltro(id); }
    else if (grupoFiltro === id) { handleToggleGroup(id); setGrupoFiltro('all'); }
    else { setGrupoFiltro(id); }
  }


  // Los conteos del Enrutador son SOLO-LECTURA (se definen en Bodega) — no hay edición manual.

  // ── Fleet handlers ────────────────────────────────────────────────
  function handleToggleFlota(idx: number) {
    const v = flota[idx];
    if (!v) return;
    const newOn = !v.on;
    setFlota(prev => prev.map((x, i) => i === idx ? { ...x, on: newOn } : x));
    // [F2] Al activar, registrar el momento → los camiones se ordenan por recencia (último primero).
    if (newOn) setFlotaActivadaEn(prev => ({ ...prev, [v.p]: Date.now() }));
    // Persistir "en servicio" (memoria permanente). Fire-and-forget; el toggle solo
    // {p,on} no requiere admin (ver /api/flota PATCH).
    fetch('/api/flota', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p: v.p, on: newOn }),
    }).catch(() => {});
  }
  function handleToggleTlbd(idx: number) {
    setFlota(prev => prev.map((v, i) => i === idx ? { ...v, tlbd: !v.tlbd } : v));
  }
  // [Fase 3] Conductor/pionetas ya no se editan en la tarjeta de Vehículos: se asignan por
  // ruta en FLOTA → Gestionar (post-registro). handleChoferChange (RouteCard) sigue existiendo.
  function handleAgregarVehiculo(vehiculo: Vehiculo) {
    setFlota(prev => [...prev, vehiculo]);
    setFlotaStatus('saving');
    // Persist to Supabase + sync to Sheets
    fetch('/api/flota', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(vehiculo),
    }).then(async r => {
      if (r.status === 409) {
        // Already exists — update instead
        await fetch('/api/flota', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(vehiculo),
        });
      } else if (!r.ok) {
        throw new Error(`Error ${r.status}`);
      }
      // Sync fleet to Google Sheets
      return fetch('/api/flota/export-sheets', { method: 'POST' });
    }).then(r => {
      if (r && !r.ok) throw new Error('Error sincronizando Sheets');
      setFlotaStatus('success');
      setTimeout(() => setFlotaStatus('idle'), 3000);
    }).catch(e => {
      console.error('[handleAgregarVehiculo]', e);
      setFlotaStatus('error');
      setTimeout(() => setFlotaStatus('idle'), 4000);
    });
  }
  function handleEliminarVehiculo(idx: number) {
    setFlota(prev => {
      const vehiculoEliminado = prev[idx];
      const newFlota = prev.filter((_, i) => i !== idx);
      if (vehiculoEliminado?.p) {
        setFlotaStatus('saving');
        fetch(`/api/flota?patente=${encodeURIComponent(vehiculoEliminado.p)}`, { method: 'DELETE' })
          .then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return fetch('/api/flota/export-sheets', { method: 'POST' }); })
          .then(r => { if (r && !r.ok) throw new Error('Error sincronizando Sheets'); setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); })
          .catch(e => { console.error('[handleEliminarVehiculo]', e); setFlotaStatus('error'); setTimeout(() => setFlotaStatus('idle'), 4000); });
      }
      return newFlota;
    });
  }
  const handleActualizarVehiculoRef = useRef<((v: Partial<Vehiculo> & { p: string }) => void) | null>(null);
  handleActualizarVehiculoRef.current = function handleActualizarVehiculo(vehiculo: Partial<Vehiculo> & { p: string }) {
    setFlotaStatus('saving');
    setFlota(prev => prev.map(v => v.p === vehiculo.p ? { ...v, ...vehiculo } : v));
    fetch('/api/flota', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(vehiculo),
    }).then(r => { if (!r.ok) throw new Error(`Error ${r.status}`); return fetch('/api/flota/export-sheets', { method: 'POST' }); })
      .then(() => { setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); })
      .catch(e => { console.error('[handleActualizarVehiculo]', e); setFlotaStatus('error'); setTimeout(() => setFlotaStatus('idle'), 4000); });
  };
  function handleActualizarVehiculo(patente: string, updates: Partial<Vehiculo>) {
    handleActualizarVehiculoRef.current?.({ p: patente, ...updates });
  }

  // ── Manual text parser ────────────────────────────────────────────
  function parseManual(txt: string): { ts: StoreItem[]; errs: string[] } {
    const ts: StoreItem[] = [], errs: string[] = [];
    txt = txt.replace(/[⁠​‌‍﻿   ]/g, '');
    txt.split('\n').forEach((ln, i) => {
      const raw = ln.trim(); if (!raw) return;
      const m = raw.match(/^([A-Za-záéíóúÁÉÍÓÚñÑ0-9]+)\s*:?\s*(\d+)\s*[Pp]\s*(?:[+\-]?\s*(\d+)\s*[Bb])?/);
      if (m) {
        const c = norm(m[1]);
        if (!tiendas[c]) { errs.push(`"${m[1]}" no reconocido (línea ${i+1})`); return; }
        ts.push({ c, p: parseInt(m[2]), b: parseInt(m[3] || '0') });
      } else {
        errs.push(`Línea ${i+1}: "${raw}" — formato incorrecto`);
      }
    });
    return { ts, errs };
  }

  // ── Segunda vuelta: pendientes Supabase ──────────────────────────
  // ACUMULA en vez de sobrescribir: mantiene las pendientes previas de esa fecha que NO se
  // asignaron en esta ronda, les une las nuevas no asignadas (counts frescos) y quita las que
  // se asignaron. Así un registro parcial (p. ej. la 2ª vuelta de un subconjunto) NO borra las
  // demás pendientes del día; y al asignarlas por fin, dejan de ser pendientes.
  async function savePendientesV2(
    fechaDespacho: string,
    noAsignadas: { c: string; p: number; b: number; ch: number }[],
    asignadas: Set<string>,
  ): Promise<void> {
    const byCod = new Map<string, { c: string; p: number; b: number; ch: number }>();
    try {
      const { data } = await supabase
        .from('shared_session_state')
        .select('state')
        .eq('fecha', fechaDespacho)
        .eq('fuente', 'segunda_vuelta')
        .maybeSingle();
      const prev = ((data?.state as { stores?: { c: string; p: number; b: number; ch: number }[] } | null)?.stores) ?? [];
      for (const s of prev) if (!asignadas.has(s.c)) byCod.set(s.c, s); // previas que siguen sin asignar
    } catch {}
    for (const s of noAsignadas) byCod.set(s.c, s); // nuevas no asignadas (counts frescos)
    const stores = [...byCod.values()];

    const payload = { savedAt: new Date().toISOString(), fecha: fechaDespacho, stores };
    try { localStorage.setItem('despacho_pendientes_v2', JSON.stringify(payload)); } catch {}
    supabase
      .from('shared_session_state')
      .upsert({ fecha: fechaDespacho, fuente: 'segunda_vuelta', state: payload }, { onConflict: 'fecha,fuente' })
      .then(({ error }) => { if (error) console.error('[pendientes-v2]', error.message); });
    setPendientesV2(stores);
  }

  useEffect(() => {
    // 1. Quick path: localStorage
    try {
      const raw = localStorage.getItem('despacho_pendientes_v2');
      if (raw) {
        const saved = JSON.parse(raw) as { fecha: string; stores: { c: string; p: number; b: number; ch: number }[] };
        if (saved.fecha === fecha && saved.stores.length > 0) {
          setPendientesV2(saved.stores);
          return;
        }
      }
    } catch {}
    // 2. Cross-device path: Supabase keyed by dispatch fecha
    void (async () => {
      try {
        const { data } = await supabase
          .from('shared_session_state')
          .select('state')
          .eq('fecha', fecha)
          .eq('fuente', 'segunda_vuelta')
          .maybeSingle();
        const s = data?.state as { stores?: { c: string; p: number; b: number; ch: number }[] } | null;
        setPendientesV2(s?.stores?.length ? s.stores : []);
      } catch {}
    })();
  }, [fecha]);

  // [Punto 2] Al abrir una fecha PASADA, cargar en el pool TODAS las tiendas de bodega de ese
  // día (despacho_sesion), no solo las asignadas. Así las que quedaron sin asignar (p. ej. las
  // que se apartaron para 2ª vuelta) aparecen y se pueden asignar/registrar de forma retroactiva.
  // Solo AGREGA tiendas que no estén ya en calT (no pisa las asignaciones cargadas).
  useEffect(() => {
    if (fecha >= todayStr()) return; // solo días pasados
    let cancelled = false;
    void (async () => {
      const rows = await fetchCounts(fecha).catch(() => [] as SesionRow[]);
      if (cancelled || !rows.length) return;
      const dia = getDia(fecha);
      const calDia = (cal[dia] || cal.LU || {}) as Record<string, string[]>;
      const grpOf = (c: string): string => {
        for (const g of ['rm', 'costa', 'fal']) if ((calDia[g] || []).some(x => norm(x) === c)) return g;
        return 'rm';
      };
      setCalT(prev => {
        const next = { ...prev };
        let changed = false;
        for (const row of rows) {
          const c  = norm(row.tienda_cod);
          const p  = row.pallets, b = row.bultos, cc = row.contenedores ?? 0, ch = row.chocolates ?? 0;
          if (p === 0 && b === 0 && cc === 0 && ch === 0) continue;
          if (!next[c]) { next[c] = { on: true, p, b, c: cc, ch, g: grpOf(c) }; changed = true; }
        }
        return changed ? next : prev;
      });
    })();
    return () => { cancelled = true; };
  }, [fecha, cal]);

  function handleCargarPendientes() {
    if (!pendientesV2.length) return;
    const txt = pendientesV2.map(s => `${s.c} ${s.p}P${s.b ? ' ' + s.b + 'B' : ''}`).join('\n');
    setManualText(txt);
    setModo('man');
  }

  // ── Tab "2ª VUELTA": cargar pendientes de días anteriores (aislado del día actual) ──
  useEffect(() => {
    fetchPendientesV2Pasadas().then(setPendientesV2Origen).catch(() => {});
  }, []);

  // Tab V2 POR FECHA: fechas del backlog + pool de la sub-pestaña activa (sin sumar entre fechas).
  const fechasV2 = useMemo(() => fechasBacklogV2(pendientesV2Origen), [pendientesV2Origen]);
  const conteoV2 = useMemo(() => conteoPorFecha(pendientesV2Origen), [pendientesV2Origen]);
  const calTV2 = useMemo<Record<string, CalData>>(() => {
    const dia = getDia(todayStr());
    const calDia = (cal[dia] || cal.LU || {}) as Record<string, string[]>;
    const grpOf = (cod: string): string => {
      for (const g of ['rm', 'costa', 'fal']) if ((calDia[g] || []).some(x => norm(x) === norm(cod))) return g;
      return 'rm';
    };
    return poolV2ParaFecha(pendientesV2Origen, v2Fecha, norm, grpOf);
  }, [pendientesV2Origen, v2Fecha, cal]);
  // Mantener la sub-pestaña activa válida (default: la fecha más antigua del backlog).
  useEffect(() => {
    if (fechasV2.length === 0) { if (v2Fecha) setV2Fecha(''); return; }
    if (!fechasV2.includes(v2Fecha)) setV2Fecha(fechasV2[0]);
  }, [fechasV2, v2Fecha]);

  // Cerrar un camión de 2ª vuelta de UNA fecha de origen: registra SOLO ese camión (vuelta 2 →
  // patente en columna "2ª Vuelta"), genera su manifiesto y quita esas tiendas de las pendientes
  // de ESA fecha. Se registra bajo la FECHA DE ORIGEN (no "hoy") para rellenar la "Patente 2. Vuelta"
  // de la fila existente (upsert por fecha::cod) en vez de crear una fila nueva bajo hoy.
  function cerrarCamionV2(fecha: string, patente: string) {
    const stores = asignacionesV2[fecha]?.[patente] || [];
    if (!stores.length) return;
    const vehicle = flota.find(v => v.p === patente);
    if (!vehicle) return;
    const conductor = vehicle.ch || '';
    const grupoPorCod = (cod: string): Grupo | undefined =>
      (calTV2[norm(cod)]?.g ?? calT[norm(cod)]?.g) as Grupo | undefined;
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    // Todas las tiendas del camión son de ESTA fecha de origen (sub-pestaña activa).
    const porFecha = new Map<string, StoreItem[]>([[fecha, stores]]);
    const manifiestoRutas: Ruta[] = [];

    for (const [fechaReg, grupoStores] of porFecha) {
      const ruta: Ruta = {
        v: { ...vehicle, tlbd: true }, // TLBD → 2ª vuelta (patente a columna v2)
        ts: grupoStores,
        tp: grupoStores.reduce((s, t) => s + t.p, 0),
        tb: grupoStores.reduce((s, t) => s + t.b + (t.ch ?? 0), 0),
      };
      manifiestoRutas.push(ruta);

      // 1) despacho_rm / despacho_regiones: conductor/patente/ruta (vuelta 2) bajo la fecha ORIGEN
      const routingUpdates = grupoStores.map(t => ({
        cod: t.c, conductor, patente, transporte: vehicle.empresa || 'Luis Fica',
        ruta: '1', supervisor, vuelta: 2, pioneta_1: vehicle.p1 ?? null, pioneta_2: vehicle.p2 ?? null,
      }));
      const porTabla = splitRoutingPorTabla(routingUpdates, grupoPorCod);
      (['despacho_rm', 'despacho_regiones'] as const).forEach(table => {
        if (!porTabla[table].length) return;
        fetch('/api/despacho-records', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fecha: fechaReg, table, updates: porTabla[table] }),
        }).catch(e => console.error(`[v2 despacho-records ${table}]`, e));
      });

      // 2) Hojas DESPACHO RM/REGIONES (1 ruta) + pionetas — bajo la fecha ORIGEN
      void guardarDespachoSplitFn({ fecha: fechaReg, supervisor, rutas: [ruta], tiendas, grupoPorCod });
      actualizarPionetasRMFn({ fecha: fechaReg, rutas: [ruta] });

      // 3) CONTROL DESPACHO: patente en columna "2ª Vuelta" (tlbd=true) → upsert sobre la fila origen
      const fechaDDMM = fechaReg.split('-').reverse().join('/');
      const diaCD = DIAS[new Date(fechaReg + 'T12:00').getDay()];
      const rutasControl: RutaControl[] = [{ patente, tlbd: true, ts: grupoStores.map(t => ({ c: t.c, p: t.p, b: t.b, ch: t.ch ?? 0 })) }];
      const controlRows = buildControlRows(fechaDDMM, diaCD, rutasControl, [] as PendienteControl[]);
      if (controlRows.length) {
        fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sheet: 'CONTROL DESPACHO', rows: controlRows }) }).catch(e => console.error('[v2 control]', e));
      }

      // 4) HISTORIAL (marca vuelta 2) — bajo la fecha ORIGEN
      const histRow: (string | number)[] = [fechaDDMM, fechaTxt(fechaReg), supervisor, patente, conductor, '2', grupoStores.length, ruta.tp, ruta.tb, 0, grupoStores.map(t => t.c).join(', '), '1'];
      fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet: 'HISTORIAL', rows: [histRow] }) }).catch(e => console.error('[v2 historial]', e));
    }

    // 5) Quitar las despachadas SOLO de las pendientes de ESTA fecha (otras fechas de la misma
    //    tienda se conservan). Los códigos van tal cual están guardados, para casar en savePendientesV2.
    const despachados = new Set(stores.map(t => norm(t.c)));
    const codsFecha = new Set(
      pendientesV2Origen.filter(p => p.fechaOrigen === fecha && despachados.has(norm(p.c))).map(p => p.c),
    );
    if (codsFecha.size) void savePendientesV2(fecha, [], codsFecha);

    // 6) Limpiar estado local (solo el camión de esta fecha) + abrir manifiesto
    setAsignacionesV2(prev => {
      const n = { ...prev };
      const f = { ...(n[fecha] || {}) };
      delete f[patente];
      n[fecha] = f;
      return n;
    });
    setPendientesV2Origen(prev => prev.filter(p => !(p.fechaOrigen === fecha && despachados.has(norm(p.c)))));
    setManifiestoV2(manifiestoRutas);
  }

  // ── Fase B: postear el summary del día (INSERT en historial_despacho, primario) ──
  // Nota: /api/historial-despacho hace INSERT (append), NO upsert → hay que postearlo UNA sola
  // vez por día. Por eso el cierre por vehículo NO postea summary por camión (igual que V2), y
  // el summary del día se postea solo (a) en el registro global, o (b) al cerrar el ÚLTIMO camión.
  async function postSummaryDiaFn(rutas: Ruta[]): Promise<void> {
    const totalPallets = rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.p, 0), 0);
    const totalBultos  = rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.b + ((t as { ch?: number }).ch ?? 0), 0), 0);
    const totalTiendas = new Set(rutas.flatMap(r => r.ts.map(t => t.c))).size;
    const totalRutas   = rutas.length;
    const kmTotal      = Math.round((rutas.reduce((acc, r) => acc + (r._kmReal ?? 0), 0)) * 10) / 10;
    await fetch('/api/historial-despacho', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha, supervisor, totalTiendas, totalPallets, totalBultos, totalRutas, kmTotal,
        resumen: rutas.map(r => ({
          patente: r.v.p, conductor: r._choferAsignado || r.v.ch,
          tiendas: r.ts.map(t => t.c), pallets: r.tp, bultos: r.tb,
        })),
      }),
    });
  }

  // ── Fase B: Cerrar un camión de 1ª VUELTA (cierre por vehículo) ──────────────────
  // Registra SOLO ese camión (fecha del día, vuelta 1 → patente en columna v1), genera su
  // manifiesto y lo añade a `cerradasV1` (cross-device). NO postea el summary del día por
  // camión (append-only) salvo que con este cierre queden TODAS las rutas cerradas: en ese caso
  // postea el summary una vez y marca el día `rutas_reg` (igual que el registro global).
  // rutaOverride: para cerrar desde el board DESPACHO (sin "Calcular"), pasando la ruta armada
  // desde las asignaciones crudas. Sin override, usa la ruta ya calculada de `results`.
  function cerrarCamionV1(patente: string, rutaOverride?: Ruta) {
    if (isCerrada(cerradasV1, patente)) return; // ya cerrado → idempotente, no re-escribir
    const ruta = rutaOverride ?? results?.rutas.find(r => normPatente(r.v.p) === normPatente(patente));
    if (!ruta || ruta.ts.length === 0) return;

    const conductor = ruta._choferAsignado || ruta.v.ch || '';
    const empresa   = ruta.v.empresa || 'Luis Fica';
    const grupoPorCod = (cod: string): Grupo | undefined => calT[norm(cod)]?.g as Grupo | undefined;

    // 1) despacho_rm / despacho_regiones: conductor/patente/ruta (vuelta 1)
    const routingUpdates = ruta.ts.map(t => ({
      cod: t.c, conductor, patente, transporte: empresa,
      ruta: '1', supervisor, vuelta: 1, pioneta_1: ruta.v.p1 ?? null, pioneta_2: ruta.v.p2 ?? null,
    }));
    const porTabla = splitRoutingPorTabla(routingUpdates, grupoPorCod);
    (['despacho_rm', 'despacho_regiones'] as const).forEach(table => {
      if (!porTabla[table].length) return;
      fetch('/api/despacho-records', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, table, updates: porTabla[table] }),
      }).catch(e => console.error(`[v1 despacho-records ${table}]`, e));
    });

    // 2) Hojas DESPACHO RM/REGIONES (1 ruta) + pionetas
    void guardarDespachoSplitFn({ fecha, supervisor, rutas: [ruta], tiendas, grupoPorCod });
    actualizarPionetasRMFn({ fecha, rutas: [ruta] });

    // 3) CONTROL DESPACHO: patente en columna "1ª Vuelta" (tlbd=false)
    const fechaDDMM = fecha.split('-').reverse().join('/');
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaCD = DIAS[new Date(fecha + 'T12:00').getDay()];
    const rutasControl: RutaControl[] = [{ patente, tlbd: false, ts: ruta.ts.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (t as { ch?: number }).ch ?? 0 })) }];
    const controlRows = buildControlRows(fechaDDMM, diaCD, rutasControl, [] as PendienteControl[]);
    if (controlRows.length) {
      fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet: 'CONTROL DESPACHO', rows: controlRows }) }).catch(e => console.error('[v1 control]', e));
    }

    // 4) HISTORIAL (append, marca vuelta 1) — 1 fila para este camión
    const histRow: (string | number)[] = [fechaDDMM, fechaTxt(fecha), supervisor, patente, conductor, '1', ruta.ts.length, ruta.tp, ruta.tb, ruta._kmReal ?? 0, ruta.ts.map(t => t.c).join(', '), '1'];
    fetch('/api/sheets-write', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet: 'HISTORIAL', rows: [histRow] }) }).catch(e => console.error('[v1 historial]', e));

    // 5) Marcar la patente como cerrada (cross-device) y abrir su manifiesto
    const next = mergeCerradas(cerradasV1, [patente]);
    setCerradasV1(next);
    pushCerradasV1(next);
    setManifiestoV1([ruta]);

    // 6) Si con este cierre quedan TODAS las rutas cerradas → completar el día:
    //    postear summary (una vez) y marcar 'rutas_reg' (igual que el registro global).
    if (results && todasCerradas(results.rutas, next)) {
      void postSummaryDiaFn(results.rutas).catch(e => console.error('[v1 summary día]', e));
      void pushSessionState('rutas_reg', { at: new Date().toISOString(), supervisor, byVehiculo: true }, userId, fecha);
      setUnregisteredDays(prev => prev.filter(d => d !== fecha));
    }
  }

  // [Fase 3] Cierre por camión desde el board DESPACHO (1ª vuelta) SIN "Calcular": arma la ruta
  // desde las asignaciones crudas (manualAsignaciones) + nn (secuencia del manifiesto) y reutiliza
  // cerrarCamionV1 vía rutaOverride. Mismo modelo que cerrarCamionV2 (2ª vuelta). El "completar
  // día" se hace con "Listo por hoy" o el registro global.
  function cerrarCamionV1Board(patente: string) {
    const stores = manualAsignaciones[patente] || [];
    if (!stores.length) return;
    const vehicle = flota.find(v => normPatente(v.p) === normPatente(patente));
    if (!vehicle) return;
    const ordered = stores.length > 1 ? nn(stores, gps, cdRef.current) : stores;
    const ruta: Ruta = {
      v: vehicle,
      ts: ordered,
      tp: ordered.reduce((s, t) => s + t.p, 0),
      tb: ordered.reduce((s, t) => s + t.b + ((t as { ch?: number }).ch ?? 0), 0),
    };
    cerrarCamionV1(patente, ruta);
    // NOTA: el "leftover → 2ª vuelta" NO se hace aquí (en cada cierre de camión) porque mandaba a
    // 2ª vuelta todo lo que aún no se había asignado a los OTROS camiones, cortando el flujo. Se
    // hace una sola vez al cerrar la jornada ("Listo por hoy", ver handleListoPorHoy).
  }

  // [Cerrar en masa] Marca/desmarca una patente para cerrar en grupo.
  const toggleCerrarSel = (patente: string) => setCerrarSel(prev => {
    const next = new Set(prev);
    if (next.has(patente)) next.delete(patente); else next.add(patente);
    return next;
  });
  // Cierra todos los camiones seleccionados de una (cerrarCamionV1Board ya es idempotente; los que
  // no tienen tiendas o exceden capacidad simplemente no se cierran adentro).
  const cerrarVariosCamiones = (patentes: string[]) => {
    patentes.forEach(p => cerrarCamionV1Board(p));
    setCerrarSel(new Set());
  };

  // [Cerrar en masa] al cambiar de fecha, limpiar la selección de camiones para cerrar.
  useEffect(() => { setCerrarSel(new Set()); }, [fecha]);

  // ── Cierre de jornada: marca "listo por hoy" cross-device ─────────
  useEffect(() => {
    setCerrado(false);
    void (async () => {
      try {
        const { data } = await supabase
          .from('shared_session_state')
          .select('state')
          .eq('fecha', fecha)
          .eq('fuente', 'cierre')
          .maybeSingle();
        if (data?.state) setCerrado(true);
      } catch {}
    })();
  }, [fecha]);

  function handleListoPorHoy() {
    // Al cerrar la JORNADA (no en cada camión), lo que quedó SIN asignar a ningún camión pasa a
    // pendiente de 2ª vuelta — así no se pierde, pero sin cortar el flujo de asignación mientras
    // todavía estás cerrando camiones.
    const { leftover, asignadas } = poolPendiente(calT, manualAsignaciones);
    if (leftover.length) void savePendientesV2(fecha, leftover, asignadas);
    const payload = { closedAt: new Date().toISOString(), by: supervisor || '' };
    setCerrado(true);
    supabase
      .from('shared_session_state')
      .upsert({ fecha, fuente: 'cierre', state: payload }, { onConflict: 'fecha,fuente' })
      .then(({ error }) => { if (error) console.error('[cierre-jornada]', error.message); });
  }

  // ── Extra stops helpers ───────────────────────────────────────────
  function buildExtendidos(baseGps: Record<string, number[]>, baseTiendas: Record<string, TiendaInfo>) {
    const extGps     = { ...baseGps };
    const extTiendas: Record<string, TiendaInfo & { _parada?: boolean; _tipo?: string; _desc?: string }> = { ...baseTiendas };
    paradasAdicionales.filter(p => p.gps).forEach(p => {
      extGps[p.id] = p.gps;
      extTiendas[p.id] = { n: p.direccion, z: p.tipo === 'entrega' ? 'Entrega' : 'Retiro', v: '', _parada: true, _tipo: p.tipo, _desc: p.descripcion };
    });
    return { extGps, extTiendas };
  }

  // [Enrutador V2] Enruta un pool con el motor geográfico nuevo (o cae a asignar() con el flag
  // apagado). Devuelve { rutas, fueraDeRadio, avisos }. enrutarV2 recibe el pool COMPLETO y hace
  // el triage de radio RM solo — NO hay que filtrarle las tiendas lejanas antes.
  const enrutar = (pool: StoreItem[], egps: Record<string, number[]>, etiendas: Record<string, TiendaInfo>): ResultadoEnrutador =>
    ENRUTADOR_V2
      ? enrutarV2(pool, flota, egps, cdRef.current, etiendas)
      : { rutas: asignar(pool, flota, egps, cdRef.current, null, null, null, etiendas, false), fueraDeRadio: [], avisos: [] };

  // ── Calculate routes (modo MANUAL) ───────────────────────────────
  // Nota: el tab CALCULAR fue eliminado; este handler sólo se activa desde el modo MANUAL.
  function handleCalcular() {
    const errs: string[] = [];
    const tx = manualText.trim();
    if (!tx) { setErrors(['Ingresa al menos una tienda.']); return; }
    const r = parseManual(tx);
    let ts: StoreItem[] = r.ts; errs.push(...r.errs);

    if (errs.length) setErrors(errs); else setErrors([]);
    if (!ts.length) { setErrors(prev => [...prev, 'No hay tiendas válidas.']); return; }

    const { extGps, extTiendas } = buildExtendidos(gps, tiendas);
    paradasAdicionales.filter(p => p.gps).forEach(p => ts.push({ c: p.id, p: p.p, b: p.b }));

    const { rutas, avisos } = enrutar(ts, extGps, extTiendas);
    if (avisos.length) setErrors(prev => [...prev, ...avisos]);
    setResults({ ts, rutas, extGps, extTiendas });
    kmTotalRealRef.current = null;
    setKmPorRuta({}); setLegDataPorRuta({});

    // Guardar tiendas sin asignar para segunda vuelta (cross-device via Supabase, keyed by fecha dispatch)
    const asignadas = new Set(rutas.flatMap(r => r.ts.map(t => t.c)));
    const noAsignadas = ts.filter(t => !asignadas.has(t.c) && !t.c.startsWith('_P'));
    const pendV2 = noAsignadas.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (calT[t.c]?.ch ?? 0) }));
    void savePendientesV2(fecha, pendV2, asignadas);
  }

  // ── Calculate manual routes ───────────────────────────────────────
  // ── IA: helpers compartidos (asignación por IA para el tablero y para la comparación) ────────
  // Payload para /api/asignar-ia: tiendas activas con carga, camiones disponibles (no-2ªvuelta) y la
  // referencia por cercanía GPS del optimizador (cómputo local, gratis; pista no obligatoria).
  function construirPayloadIA(): { stores: IAStore[]; trucks: IATruck[]; gpsRef?: Record<string, string[]> } {
    // [PASO 2] Pool con los CUATRO tipos: contenedores (calT[c].c) suman a p (ocupan piso como un
    // pallet), chocolates van en ch. El filtro incluye tiendas de solo cont./choc. (antes se perdían).
    const stores: IAStore[] = Object.keys(calT)
      .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0 || (calT[c].c ?? 0) > 0 || (calT[c].ch ?? 0) > 0))
      .map(c => ({ cod: c, p: calT[c].p + (calT[c].c ?? 0), b: calT[c].b, ch: calT[c].ch ?? 0, zona: tiendas[c]?.z || tiendas[c]?.corredor || '' }));
    const trucks: IATruck[] = flota
      .filter(v => v.on && !v.tlbd)
      .map(v => ({ patente: v.p, tipo: v.t, capP: v.c, capB: v.b, refrigerado: !!v.refrigerado, porton: !!v.porton }));

    let gpsRef: Record<string, string[]> | undefined;
    try {
      const { extGps, extTiendas } = buildExtendidos(gps, tiendas);
      const items: StoreItem[] = stores.map(s => ({ c: s.cod, p: s.p, b: s.b, ch: s.ch }));
      const gpsRutas = enrutar(items, extGps, extTiendas).rutas;
      const truckSet = new Set(trucks.map(t => t.patente));
      const ref: Record<string, string[]> = {};
      gpsRutas.forEach(r => { if (r.ts.length && truckSet.has(r.v.p)) ref[r.v.p] = r.ts.map(t => t.c); });
      gpsRef = Object.keys(ref).length ? ref : undefined;
    } catch { gpsRef = undefined; }

    return { stores, trucks, gpsRef };
  }

  // Llama a la IA y devuelve la propuesta (patente→tiendas). Lanza si la API falla.
  async function solicitarAsignacionIA(
    payload: { stores: IAStore[]; trucks: IATruck[]; gpsRef?: Record<string, string[]> },
  ): Promise<{ asignaciones: Record<string, StoreItem[]>; warnings: string[] }> {
    const res  = await fetch('/api/asignar-ia', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, ...payload }),
    });
    const json = await res.json() as { asignaciones?: Record<string, StoreItem[]>; warnings?: string[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? `error ${res.status}`);
    return { asignaciones: json.asignaciones ?? {}, warnings: json.warnings ?? [] };
  }

  function handleCalcularManual() {
    const { extGps, extTiendas } = buildExtendidos(gps, tiendas);

    // [PASO 2] Pool con los cuatro tipos (contenedores suman a p, chocolates en ch, incluye tiendas
    // de solo cont./choc.) — antes armaba {c,p,b} y perdía contenedores y chocolates.
    const tiendasActivas = poolDesdeCalT(calT);

    const paradasItems = paradasAdicionales.filter(p => p.gps).map(p => ({ c: p.id, p: p.p, b: p.b }));
    const allItems     = [...tiendasActivas, ...paradasItems];

    const manualRutas   = rutasDesdeAsignaciones(manualAsignaciones, flota, extGps, cdRef.current, extTiendas);
    const rebalanceadas = rebalanceIfOver(manualRutas, extGps, extTiendas);

    // Columna alternativa: se muestra YA con el optimizador GPS (síncrono) y, en segundo plano, se
    // consulta la IA para reemplazarla. Si la IA falla o tarda, queda el GPS con aviso — el usuario
    // siempre sabe qué motor ve (etiqueta "Ruta IA" 🤖 vs "Ruta Óptima (GPS)" 🗺️ + aviso de caída).
    // Los avisos del motor (tiendas fuera del radio RM, sin coordenadas, camión sobrecargado) se
    // muestran ACÁ, al calcular. Antes se descartaban en esta rama y la tienda desaparecía de la
    // propuesta sin explicación: recién se enteraba al registrar, y sin el motivo.
    const { rutas: gpsRutas, avisos } = enrutar(allItems, extGps, extTiendas);
    if (avisos.length) setErrors(avisos);
    const token    = ++comparacionTokenRef.current;
    const payload  = construirPayloadIA();
    const usaIA    = payload.stores.length > 0 && payload.trucks.length > 0;

    setComparisonData({
      manual: rebalanceadas, optima: gpsRutas, ts: allItems, extGps, extTiendas,
      rebalanceada: rebalanceadas !== manualRutas,
      fuenteAlt: 'gps', iaCargando: usaIA,
    });
    if (!usaIA) return;

    void (async () => {
      try {
        const { asignaciones } = await solicitarAsignacionIA(payload);
        if (comparacionTokenRef.current !== token) return; // llegó una comparación más nueva
        const iaRutas = rutasDesdeAsignaciones(asignaciones, flota, extGps, cdRef.current, extTiendas);
        if (!iaRutas.length) {
          setComparisonData(prev => prev ? { ...prev, iaCargando: false, iaError: 'La IA no devolvió asignaciones' } : prev);
          return;
        }
        setComparisonData(prev => prev ? { ...prev, optima: iaRutas, fuenteAlt: 'ia', iaCargando: false, iaError: undefined } : prev);
      } catch (e) {
        if (comparacionTokenRef.current !== token) return;
        const msg = e instanceof Error ? e.message : 'IA no disponible';
        setComparisonData(prev => prev ? { ...prev, iaCargando: false, iaError: msg } : prev);
      }
    })();
  }

  // ── [E4·4b] Auto-asignación por CLUSTERS históricos (instantánea, local, sin LLM) ─────
  // Carga los clusters una vez al montar. `autoAsignar` arma el pool del día y llena el tablero
  // replicando las "líneas" históricas (asignarPorClusters). El botón "Asignar" lo re-genera;
  // el efecto de más abajo lo dispara SOLO con el tablero vacío (nunca pisa lo que ya se tocó).
  useEffect(() => {
    let cancel = false;
    fetch('/api/rutas-clusters')
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (!cancel && j?.clusterDeTienda) setClusters({ clusterDeTienda: j.clusterDeTienda, centroides: j.centroides ?? {} }); })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  const autoAsignar = () => {
    const cl = clustersRef.current;
    if (!cl) { setErrors(['Aún cargando los patrones históricos de ruta — probá de nuevo en un segundo.']); return; }
    const stores: StoreItem[] = Object.keys(calT)
      .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0 || (calT[c].ch ?? 0) > 0))
      .map(c => ({ c, p: calT[c].p, b: calT[c].b, ch: calT[c].ch ?? 0 }));
    if (!stores.length) { setErrors(['No hay tiendas con carga para asignar.']); return; }
    if (!flota.some(v => v.on && !v.tlbd)) { setErrors(['No hay camiones activos para asignar.']); return; }
    const { extGps, extTiendas } = buildExtendidos(gps, tiendas);
    const asig = asignarPorClusters(stores, flota, cl.clusterDeTienda, cl.centroides, extGps, extTiendas);
    setManualAsignaciones(asig);
    setErrors([]);
  };
  const autoAsignarRef = useRef(autoAsignar);
  autoAsignarRef.current = autoAsignar;

  // Dispara la auto-asignación cuando hay pool + camiones activos y el tablero está VACÍO. El
  // debounce deja "asentar" varias activaciones seguidas (asigna con TODOS los camiones activos).
  const poolSig   = useMemo(() => Object.keys(calT).filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0 || (calT[c].ch ?? 0) > 0)).sort().join(','), [calT]);
  const trucksSig = useMemo(() => flota.filter(v => v.on && !v.tlbd).map(v => v.p).sort().join(','), [flota]);
  const boardEmpty = Object.keys(manualAsignaciones).length === 0;
  useEffect(() => {
    if (!clusters || !boardEmpty || !poolSig || !trucksSig) return;
    const t = setTimeout(() => autoAsignarRef.current(), 1000);
    return () => clearTimeout(t);
  }, [clusters, boardEmpty, poolSig, trucksSig]);

  // [E4·4c] Fase actual del Enrutador para el indicador visible (Pool→Asignado→Revisar→Registrar→Cierre).
  const faseInfo = useMemo(() => {
    const poolCount = Object.keys(calT).filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0 || (calT[c].ch ?? 0) > 0)).length;
    const asignadas = new Set(Object.values(manualAsignaciones).flat().map(s => s.c));
    const camionesConAsig = Object.values(manualAsignaciones).filter(a => a.length > 0).length;
    return faseEnrutador({ poolCount, asignadasCount: asignadas.size, camionesConAsig, cerradasCount: cerradasV1.size, diaCerrado: cerrado });
  }, [calT, manualAsignaciones, cerradasV1, cerrado]);

  // [E4·4b] El botón "Asignar" del tablero ahora usa el motor por clusters históricos
  // (autoAsignar, instantáneo). El asistente LLM (construirPayloadIA/solicitarAsignacionIA)
  // queda como columna alternativa opcional en "Calcular" (handleCalcularManual); su botón
  // dedicado se retiró porque el historial mostró que nunca se usaba (42/42 "mía").

  function rebalanceIfOver(manualRutas: Ruta[], gpsMap: Record<string, number[]>, tiendasData: Record<string, TiendaInfo>): Ruta[] {
    const over = manualRutas.filter(r => r.tp > r.v.c);
    if (!over.length) return manualRutas;

    const result = manualRutas.map(r => ({ ...r, ts: [...r.ts] }));
    const disp   = flota.filter(v => v.on);

    over.forEach(ruta => {
      const excedente = ruta.ts.filter(t => t.p > ruta.v.c);
      excedente.forEach(t => {
        ruta.ts = ruta.ts.filter(x => x.c !== t.c);
        ruta.tp -= t.p; ruta.tb -= t.b;
      });

      const capRestante = ruta.v.c - ruta.tp;
      if (capRestante > 0) {
        ruta.ts = ruta.ts.filter(x => x.p <= capRestante);
        ruta.tp = ruta.ts.reduce((s, x) => s + x.p, 0);
        ruta.tb = ruta.ts.reduce((s, x) => s + x.b, 0);
      }

      excedente.forEach(x => {
        const cands = disp
          .filter(v => v.p !== ruta.v.p && v.c >= x.p)
          .map(v => ({ v, usedP: (result.find(r2 => r2.v.p === v.p)?.tp) || 0 }))
          .filter(c => c.usedP + x.p <= c.v.c)
          .sort((a, b) => (a.usedP / a.v.c) - (b.usedP / b.v.c));

        if (cands.length) {
          const dest    = result.find(r2 => r2.v.p === cands[0].v.p)!;
          const enriched: StoreItem = { ...x, _v: tiendasData[x.c]?.v || '' };
          if (dest.ts.length > 1) dest.ts = nn([...dest.ts, enriched], gpsMap, cdRef.current);
          else dest.ts.push(enriched);
          dest.tp += x.p; dest.tb += x.b + ((x as { ch?: number }).ch ?? 0);
        }
      });
    });

    return result.filter(r => r.ts.length > 0);
  }

  // ── Extra stops ───────────────────────────────────────────────────
  function handleOpenParadas()  { setParadasOpen(true);  document.body.style.overflow = 'hidden'; }
  function handleCloseParadas() { setParadasOpen(false); document.body.style.overflow = ''; }
  function handleAgregarParada(parada: Omit<Parada, 'id'>) {
    paradaCounter.current++;
    setParadasAdicionales(prev => [...prev, { ...parada, id: `_P${paradaCounter.current}` }]);
  }
  function handleEliminarParada(id: string) {
    setParadasAdicionales(prev => prev.filter(p => p.id !== id));
    setManualAsignaciones(prev => {
      const next: Record<string, StoreItem[]> = {};
      Object.keys(prev).forEach(plate => { next[plate] = prev[plate].filter(s => s.c !== id); });
      return next;
    });
  }
  function handleUsarRuta(rutas: Ruta[], ts: StoreItem[], elegida: 'mia' | 'ia' | 'gps') {
    // [Fase 4 PR-C] Feedback IA: guarda qué propuso la IA (si la hubo), la asignación final y cuál
    // se eligió → corpus de aprendizaje. Fire-and-forget: no debe bloquear ni romper el "usar ruta".
    const comp = comparisonData;
    if (comp) {
      const final        = rutasAAsignacion(rutas);
      const propuesta_ia = comp.fuenteAlt === 'ia' ? rutasAAsignacion(comp.optima) : null;
      const edit_count   = contarEdiciones(propuesta_ia, final);
      fetch('/api/ia-feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, fuente: 'despacho', propuesta_ia, final, elegida, edit_count, supervisor }),
      }).catch(e => console.error('[ia-feedback]', e));
    }
    setResults({
      ts, rutas,
      extGps:     comparisonData?.extGps,
      extTiendas: comparisonData?.extTiendas,
    });
    setComparisonData(null);
    kmTotalRealRef.current = null;
    setKmPorRuta({}); setLegDataPorRuta({});
  }
  function handleVolverEditar() { setComparisonData(null); }

  // ── Clean ─────────────────────────────────────────────────────────
  function handleLimpiar() {
    setResults(null); setErrors([]); setManualText(''); setManualAsignaciones({});
    setComparisonData(null); setParadasAdicionales([]); kmTotalRealRef.current = null;
    setKmPorRuta({}); setLegDataPorRuta({});
    setCamionSeleccionado(null);
    setHistorialMsg(''); setHistorialStatus('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Volver a edición (keeps paradas and calT) ──────────────────────
  function handleVolverAEdicion() {
    setResults(null); setComparisonData(null);
    setHistorialMsg(''); setHistorialStatus('idle');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── PDF ───────────────────────────────────────────────────────────
  function handleGenerarPDF() { setTimeout(() => window.print(), 100); }

  // ── Preview de ruta al elegir un camión en el tablero DESPACHO (antes de "Calcular") ──
  // Mismo patrón que cerrarCamionV1Board: arma UN Ruta con nn() a partir de lo ya asignado.
  const previewRutas = useMemo<Ruta[]>(() => {
    if (!camionSeleccionado) return [];
    const vehicle = flota.find(v => v.p === camionSeleccionado);
    const stores  = manualAsignaciones[camionSeleccionado] || [];
    if (!vehicle || !stores.length) return [];
    const { extGps } = buildExtendidos(gps, tiendas);
    const ordered = stores.length > 1 ? nn(stores, extGps, cdRef.current) : stores;
    return [{
      v: vehicle,
      ts: ordered,
      tp: ordered.reduce((s, t) => s + t.p, 0),
      tb: ordered.reduce((s, t) => s + t.b + ((t as { ch?: number }).ch ?? 0), 0),
    }];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camionSeleccionado, manualAsignaciones, flota, gps, tiendas]);

  // Al elegir otro camión (o deseleccionar), el km real anterior queda obsoleto hasta
  // que el mapa resuelva la nueva ruta.
  useEffect(() => { setPreviewKm(null); }, [camionSeleccionado]);

  // ── Mapa persistente: km real + detalle por tramo (movido desde ResultsSection,
  //    que antes montaba su propio MapSection — ver DespachoHeader/MapSection en el render) ──
  function handleKmReady(kmMap: Record<number, number>, legMap: Record<number, {dist: string; dur: string; durSec?: number}[]>) {
    if (modo === 'plan') {
      // Modo Planificador: no hay `results`; guardar el km real + tramos por índice de ruta.
      setPlanLegsByRoute(legMap ?? {});
      setPlanKmByRoute(kmMap ?? {});
      return;
    }
    if (!results) {
      // Preview de camión seleccionado (sin "Calcular" todavía): no toca kmPorRuta/
      // legDataPorRuta (esos se leen por índice en ResultsSection, son de resultados ya
      // calculados) — solo guarda el km real de esa única ruta para mostrarlo en su tarjeta.
      setPreviewKm(camionSeleccionado && previewRutas.length ? (kmMap[0] ?? null) : null);
      return;
    }
    setKmPorRuta(kmMap);
    setLegDataPorRuta(legMap || {});
    const total = Object.values(kmMap).reduce((s, v) => s + v, 0);
    kmTotalRealRef.current = Math.round(total * 10) / 10;
    results.rutas.forEach((r, ri) => { if (kmMap[ri] !== undefined) r._kmReal = kmMap[ri]; });
  }

  // ── Update from Sheets (Authenticated) ───────────────────────────
  async function handleActualizarDatos() {
    setUpdateStatus('loading');
    try {
      const [t1, t2, t3] = await Promise.all([
        fetchAuthenticatedSheet('TIENDAS'),
        fetchAuthenticatedSheet('FLOTA'),
        fetchAuthenticatedSheet('CALENDARIO'),
      ]);
      const newTiendas = { ...tiendas };
      const newGps     = { ...gps };
      // F3: la lista de vehículos es la de /api/flota (fuente de verdad, solo activo=true), NO el
      // closure (FLOTA_INICIAL re-introducía vehículos ya borrados, p. ej. SPJP88). Sheets solo
      // actualiza campos/pionetas sobre esa base; los borrados no vuelven.
      const flotaResp = await fetch('/api/flota').then(r => (r.ok ? r.json() : null)).catch(() => null) as { flota?: Vehiculo[] } | null;
      const baseFlota  = (flotaResp?.flota && flotaResp.flota.length > 0) ? flotaResp.flota : flota;
      const newFlota   = baseFlota.map(v => ({ ...v }));
      if (t1?.values) parseTSheetAuth(t1.values, newTiendas, newGps);
      if (t2?.values) parseFSheetAuth(t2.values, newFlota);
      if (t3?.values) {
        const sheetsCal = parseCalendarioAuth(t3.values);
        if (sheetsCal) {
          // Re-order Sheets data to match the Calendario de Abastecimiento order from localStorage
          let newCal = sheetsCal;
          try {
            if (typeof window !== 'undefined') {
              const lsRaw = localStorage.getItem('_calCentral');
              if (lsRaw) {
                const { cal: lsCal } = JSON.parse(lsRaw) as { cal: CalRecord; ts: number };
                const ordered: CalRecord = {};
                ['LU','MA','MI','JU','VI','SA'].forEach(dia => {
                  ordered[dia] = { rm: [], costa: [], fal: [] };
                  (['rm','costa','fal'] as const).forEach(grp => {
                    const sheetsSet = new Set(sheetsCal[dia]?.[grp] || []);
                    // First: stores in Calendario de Abastecimiento order (if also in Sheets)
                    (lsCal[dia]?.[grp] || []).forEach(c => {
                      if (sheetsSet.has(c)) { ordered[dia][grp].push(c); sheetsSet.delete(c); }
                    });
                    // Then: any remaining in Sheets not yet in the Calendario de Abastecimiento
                    sheetsSet.forEach(c => ordered[dia][grp].push(c));
                  });
                });
                newCal = ordered;
              }
            }
          } catch {}
          setCal(newCal);
          setCalT(prev => mergeCalT(newCal, fecha, prev, grpsRef.current));
        }
      }
      setTiendas(newTiendas); setGps(newGps);
      // Preservar el estado "en servicio" (on) que ya está en memoria/Supabase: la carga de Sheets
      // NO debe resetear qué camiones dejó activos el coordinador (persistencia + cross-device).
      setFlota(prev => {
        const onByPat = new Map(prev.map(v => [v.p.toUpperCase(), v.on]));
        return newFlota.map(v => ({ ...v, on: onByPat.get(v.p.toUpperCase()) ?? v.on }));
      });
      setUpdateStatus('success');
      setTimeout(() => setUpdateStatus('idle'), 3000);
    } catch (e) {
      console.error('Error actualizando:', e);
      setUpdateStatus('error');
      setTimeout(() => setUpdateStatus('idle'), 4000);
    }
  }

  // ── Save fleet ────────────────────────────────────────────────────
  function handleGuardarFlota() {
    setFlotaStatus('saving');
    fetch('/api/flota/export-sheets', { method: 'POST' })
      .then(r => { if (!r.ok) throw new Error('Error sincronizando Sheets'); setFlotaStatus('success'); setTimeout(() => setFlotaStatus('idle'), 3000); })
      .catch(e => { console.error('[handleGuardarFlota]', e); setFlotaStatus('error'); setTimeout(() => setFlotaStatus('idle'), 4000); });
  }

  // ── Save history ──────────────────────────────────────────────────
  async function handleGuardarHistorial(): Promise<boolean> {
    if (!results) { setHistorialStatus('warn'); setHistorialMsg('⚠️ No hay rutas calculadas.'); return false; }

    // Guard: tiendas armadas en Bodega (con carga) que NO quedaron en ninguna ruta se perderían del
    // registro EN SILENCIO (fue lo que pasó con 02SCL/05LP/30PHU/56PZA el 04/08 y de nuevo el 10/08
    // con PHU/NUC/LP). Pasa cuando se arma una tienda en Bodega DESPUÉS del último "Calcular": queda
    // en calT (en vivo) pero no en results.ts (foto congelada al calcular). Avisamos antes de
    // guardar para que el usuario las asigne, o confirme registrar el resto de todos modos.
    const sinRutear = tiendasArmadasSinRutear(calT, results.rutas);
    if (sinRutear.length > 0 && typeof window !== 'undefined') {
      const ok = window.confirm(
        `⚠️ ${sinRutear.length} tienda(s) tienen carga en Bodega pero NO están en ninguna ruta, ` +
        `así que NO se registrarán:\n\n${sinRutear.join(', ')}\n\n` +
        `Quedarán guardadas como pendientes de 2ª vuelta. Asígnalas a un camión primero, ` +
        `o presiona Aceptar para registrar el resto y dejarlas pendientes.`
      );
      if (!ok) {
        setHistorialStatus('warn');
        setHistorialMsg(`⚠️ Registro cancelado · ${sinRutear.length} tienda(s) sin asignar: ${sinRutear.join(', ')}`);
        return false;
      }
      // [Fix fuga de datos] Antes, si se confirmaba igual, estas tiendas no se guardaban (correcto,
      // no rutearon) pero TAMPOCO entraban a pendientes 2ª vuelta —desaparecían sin dejar rastro—
      // porque ese cálculo (más abajo) usa results.ts, la misma foto congelada que este guard ya
      // detectó como desactualizada. Las mandamos a pendientes aquí, con los datos en vivo de calT.
      const asignadasActuales = new Set(results.rutas.flatMap(r => r.ts.map(t => t.c)));
      const sinRutearStores = sinRutear.map(c => ({
        c, p: calT[c]?.p ?? 0, b: calT[c]?.b ?? 0, ch: calT[c]?.ch ?? 0,
      }));
      void savePendientesV2(fecha, sinRutearStores, asignadasActuales);
    }

    setHistorialStatus('loading');
    setHistorialMsg('');

    const totalPallets = results.rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.p, 0), 0);
    const totalBultos  = results.rutas.reduce((acc, r) => acc + r.ts.reduce((a, t) => a + t.b + ((t as { ch?: number }).ch ?? 0), 0), 0);
    const totalTiendas = new Set(results.rutas.flatMap(r => r.ts.map(t => t.c))).size;
    const totalRutas   = results.rutas.length;
    const kmTotal      = Math.round((results.rutas.reduce((acc, r) => acc + (r._kmReal ?? 0), 0)) * 10) / 10;

    // 1. PRIMARY: guardar en Supabase — de aquí viene el feedback al usuario
    try {
      const res = await fetch('/api/historial-despacho', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha, supervisor, totalTiendas, totalPallets, totalBultos, totalRutas, kmTotal,
          resumen: results.rutas.map(r => ({
            patente:   r.v.p,
            conductor: r._choferAsignado || r.v.ch,
            tiendas:   r.ts.map(t => t.c),
            pallets:   r.tp,
            bultos:    r.tb,
          })),
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);

      setHistorialMsg(`✓ Guardado · ${fecha} · ${totalTiendas} tiendas · ${totalPallets}P+${totalBultos}B · ${kmTotal}km`);
      setHistorialStatus('success');
      try { localStorage.removeItem('despacho_pendientes'); } catch {}
      setPendientes(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setHistorialMsg(`⚠️ Error guardando: ${msg}`);
      setHistorialStatus('error');
      return false; // No continuar con las sincronizaciones secundarias si Supabase falló
    }

    // Fase B: para las escrituras append-only / de registro por camión, SALTAR las rutas cuyas
    // patentes ya se cerraron individualmente (cerradasV1) — así el global no DUPLICA en HISTORIAL
    // (append-only) ni re-registra lo ya cerrado. El summary del día (arriba) sí incluye TODO.
    const rutasReg = rutasNoCerradas(results.rutas, cerradasV1);

    // 2. SECONDARY (fire-and-forget): actualiza conductor/ruta en despacho_rm y picking_pallets
    const routingUpdates = rutasReg.flatMap((ruta, ri) => {
      const conductor = ruta._choferAsignado || ruta.v.ch || '';
      const patente   = ruta.v.p;
      const empresa   = ruta.v.empresa || 'Luis Fica';
      const rutaNum   = String(ri + 1);
      const vuelta    = ruta.v.tlbd ? 2 : 1;
      const pioneta_1 = ruta.v.p1 ?? null;
      const pioneta_2 = ruta.v.p2 ?? null;
      return ruta.ts.map(ts => ({ cod: ts.c, conductor, patente, transporte: empresa, ruta: rutaNum, supervisor, vuelta, pioneta_1, pioneta_2 }));
    });
    // #9: separar por grupo → RM/Costa a despacho_rm, Regiones a despacho_regiones
    // (antes todo iba a despacho_rm y la patente de Regiones se perdía).
    const porTabla = splitRoutingPorTabla(routingUpdates, c => calT[c]?.g as Grupo | undefined);
    (['despacho_rm', 'despacho_regiones'] as const).forEach(table => {
      const updates = porTabla[table];
      if (updates.length === 0) return;
      fetch('/api/despacho-records', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fecha, table, updates }),
      }).catch(e => console.error(`[despacho-records PATCH ${table}]`, e));
    });

    // 3. SECONDARY: sincroniza DESPACHO RM y DESPACHO REGIONES en Sheets. Si alguna tienda
    //    ruteada no tenía fila de Bodega, el server la AGREGA y devuelve su cod → avisamos
    //    (antes esas tiendas se perdían en silencio, ej. 56PZA).
    if (rutasReg.length > 0) {
      actualizarPionetasRMFn({ fecha, rutas: rutasReg });
      guardarDespachoSplitFn({ fecha, supervisor, rutas: rutasReg, tiendas, grupoPorCod: c => calT[c]?.g as Grupo | undefined })
        .then(appended => {
          if (appended.length > 0) {
            const uniq = [...new Set(appended)];
            setHistorialMsg(`✓ Guardado · ⚠ ${uniq.length} tienda${uniq.length !== 1 ? 's' : ''} sin datos de Bodega se registró solo con ruteo: ${uniq.join(', ')}`);
            setHistorialStatus('warn');
          }
        })
        .catch(e => console.error('[guardarDespachoSplit]', e));
    }

    // 4. SECONDARY (fire-and-forget): escribe en HISTORIAL de Google Sheets directamente
    const fechaDDMM = fecha.split('-').reverse().join('/'); // YYYY-MM-DD → DD/MM/YYYY
    const fechaLeg  = fechaTxt(fecha);
    // Solo las rutas NO cerradas individualmente (evita duplicar en HISTORIAL, append-only).
    const historialRows: (string | number)[][] = rutasReg.map((r, ri) => [
      fechaDDMM,
      fechaLeg,
      supervisor,
      r.v.p,
      r._choferAsignado || r.v.ch || '',
      r.v.tlbd ? '2' : '1',
      r.ts.length,
      r.tp,
      r.tb,
      r._kmReal ?? 0,
      r.ts.map(t => t.c).join(', '),
      String(ri + 1),
    ]);
    if (historialRows.length > 0) {
      fetch('/api/sheets-write', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sheet: 'HISTORIAL', rows: historialRows }),
      }).catch(e => console.error('[historial-sheets]', e));
    }

    // 5. SECONDARY (fire-and-forget): escribe en CONTROL DESPACHO (upsert por fecha::cod).
    // #9: las pendientes (lo NO ruteado) se calculan AQUÍ desde results.ts − results.rutas, así
    // funciona sin importar el modo (auto/manual/arrastrar). Antes solo se poblaban en modo 'cal',
    // por eso al asignar arrastrando no aparecían en CONTROL DESPACHO ni se guardaban.
    const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const diaCD = DIAS[new Date(fecha + 'T12:00').getDay()];
    const asignadasReg = new Set(results.rutas.flatMap(r => r.ts.map(t => t.c)));
    const pendientesReg = results.ts
      .filter(t => !asignadasReg.has(t.c) && !t.c.startsWith('_P'))
      .map(t => ({ c: t.c, p: t.p, b: t.b, ch: (calT[t.c]?.ch ?? (t as { ch?: number }).ch ?? 0) }));
    // Solo las rutas NO cerradas individualmente (las cerradas ya escribieron su fila en CONTROL;
    // upsert-by-cod es idempotente, pero saltarlas mantiene consistencia con HISTORIAL).
    const rutasControl: RutaControl[] = rutasReg.map(ruta => ({
      patente: ruta.v.p,
      tlbd:    !!ruta.v.tlbd,
      ts:      ruta.ts.map(t => ({ c: t.c, p: t.p, b: t.b, ch: (t as { ch?: number }).ch ?? 0 })),
    }));
    const pendientesControl: PendienteControl[] = pendientesReg.map(s => ({ c: s.c, p: s.p, b: s.b, ch: s.ch }));
    const controlRows = buildControlRows(fechaDDMM, diaCD, rutasControl, pendientesControl);
    if (controlRows.length > 0) {
      fetch('/api/sheets-write', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sheet: 'CONTROL DESPACHO', rows: controlRows }),
      }).catch(e => console.error('[control-despacho]', e));
    }

    // 6. Guardar las pendientes de 2ª vuelta (cross-device, keyed by fecha) — lo NO ruteado.
    //    Acumula con las previas y quita las que se asignaron en esta ronda (no sobrescribe).
    void savePendientesV2(fecha, pendientesReg, asignadasReg);

    // 7. Marca este día como REGISTRADO → apaga el aviso de "sin registrar" para esta fecha.
    void pushSessionState('rutas_reg', { at: new Date().toISOString(), supervisor }, userId, fecha);
    setUnregisteredDays(prev => prev.filter(d => d !== fecha));

    return true; // guardado primario OK → habilita encadenar con manifiestos
  }

  const isMobile = useIsMobile();
  // [E4·A5] En DESPACHO sin `results` (flujo auto-asignar, sin "Calcular"), dibujar TODAS las
  // rutas asignadas en vivo desde `manualAsignaciones` — no solo la del camión seleccionado.
  const dragLive = (modo === 'drag' && !results && Object.keys(manualAsignaciones).length > 0)
    ? (() => {
        const { extGps, extTiendas } = buildExtendidos(gps, tiendas);
        return { rutas: rutasDesdeAsignaciones(manualAsignaciones, flota, extGps, cdRef.current, extTiendas), extGps, extTiendas };
      })()
    : null;

  const mapPanel = (
    <MapSection
      rutas={modo === 'plan' ? planRutas : (results?.rutas ?? dragLive?.rutas ?? previewRutas)}
      // En modo plan sumamos las paradas por dirección (coords + nombre) al catálogo base;
      // en DESPACHO sin results mandan los extendidos de dragLive (rutas asignadas en vivo);
      // con results mandan los extendidos de results (paradas del flujo manual).
      gps={modo === 'plan' ? { ...gps, ...planExt.gps } : (results?.extGps || dragLive?.extGps || gps)}
      cd={modo === 'plan' && planCd ? planCd : cdRef.current}
      tiendas={(modo === 'plan' ? { ...tiendas, ...planExt.tiendas } : (results?.extTiendas || dragLive?.extTiendas || tiendas)) as Record<string, TiendaInfo>}
      onKmReady={handleKmReady}
      onCdUpdate={coords => { if (modo !== 'plan') cdRef.current = coords; }}
      statMode={modo === 'plan' ? 'stops' : 'load'}
      // [D] En el tablero DESPACHO, tocar la tarjeta del camión filtra el mapa a su ruta (y se
      // sincroniza con los chips) — antes la tarjeta no filtraba porque dragLive dibuja todas.
      selectedPatente={modo === 'drag' ? camionSeleccionado : undefined}
      onSelectPatente={modo === 'drag' ? setCamionSeleccionado : undefined}
    />
  );

  return (
    <div className="despacho-inner h-full flex flex-col overflow-hidden bg-kbg font-sans text-ktext">
      {/* Pill de pendientes del día anterior */}
      {pendientes && pendientes.stores.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex">
          <button
            onClick={() => setShowPendientesModal(true)}
            className="flex items-center gap-2 px-3 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-700 border border-amber-500/40 hover:bg-amber-500/30 transition-all active:scale-95"
          >
            📦 Tiendas pendientes de ayer ({pendientes.stores.length})
          </button>
        </div>
      )}

      {/* Banner: manifiestos YA guardados para la fecha (fuente de verdad persistente, cross-device).
          Evita el susto de "0 asignadas" al abrir desde otro equipo con el lienzo vacío. */}
      {manifiestosGuardados.length > 0 && (() => {
        const asig = reconstruirAsignaciones(manifiestosGuardados);
        const nCam = Object.keys(asig).length;
        const nT   = new Set(Object.values(asig).flat().map(s => s.c)).size;
        if (!nCam) return null;
        return (
          <div className="flex-shrink-0 px-4 py-1.5 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-emerald-700">
              ✓ {nCam} manifiesto{nCam !== 1 ? 's' : ''} guardado{nCam !== 1 ? 's' : ''} para {fechaTxt(fecha)} · {nT} tienda{nT !== 1 ? 's' : ''}
            </span>
            <span className="text-[10px] text-emerald-600/70 font-semibold">despacho registrado</span>
            <button
              onClick={handleCargarManifiestosGuardados}
              className="text-[10px] font-bold px-2.5 py-1 rounded-[8px] border border-emerald-500 text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors active:scale-95 ml-auto"
            >
              Cargar en el tablero
            </button>
          </div>
        );
      })()}

      {/* Pill de pendientes 2ª vuelta (misma fecha) */}
      {pendientesV2.length > 0 && (
        <div className="flex-shrink-0 px-4 py-1.5 bg-kred/10 border-b border-kred/20 flex items-center gap-2">
          <button
            onClick={handleCargarPendientes}
            className="text-[11px] font-bold px-2.5 py-1 rounded-[8px] border-2 border-kred text-kred bg-kred/[0.08] hover:bg-kred/[0.15] transition-colors active:scale-95"
          >
            ⚠ {pendientesV2.length} pendiente{pendientesV2.length !== 1 ? 's' : ''} 2ª vuelta — Cargar
          </button>
          <span className="text-[10px] text-kred/60 font-semibold">salida {fechaTxt(fecha)}</span>
          <span className="text-[10px] text-kred/50">· {pendientesV2.map(s => s.c).join(', ')}</span>
        </div>
      )}

      {/* Modal de pendientes */}
      {showPendientesModal && pendientes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowPendientesModal(false); }}
        >
          <div className="bg-[#1a1a1a] border border-amber-500/30 rounded-2xl w-full max-w-md mx-4 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-amber-500/20 flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-amber-300">Tiendas pendientes</div>
                <div className="text-xs text-amber-500/70 mt-0.5">{pendientes.savedAt}</div>
              </div>
              <button
                onClick={() => setShowPendientesModal(false)}
                className="text-white/40 hover:text-white/80 text-lg leading-none transition-colors"
              >
                ×
              </button>
            </div>

            {/* Lista de tiendas */}
            <div className="px-5 py-4 max-h-64 overflow-y-auto space-y-2">
              {pendientes.stores.map(s => (
                <div key={s.c} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <span className="font-mono text-sm font-bold text-white">{s.c}</span>
                  <div className="flex gap-2 text-xs text-white/60">
                    {s.p > 0 && <span>{s.p}P</span>}
                    {s.b > 0 && <span>{s.b}B</span>}
                    {s.ch > 0 && <span>{s.ch}CH</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Acciones */}
            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button
                onClick={() => {
                  setCalT(prev => {
                    const next = { ...prev };
                    pendientes.stores.forEach(s => {
                      if (!next[s.c]) {
                        next[s.c] = { on: true, p: s.p, b: s.b, c: 0, ch: s.ch ?? 0, g: 'pendiente' };
                      } else {
                        next[s.c] = { ...next[s.c], on: true, p: s.p, b: s.b, ch: s.ch ?? 0, g: 'pendiente' };
                      }
                    });
                    return next;
                  });
                  localStorage.removeItem('despacho_pendientes');
                  setPendientes(null);
                  setShowPendientesModal(false);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-400 active:scale-95 transition-all"
              >
                ✅ Incluir en esta sesión
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem('despacho_pendientes');
                  setPendientes(null);
                  setShowPendientesModal(false);
                }}
                className="py-2.5 px-4 rounded-xl text-sm font-semibold bg-white/10 text-white/70 hover:bg-white/20 active:scale-95 transition-all"
              >
                🗑 Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Aviso: días pasados con asignaciones que quedaron SIN registrar (recuperación) */}
      {unregisteredDays.length > 0 && (
        <div className="mx-3 mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="text-[18px] leading-none mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-amber-900">
                {unregisteredDays.length === 1
                  ? 'Un día quedó con asignaciones sin registrar'
                  : `${unregisteredDays.length} días quedaron con asignaciones sin registrar`}
              </div>
              <div className="text-[12px] text-amber-700 mt-0.5">
                Las asignaciones se guardaron pero no se creó el manifiesto. <b>Abrir</b> para registrarlas,
                o <b>✕</b> en un día para descartarlo si ya lo manejaste (no vuelve a avisar).
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {unregisteredDays.map(d => (
                  <div key={d} className="flex items-stretch rounded-lg overflow-hidden bg-amber-500 text-white">
                    <button onClick={() => setFecha(d)}
                      className="px-2.5 py-1 text-[12px] font-bold hover:bg-amber-400 active:scale-95 transition-all">
                      📅 {d.split('-').reverse().join('/')} — abrir
                    </button>
                    <button onClick={() => dismissUnregisteredDay(d)}
                      title="Descartar este día — no volver a avisar"
                      className="px-2 border-l border-amber-300/70 text-[13px] font-bold leading-none hover:bg-amber-600 active:scale-95 transition-all">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={() => setUnregisteredDays([])} title="Ocultar por ahora (vuelve a aparecer al recargar)"
              className="text-amber-500 hover:text-amber-700 text-[16px] leading-none flex-shrink-0">✕</button>
          </div>
        </div>
      )}

      <DespachoHeader
        supervisor={supervisor} onSupervisor={setSupervisor}
        fecha={fecha} onFecha={setFecha}
        onOpenParadas={handleOpenParadas} paradasCount={paradasAdicionales.length}
        dnom={DNOM} calT={sortedCalT}
        mapContent={isMobile ? mapPanel : undefined}
      />

      <main className="flex-1 overflow-hidden">
        {/* Tabs a ancho completo arriba; el contenido a la izquierda y el mapa a la DERECHA
            (el split contenido↔mapa + su divisor viven dentro de InputSection, vía mapPanel). */}
          <InputSection
            flota={flota}
            modo={modo} fase={faseInfo} calT={sortedCalT}
            calTCong={sortedCalTCong}
            asignacionesCong={asignacionesCong}
            onAsignacionesCong={setAsignacionesCong}
            manualText={manualText} errors={errors}
            tiendas={tiendas} gps={gps} cd={cdRef.current}
            manualAsignaciones={manualAsignaciones}
            paradasAdicionales={paradasAdicionales}
            grupoFiltro={grupoFiltro} grps={grps} onGroupPill={handleGroupPill}
            camionSeleccionado={camionSeleccionado}
            camionSeleccionadoKm={previewKm}
            onSelectTruck={setCamionSeleccionado}
            onModo={m => { setModo(m); if (m !== 'drag') setCamionSeleccionado(null); }}
            flotaStatus={flotaStatus}
            onToggleFlota={handleToggleFlota}
            ordenActivacion={flotaActivadaEn}
            onToggleTlbd={handleToggleTlbd}
            onAgregarVehiculo={handleAgregarVehiculo}
            onEliminarVehiculo={handleEliminarVehiculo}
            onActualizarVehiculo={handleActualizarVehiculo}
            onGuardarFlota={handleGuardarFlota}
            onManual={setManualText}
            onAsignaciones={setManualAsignaciones}
            onCalcular={handleCalcular}
            onCalcularManual={handleCalcularManual}
            onAsignarIA={autoAsignar}
            iaLoading={iaLoading}
            onCerrarCamion={cerrarCamionV1Board}
            cerrarSel={cerrarSel}
            onToggleCerrarSel={toggleCerrarSel}
            onCerrarVarios={cerrarVariosCamiones}
            esCerrada={p => isCerrada(cerradasV1, p)}
            onLimpiar={handleLimpiar}
            onEliminarParada={handleEliminarParada}
            onPlanRutas={(rutas, cdArr, ext) => { setPlanRutas(rutas); setPlanCd(cdArr); setPlanExt(ext ?? { gps: {}, tiendas: {} }); }}
            planLegsByRoute={planLegsByRoute} planKmByRoute={planKmByRoute}
            onTerminarDia={() => setCierreOpen(true)}
            pendientesBacklogCount={pendientesV2Origen.length}
            rightPanelContent={
              results ? (
                <div className="h-full overflow-y-auto">
                  <div className="px-3.5 py-5">
                    <ResultsSection
                      results={results}
                      supervisor={supervisor}
                      fecha={fecha}
                      tiendas={(results.extTiendas || tiendas) as Parameters<typeof ResultsSection>[0]['tiendas']}
                      gps={results.extGps || gps}
                      cd={cdRef.current}
                      flota={flota}
                      onLimpiar={handleLimpiar}
                      onVolver={handleVolverAEdicion}
                      onGenerarPDF={handleGenerarPDF}
                      onGuardarHistorial={handleGuardarHistorial}
                      historialStatus={historialStatus}
                      historialMsg={historialMsg}
                      kmPorRuta={kmPorRuta}
                      legDataPorRuta={legDataPorRuta}
                      pendientesV2={pendientesV2}
                      cerrado={cerrado}
                      cerradasV1={cerradasV1}
                      onAbrirCierre={() => setCierreOpen(true)}
                    />
                  </div>
                  <footer className="no-print border-t border-black/[0.09] py-[14px] text-center text-[11px] text-kmuted font-mono">
                    KiosClub · Sistema de Enrutamiento v4.3 · {Object.keys(tiendas).length} tiendas
                  </footer>
                </div>
              ) : comparisonData ? (
                <div className="h-full overflow-y-auto">
                  <div className="px-3.5 py-5">
                    <ComparisonView
                      data={comparisonData}
                      gps={comparisonData.extGps || gps}
                      cd={cdRef.current}
                      tiendas={(comparisonData.extTiendas || tiendas) as Record<string, TiendaInfo>}
                      onUsar={handleUsarRuta}
                      onVolver={handleVolverEditar}
                    />
                  </div>
                </div>
              ) : undefined
            }
            segundaVueltaContent={
              <div ref={v2ScrollRef} className="h-full overflow-y-auto p-4">
                {pendientesV2Origen.length === 0 ? (
                  <div className="bg-kbg border border-black/[0.09] rounded-kios2 px-3 py-4 text-[13px] text-kmuted text-center">
                    No hay pendientes de 2ª vuelta de días anteriores.
                  </div>
                ) : (
                  <>
                    {/* Sub-pestañas por FECHA DE ORIGEN: cada día se ve, asigna y cierra por separado
                        (antes se sumaban todas las fechas por código y se perdía el detalle). */}
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {fechasV2.map(f => {
                        const active = f === v2Fecha;
                        return (
                          <button key={f} onClick={() => setV2Fecha(f)}
                            className={`px-3 py-1.5 rounded-kios2 text-[12px] font-semibold border transition-colors flex items-center gap-1.5 ${
                              active ? 'bg-knavy text-white border-knavy' : 'bg-kbg text-ktext border-black/[0.12] hover:border-knavy/40'}`}>
                            {fechaTxt(f)}
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-black/[0.06] text-kmuted'}`}>
                              {conteoV2[f] ?? 0}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mb-3 text-[12px] text-kmuted">
                      Pendientes del <span className="font-semibold text-ktext">{v2Fecha ? fechaTxt(v2Fecha) : '—'}</span>: asigná
                      un camión y cerralo — se registra como 2ª vuelta (hoy) con su manifiesto, bajo esa fecha de origen.
                    </div>
                    <ManualDispatch
                      calT={calTV2}
                      flota={flota}
                      gps={gps}
                      tiendas={tiendas}
                      cd={cdRef.current}
                      asignaciones={asignacionesV2[v2Fecha] || {}}
                      onAsignaciones={a => setAsignacionesV2(prev => ({ ...prev, [v2Fecha]: a }))}
                      onCalcular={() => {}}
                      onCerrarCamion={patente => cerrarCamionV2(v2Fecha, patente)}
                      onToggleFlota={handleToggleFlota}
                      hideCalcular={true}
                      scrollContainerRef={v2ScrollRef}
                    />
                  </>
                )}
              </div>
            }
            mapPanel={!isMobile ? mapPanel : undefined}
          />
      </main>

      {manifiestoV2 && (
        <ManifiestoPanel
          rutas={manifiestoV2}
          fecha={todayStr()}
          supervisor={supervisor}
          tiendas={tiendas as Record<string, TiendaInfo & { _parada?: boolean }>}
          isOpen={true}
          onClose={() => setManifiestoV2(null)}
          offsetSeq={manifiestosGuardados.length}
        />
      )}

      {manifiestoV1 && (
        <ManifiestoPanel
          rutas={manifiestoV1}
          fecha={fecha}
          supervisor={supervisor}
          tiendas={(results?.extTiendas || tiendas) as Record<string, TiendaInfo & { _parada?: boolean }>}
          isOpen={true}
          onClose={() => setManifiestoV1(null)}
          // Consecutivo global: cada camión cerrado uno a uno toma el siguiente número
          // (antes todos salían -01 porque cada cierre era un lote nuevo con índice 0).
          offsetSeq={Math.max(0, cerradasV1.size - manifiestoV1.length)}
        />
      )}

      {/* Cierre de jornada — alcanzable desde ResultsSection (post-Calcular) Y desde el
          tablero DESPACHO ("Terminar día", sin haber calculado). Antes solo vivía dentro de
          ResultsSection: si el supervisor cerraba camiones uno por uno con "Cerrar camión"
          y nunca calculaba, "Listo por hoy" —el único lugar que manda el pool sin asignar a
          pendientes 2ª vuelta— quedaba inalcanzable y esas tiendas no se guardaban en ningún
          lado. Sin resultados calculados, el resumen usa lo armado en vivo en el tablero. */}
      <CierreJornadaPanel
        isOpen={cierreOpen}
        onClose={() => setCierreOpen(false)}
        rutas={results?.rutas ?? rutasDesdeAsignaciones(manualAsignaciones, flota, gps, cdRef.current, tiendas)}
        fecha={fecha}
        supervisor={supervisor}
        pendientesV2={pendientesV2}
        pendientesBacklog={pendientesV2Origen}
        onCargarPendientes={handleCargarPendientes}
        onListoPorHoy={handleListoPorHoy}
      />

      <ParadasAdicionales
        isOpen={paradasOpen}
        paradas={paradasAdicionales}
        onAgregar={handleAgregarParada}
        onEliminar={handleEliminarParada}
        onClose={handleCloseParadas}
      />
    </div>
  );
}
