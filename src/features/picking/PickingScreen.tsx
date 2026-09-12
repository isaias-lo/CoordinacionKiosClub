'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePestanaRecordada } from '@/hooks/usePestanaRecordada';
import { claveSesion, parseClaveSesion, TIPO_NOMBRE } from '@/lib/sessionStateKeys';
import { dimsChocolate } from '@/features/despacho/shared/chocolate';
import { pesoVolumetrico } from '@/features/despacho/shared/medidasPallet';
import {
  pesoTotalValido, repartirPeso, serializarPesoTotal, leerPesoTotal,
  type TipoCaja, type PesoTotalGuardado,
} from './pesoTotal';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useApp } from '@/context/AppContext';
import { Printer, Bell, AlertTriangle, RefreshCw, Package, UserPlus } from 'lucide-react';

import { refreshCalendario, subscribeToCalendarChanges } from '@/features/despacho/utils/useCalendario';
import { fetchCalendarioCongelados, subscribeToCalendarioCongelados, type CalRecord } from '@/lib/calendarioCongeladosSync';
import { LabelConfig, DEFAULT_LABEL_CONFIG, BarcodeCard } from '@/features/despacho/shared/BarcodeCard';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { supabase } from '@/lib/supabase';
import { fetchNotificacionesPendientes, subscribeToNotificaciones } from '@/lib/calendarioArmadoSync';

// ─── Local modules ────────────────────────────────────────────────────────────
import type {
  PickingOperation, PickerGroup, TodayStore,
  PickingSession, PalletSlot, PrintRecord, SessionStateRow,
  SupervisorPrint, PickerNameChange, SupervisorPresence, PickerType, SectionFilter,
} from './picking-types';
import {
  SAVED_NAMES_KEY, SESSION_KEY, SECTION_FILTER_KEY, COLS_PER_ROW_KEY,
  LABEL_CONFIG_KEY, CANONICAL_NAMES_KEY,
} from './picking-types';
import {
  todayISO, getStoreName, isPickeableState, isFetchedToday,
  categoriesToContenido, buildCanonicalId, sanitizeForBarcode,
  computePalletNums, isSinAsignar, buildPickerKeyList,
  parseSavedNames, serializeSavedNames,
} from './picking-utils';
import type { PickingEvento } from './picking-utils';
import { seccionDeSlot, seccionDeGrupo, filtrarOpsPorSeccion, categoriasDeSlotsManual, type Seccion } from './picking-secciones';
import { pideSeccion, seccionYContenidoManual, normalizarBatch } from './encargadoManual';
import { slotsYaImpresos } from './reimpresion';
import { etiquetasDeLaSeleccion } from './seleccionImpresion';
import { seccionEfectiva, seccionesDeLaPestana, tiposDeUnidad, primeraUnidadPorDefecto, columnaSeco, type ColumnaSeco } from './tiposUnidad';
import { usePickingOdoo }     from './hooks/usePickingOdoo';
import { StatsTab }           from './components/StatsTab';
import { HistorialTab }       from './components/HistorialTab';
import { ActivityTab } from './components/ActivityTab';
import { ConfigTab }          from './components/ConfigTab';
import CalendarioColumnas     from '@/features/control-interno/CalendarioColumnas';
import { PickerGroupCard }    from './components/PickerGroupCard';
import { StoreListPanel }     from './components/StoreListPanel';
import { AgregarAdelantoDialog } from './components/AgregarAdelantoDialog';
import { enqueuePickingItem, flushPickingQueue } from './picking-offline-queue';
import type { MedidasPallet } from '@/features/despacho/shared/medidasPallet';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import {
  getTiendasAdelantoHoy, deleteTiendaAdelanto, todayISO as adelantoTodayISO,
  type TiendaAdelanto,
} from '@/features/despacho/shared/tiendasAdelanto';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import { tipoTienda } from '@/features/despacho/rutas/utils/tipoTienda';
import { avisoOdoo, motivoOdoo } from './avisoOdoo';
import { usaSelectorDeTiendas } from './selectorTiendas';


// ─── Session helpers ──────────────────────────────────────────────────────────

function loadSession(): Partial<PickingSession> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw) as PickingSession;
    if (s.date !== todayISO()) return {};
    // El semáforo (opsMap) solo se restaura si fue traído de Odoo HOY. Con la pestaña abierta
    // cruzando la medianoche, la sesión se re-guarda con la fecha de hoy pero el opsMap sigue
    // siendo de ayer ("lavado de fecha"); isFetchedToday lo descarta para no mostrar el verde de ayer.
    return isFetchedToday(s.opsMapFetchedAt) ? s : { ...s, opsMap: {} };
  } catch { return {}; }
}

function saveSession(data: PickingSession): void {
  if (typeof window === 'undefined') return;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function PickingScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const { showToast } = useApp();

  // Auth token for authenticated picking API calls
  const tokenRef = useRef<string>('');
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { tokenRef.current = data.session?.access_token ?? ''; });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      tokenRef.current = s?.access_token ?? '';
    });
    return () => subscription.unsubscribe();
  }, []);

  const pickingFetch = useCallback((url: string, init: RequestInit = {}): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${tokenRef.current}`,
      },
    }), []);

  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    fetchNotificacionesPendientes().then(n => setNotifCount(n.length));
    return subscribeToNotificaciones(n => setNotifCount(n.length));
  }, []);

  const [panelView, setPanelView] = useState<'stores' | 'planilla'>('stores');
  // [M-08] El panel de tiendas se pliega solo donde no se usa (Calendario, Estadísticas, Actividad,
  // Historial, Config). `selectorAbiertoManual` deja reabrirlo ahí mismo, y se olvida al cambiar de
  // pestaña para volver al comportamiento automático.
  const [selectorAbiertoManual, setSelectorAbiertoManual] = useState(false);
  const [rightTab, setRightTab]   = usePestanaRecordada('picking_tab',
    ['monitoreo', 'congelados', 'actividad', 'estadisticas', 'historial', 'configuracion', 'calendario'] as const, 'monitoreo');
  // [P6] El monitoreo se separó en dos tabs que comparten la MISMA vista: 'monitoreo' (Seco:
  // aseo/comida, hogar y chocolates) y 'congelados'. `esTabCongelados` decide qué operaciones
  // se muestran y de qué calendario salen las tiendas del panel izquierdo.
  const esTabCongelados = rightTab === 'congelados';

  // Resizable left panel
  const { width: leftWidth, isDesktop, handleMouseDown: handlePanelMouseDown, handleTouchStart: handlePanelTouchStart } =
    useResizablePanel({ storageKey: 'picking_left_panel_width', defaultWidth: 288, min: 180, max: 480 });
  // [M-08] Plegado automático del panel de tiendas donde la selección no cambia lo que se ve.
  const selectorColapsado = isDesktop && !usaSelectorDeTiendas(rightTab) && !selectorAbiertoManual;
  // Al cambiar de pestaña vuelve al automático: haberlo abierto en Calendario no debería dejarlo
  // abierto para siempre en las demás.
  useEffect(() => { setSelectorAbiertoManual(false); }, [rightTab]);

  // Online/offline detection + flush de cola offline al reconectar
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Flush cualquier operación encolada mientras estaba offline
      void flushPickingQueue(pickingFetch, (count) => {
        showToast(`✓ ${count} acción${count !== 1 ? 'es' : ''} sincronizada${count !== 1 ? 's' : ''} al reconectar`, '#16A34A');
      });
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pickingFetch, showToast]);

  // Restaurar sesión al montar
  const session = useMemo(() => loadSession(), []);

  const [selectedCods, setSelectedCods] = useState<string[]>([]);
  // Modo manual: tienda con el campo "+ Encargado manual" abierto + lo que se está escribiendo.
  const [addingManualCod, setAddingManualCod] = useState<string | null>(null);
  const [manualName, setManualName]           = useState('');
  const [manualSeccion, setManualSeccion]     = useState<SectionFilter>('all');
  // Batch escrito al crear el encargado. Solo se pide dentro de una sección, donde ocupa el
  // lugar que tenía el selector de sección (ver `pideSeccion`).
  const [manualBatch, setManualBatch]         = useState('');
  // Con qué unidad nace el encargado. Antes siempre un Pallet — también en Congelados, que solo
  // maneja cajas, y en Chocolates, donde el 99% de lo que se prepara es CH.
  const [manualTipo, setManualTipo]           = useState<PickerType>('P');
  // Bug 5 reportado: el botón de imprimir toda una tienda disparaba la impresión de una al
  // toque, sin confirmar — un click accidental imprimía una etiqueta real de más. Armar/
  // confirmar: el primer click solo "arma" el botón (2.5 s); el segundo click, dentro de esa
  // ventana, imprime. Un click suelto sin seguimiento no hace nada.
  const [armedPrintCod, setArmedPrintCod] = useState<string | null>(null);
  const armedPrintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armedPrintTimerRef.current) clearTimeout(armedPrintTimerRef.current); }, []);

  const {
    hasOdoo, odooDesactivado, opsMap, loadingCods, errorCods, lastRefresh, refreshingId, refreshingStoreCod,
    fetchBatchOps, fetchOpsForStore, refreshOp, refreshAllOps,
  } = usePickingOdoo({ selectedCods, initialOpsMap: session.opsMap ?? {} });
  const [calStores, setCalStores]         = useState<TodayStore[]>([]);
  const [adelantos, setAdelantos]         = useState<TiendaAdelanto[]>([]);
  const [adelantoDialogOpen, setAdelantoDialogOpen] = useState(false);
  const [storesLoading, setStoresLoading] = useState(false);
  // Nombres de tiendas desde Supabase — sobreescriben el hardcoded TIENDAS_INICIAL
  const [tiendaOverrides, setTiendaOverrides] = useState<Record<string, string>>({});
  // Tipo/dirección/zona desde Supabase — para el badge de tipo de tienda (Mall/Strip/…) del header.
  const [tiendaTipoInfo, setTiendaTipoInfo] = useState<Record<string, { tipo: string; d: string; z: string }>>({});

  const [sectionFilterGuardado, setSectionFilter] = useLocalStorage<SectionFilter>(SECTION_FILTER_KEY, 'all');
  // El filtro que APLICA en esta pestaña (ver seccionEfectiva). El guardado no se reinicia al cambiar
  // de pestaña: un "Chocolates" guardado mandaba dentro de Congelados — contaba las cajas en 0, la
  // impresión salía vacía y una caja agregada con el + se grababa con section='chocolates'.
  const sectionFilter = seccionEfectiva(sectionFilterGuardado, esTabCongelados);
  // El calendario de la pestaña Calendario tiene su propio selector. Antes seguía al chip
  // "Congelados" de Seco, que ya no existe (Congelados tiene su pestaña).
  const [calFuente, setCalFuente] = useLocalStorage<'despacho' | 'congelados'>('picking_cal_fuente', 'despacho');
  const [colsPerRow, setColsPerRow]       = useLocalStorage<number>(COLS_PER_ROW_KEY, 3);


  const [pickerDisplayNames, setPickerDisplayNames] = useState<Record<string, string>>(() => {
    const fromSession = session.pickerDisplayNames;
    if (fromSession && Object.keys(fromSession).length > 0) return fromSession;
    if (typeof window === 'undefined') return {};
    return parseSavedNames(localStorage.getItem(SAVED_NAMES_KEY));
  });
  const [palletSlots, setPalletSlots] = useState<PalletSlot[]>([]);
  const palletSlotsRef = useRef<PalletSlot[]>([]);
  palletSlotsRef.current = palletSlots;
  const pendingDeleteIds = useRef<Set<number>>(new Set());
  // Decreasing counter for optimistic (temp) slot IDs — negative to never collide with real DB ids
  const tempIdRef = useRef(-1);

  // Derived: count per (state_key, tipo) — feeds the 3 independent counters
  const palletsByTipoAndStateKey = useMemo(() => {
    const result: Record<string, Record<string, number>> = {};
    for (const s of palletSlots) {
      const t = s.tipo || 'P';
      if (!result[s.state_key]) result[s.state_key] = {};
      result[s.state_key][t] = (result[s.state_key][t] ?? 0) + 1;
    }
    return result;
  }, [palletSlots]);

  // Derived: pallet_num for each slot = its rank (1-based) within (store_cod, tipo) independently.
  // P slots count P-1, P-2...; C slots count C-1, C-2...; B slots count B-1, B-2...
  // Excluye el bucket "Sin asignar" (nunca se imprime) para no correr la numeración de los CH
  // reales (P6), y ordena por created_at+id de forma determinista (P7). Lógica en computePalletNums.
  const palletNumsBySlotId = useMemo(() => computePalletNums(palletSlots), [palletSlots]);

  // Derived: sorted list of pallet numbers per state_key
  const assignedNumsByStateKey = useMemo(() => {
    const result: Record<string, number[]> = {};
    for (const s of palletSlots) {
      const num = palletNumsBySlotId[s.id];
      if (num !== undefined) {
        if (!result[s.state_key]) result[s.state_key] = [];
        result[s.state_key].push(num);
      }
    }
    for (const key of Object.keys(result)) result[key].sort((a, b) => a - b);
    return result;
  }, [palletSlots, palletNumsBySlotId]);

  // Slots per state_key sorted by pallet number (same order as assignedNumsByStateKey)
  const slotsByStateKey = useMemo(() => {
    const result: Record<string, PalletSlot[]> = {};
    for (const s of palletSlots) {
      if (!result[s.state_key]) result[s.state_key] = [];
      result[s.state_key].push(s);
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => (palletNumsBySlotId[a.id] ?? 0) - (palletNumsBySlotId[b.id] ?? 0));
    }
    return result;
  }, [palletSlots, palletNumsBySlotId]);

  const [labelConfig, setLabelConfig]     = useLocalStorage<LabelConfig>(LABEL_CONFIG_KEY, DEFAULT_LABEL_CONFIG);
  const [canonicalNames, setCanonicalNames] = useLocalStorage<Record<string, string>>(CANONICAL_NAMES_KEY, {});

  // ── Shared session state: picker names + types visible across all supervisor desktops ──
  const [sessionStateRows, setSessionStateRows] = useState<SessionStateRow[]>([]);
  const dirtyStateKeys  = useRef<Set<string>>(new Set());
  const upsertTimers    = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadSessionState = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_session_state')
        .select('state_key, picker_label, tipo')
        .eq('date', todayISO());
      if (data) setSessionStateRows(data as SessionStateRow[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadSessionState(); }, [loadSessionState]);
  // Debounce 1 s: upsertSessionState fires on every keystroke (500 ms debounced writes),
  // so the subscriber would reload on every character typed by any supervisor.
  useRealtimeRefresh('picking_session_state', loadSessionState, true, 15000, 1000);

  // Merge server state into local — skip keys actively being edited by this client
  // Only names son sincronizados cross-client; tipos son manejados localmente por cliente (date-scoped localStorage)
  // Filtra por tipo==='P' (el que ya usaba onNameChange para el nombre) para no mezclarse con
  // otros "usos" de esta misma tabla con el mismo state_key — ver pickerBatch (tipo='batch') abajo.
  useEffect(() => {
    if (!sessionStateRows.length) return;
    setPickerDisplayNames(prev => {
      const next = { ...prev };
      for (const r of sessionStateRows) {
        const { stateKey, tipo } = parseClaveSesion(r);
        if (tipo === TIPO_NOMBRE && !dirtyStateKeys.current.has(`${stateKey}::${TIPO_NOMBRE}`) && r.picker_label) next[stateKey] = r.picker_label;
      }
      return next;
    });
  }, [sessionStateRows]);

  // Batch (Transferir Agrupación) manual — opcional, para encargados sin ese dato de Odoo
  // (típicamente los manuales). Mismo mecanismo que el nombre (picking_session_state), con un
  // tipo distinto ('batch') para no pisarse con el nombre en el mismo state_key.
  const [pickerBatch, setPickerBatch] = useState<Record<string, string>>({});
  // Peso TOTAL de las cajas de un encargado, por tipo (CH, CC, CN), con clave `${stateKey}::${tipo}`.
  // `raw` es lo que se escribe (para no pelear con el cursor); `guardado` es el total que se repartió
  // y cuántas cajas había al pesar — si la cantidad cambia después, la tarjeta pide volver a pesar.
  // Viaja como el batch: `tipo` propio en picking_session_state (ver sessionStateKeys).
  const [pesoTotalRaw, setPesoTotalRaw]           = useState<Record<string, string>>({});
  const [pesoTotalGuardado, setPesoTotalGuardado] = useState<Record<string, PesoTotalGuardado>>({});
  const pesoTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    if (!sessionStateRows.length) return;
    setPickerBatch(prev => {
      const next = { ...prev };
      for (const r of sessionStateRows) {
        // `parseClaveSesion` le quita el sufijo, y de paso sigue entendiendo las filas guardadas
        // ANTES de este arreglo (clave pelada con tipo='batch'): así no se pierde lo ya cargado.
        const { stateKey, tipo } = parseClaveSesion(r);
        if (tipo === 'batch' && !dirtyStateKeys.current.has(`${stateKey}::batch`)) next[stateKey] = r.picker_label ?? '';
      }
      return next;
    });
    // El peso total de las cajas viaja igual que el batch, con su propio `tipo` por clase de caja.
    const guardados: Record<string, PesoTotalGuardado> = {};
    for (const r of sessionStateRows) {
      const { stateKey, tipo } = parseClaveSesion(r);
      const m = /^peso-total-(CH|CC|CN)$/.exec(tipo);
      if (!m || dirtyStateKeys.current.has(`${stateKey}::${tipo}`)) continue;
      const g = leerPesoTotal(r.picker_label);
      if (g) guardados[`${stateKey}::${m[1]}`] = g;
    }
    if (Object.keys(guardados).length) {
      setPesoTotalGuardado(prev => ({ ...prev, ...guardados }));
      setPesoTotalRaw(prev => {
        const next = { ...prev };
        for (const [k, g] of Object.entries(guardados)) next[k] = String(g.total).replace('.', ',');
        return next;
      });
    }
  }, [sessionStateRows]);

  // Debounced upsert — waits 500ms of inactivity before writing to server
  // dirtyKey incluye el `tipo` — nombre y batch comparten state_key pero son ediciones
  // independientes; sin esto, tipear el batch bloqueaba (por "dirty") la sync del nombre y
  // viceversa.
  const upsertSessionState = useCallback((stateKey: string, pickerLabel: string, tipo: string) => {
    const dirtyKey = `${stateKey}::${tipo}`;
    dirtyStateKeys.current.add(dirtyKey);
    clearTimeout(upsertTimers.current[dirtyKey]);
    upsertTimers.current[dirtyKey] = setTimeout(() => {
      void pickingFetch('/api/picking-session-state', {
        method: 'POST',
        // La clave lleva el tipo. La PK de la tabla es (state_key, date) SIN tipo, así que sin
        // esto el batch y el nombre compiten por la misma fila y el último gana: guardar el
        // batch borraba el nombre del encargado. El nombre conserva su clave pelada para no
        // mover las cientos de filas que ya existen (ver sessionStateKeys.ts).
        body: JSON.stringify({ state_key: claveSesion(stateKey, tipo), date: todayISO(), picker_label: pickerLabel, tipo }),
      }).then(() => { dirtyStateKeys.current.delete(dirtyKey); });
    }, 500);
  }, []);

  // Setea el batch manual de un encargado y lo persiste — mismo patrón que onNameChange.
  // Solo dígitos: se guarda el número crudo, el formato "BATCH/N" se aplica al mostrarlo.
  const setPickerBatchValue = useCallback((stateKey: string, raw: string) => {
    const num = raw.replace(/\D/g, '');
    setPickerBatch(prev => ({ ...prev, [stateKey]: num }));
    upsertSessionState(stateKey, num, 'batch');
  }, [upsertSessionState]);

  // Los slots del grupo al momento de repartir (el reparto corre en un timer: no puede leer una foto vieja).
  const slotsByStateKeyRef = useRef(slotsByStateKey);
  useEffect(() => { slotsByStateKeyRef.current = slotsByStateKey; }, [slotsByStateKey]);

  /**
   * Peso TOTAL de las cajas de un tipo (todas juntas en la balanza), repartido entre ellas.
   *
   * En el andén se suben todas las cajas juntas; antes había que pesar cada chocolate por separado
   * (#458) y las cajas de congelado no tenían dónde anotarse. El total se reparte con `repartirPeso`,
   * que hace que la suma dé exacto lo que marcó la balanza — lo que importa aguas abajo.
   *
   * Se aplica a las cajas YA creadas del grupo, y espera 700 ms de quietud: escribir "180" pasa por
   * "1" y "18", y sin la espera se reescribirían todas las cajas en cada tecla (y Bodega vería el
   * peso bailar por realtime). Se guarda junto con cuántas cajas había, para detectar si cambia.
   */
  const setPesoTotalValue = useCallback((stateKey: string, tipo: TipoCaja, raw: string) => {
    const limpio = raw.replace(/[^\d.,]/g, '').slice(0, 8);
    const k = `${stateKey}::${tipo}`;
    setPesoTotalRaw(prev => ({ ...prev, [k]: limpio }));
    clearTimeout(pesoTimers.current[k]);
    pesoTimers.current[k] = setTimeout(() => {
      const cajas = (slotsByStateKeyRef.current[stateKey] ?? []).filter(sl => (sl.tipo || 'P') === tipo && sl.id > 0);
      const v = pesoTotalValido(limpio, cajas.length, tipo);
      if (!v.ok) return;   // el error se ve en la tarjeta; no se escribe nada
      const guardado = { total: v.total, n: cajas.length };
      setPesoTotalGuardado(prev => ({ ...prev, [k]: guardado }));
      upsertSessionState(stateKey, serializarPesoTotal(guardado), `peso-total-${tipo}`);
      const partes = repartirPeso(v.total, cajas.length);
      // El chocolate tiene medidas fijas; las cajas de congelado solo llevan peso.
      const extra = tipo === 'CH'
        ? { ...dimsChocolate(), peso_v: pesoVolumetrico(dimsChocolate().alto, dimsChocolate().largo, dimsChocolate().ancho) }
        : {};
      cajas.forEach((sl, i) => {
        supabase.from('picking_pallets').update({ peso_kg: partes[i], ...extra }).eq('id', sl.id)
          .then(({ error }) => { if (error) console.error('[peso-total]', error.message); });
      });
    }, 700);
  }, [upsertSessionState]);

  // Al renombrar un picker, propaga el nombre a los slots YA creados de ese grupo. Su
  // picker_label queda congelado al crearse; sin esto, un equipo sin el nombre en sesión
  // imprimía el nombre viejo del slot (caso 39PSB: se imprimió "Fabian" tras renombrar a
  // "Zervens"). El UPDATE se propaga por realtime a los demás equipos.
  const renamePickerSlots = useCallback((stateKey: string, name: string) => {
    if (!name.trim()) return;
    supabase.from('picking_pallets')
      .update({ picker_label: name })
      .eq('date', todayISO())
      .eq('state_key', stateKey)
      .eq('is_active', true)
      .then(({ error }) => { if (error) console.error('[picking rename slots]', error.message); });
  }, []);

  const [printOnlyStore, setPrintOnlyStore]       = useState<string | null>(null);
  const [printOnlyStateKey, setPrintOnlyStateKey] = useState<string | null>(null);
  // Sección a imprimir cuando se imprime UNA card estando en un filtro de sección: limita las
  // etiquetas a los pallets de esa sección (consistente con el contador de la card). null = todo.
  const [printOnlySection, setPrintOnlySection]   = useState<Seccion | null>(null);
  const [doPrint, setDoPrint]                     = useState(false);
  // La selección viaja como IDS de pallet. Antes eran números de pallet sueltos, y como cada tipo
  // numera por separado, P1 y B1 comparten el 1: seleccionar B1 imprimía también P1.
  const [selectionPrint, setSelectionPrint]       = useState<{ stateKey: string; slotIds: Set<number> } | null>(null);
  // Pallets que YA estaban impresos al hacer clic en imprimir: sus etiquetas salen marcadas COPIA.
  // Es una foto tomada ANTES de asignar códigos (ver slotsYaImpresos): si se mirara al dibujar, una
  // primera impresión podría salir como copia.
  const [slotsCopia, setSlotsCopia]               = useState<Set<number>>(() => new Set());
  const [mounted, setMounted]                     = useState(false);

  // Cross-desktop print visibility — single source of truth for both printedKeys and HistorialTab
  const [printRecords, setPrintRecords] = useState<PrintRecord[]>([]);
  const printedKeys       = useMemo(() => new Set(printRecords.map(r => r.state_key)), [printRecords]);
  // Map state_key → last PrintRecord — para mostrar advertencia "ya impreso por X" en cada card
  const printRecordByKey  = useMemo(() => new Map(printRecords.map(r => [r.state_key, r])), [printRecords]);
  // Ref que guarda la promesa de recordPrints en vuelo — el efecto doPrint la espera antes de llamar window.print()
  const pendingPrintRef   = useRef<Promise<number> | null>(null);

  // ── Supervisor presence — quién más está activo y qué está imprimiendo ──────
  const [otherSupervisors, setOtherSupervisors] = useState<Record<string, SupervisorPresence>>({});
  const presenceRef  = useRef<SupervisorPresence>({ name: '', userId: '', recentPrints: [], lastActive: '' });
  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    const myId  = profile.id;
    const myName = profile.full_name ?? 'Supervisor';
    presenceRef.current = { name: myName, userId: myId, recentPrints: [], lastActive: new Date().toISOString() };

    const ch = supabase.channel(`picking-supervisors-${todayISO()}`, {
      config: { presence: { key: myId } },
    });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<SupervisorPresence>();
      const others: Record<string, SupervisorPresence> = {};
      for (const [uid, metas] of Object.entries(state)) {
        if (uid === myId) continue;
        const meta = (metas as SupervisorPresence[])[0];
        if (meta) others[uid] = meta;
      }
      setOtherSupervisors(others);
    });

    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track(presenceRef.current);
      }
    });

    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); channelRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const loadPrintRecords = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_prints')
        .select('state_key, printed_at, picker_label, pallets, tipo, printed_by_name, print_count, batch')
        .eq('date', todayISO())
        .order('printed_at', { ascending: true });
      if (data) setPrintRecords(data as PrintRecord[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadPrintRecords(); }, [loadPrintRecords]);
  useEffect(() => { setMounted(true); }, []);

  // ── Name change history ────────────────────────────────────────────────────
  const [nameChanges, setNameChanges] = useState<PickerNameChange[]>([]);

  const loadNameChanges = useCallback(async () => {
    try {
      const date = todayISO();
      const { data } = await supabase
        .from('picker_name_changes')
        .select('id, picker_key, old_name, new_name, changed_by_name, changed_at')
        .gte('changed_at', `${date}T00:00:00.000Z`)
        .lte('changed_at', `${date}T23:59:59.999Z`)
        .order('changed_at', { ascending: false });
      if (data) setNameChanges(data as PickerNameChange[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadNameChanges(); }, [loadNameChanges]);

  // ── Auditoría de altas/bajas de pallets (crear / eliminar) ──────────────────
  const [pickingEventos, setPickingEventos] = useState<PickingEvento[]>([]);

  const loadEventos = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_eventos')
        .select('id, date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name, created_at')
        .eq('date', todayISO())
        .order('created_at', { ascending: true });
      if (data) setPickingEventos(data as PickingEvento[]);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadEventos(); }, [loadEventos]);

  // Single channel for prints, name changes and pallet audit — reduces WebSocket channels.
  // A change on any is infrequent enough that reloading all callbacks is acceptable.
  useRealtimeRefresh('picking_prints,picker_name_changes,picking_eventos', useCallback(() => {
    void loadPrintRecords();
    void loadNameChanges();
    void loadEventos();
  }, [loadPrintRecords, loadNameChanges, loadEventos]));

  // ── Pallet slots: DB-backed, real-time ──────────────────────────────────────
  // Uses the browser Supabase client directly to avoid the Next.js API round-trip on
  // every realtime-triggered reload. RLS on picking_pallets allows all authenticated users.
  const loadPalletSlots = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picking_pallets')
        .select('id, store_cod, state_key, picker_label, tipo, contenido, section, refs, created_at, seq, canonical_id, peso_kg, alto, largo, ancho, peso_v')
        .eq('date', todayISO())
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (data) {
        // Excluir IDs creados desde Bodega (origen "<cod>__bodega") — solo viven en Bodega/Enrutador/Seguimiento
        const slots = (data as PalletSlot[]).filter(s => !String(s.state_key ?? '').endsWith('__bodega') && s.picker_label !== 'Bodega');
        setPalletSlots(slots);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { void loadPalletSlots(); }, [loadPalletSlots]);
  // Polling fallback: si algún evento de INSERT fue perdido por el WebSocket
  // (corte breve, throttle de Supabase), el ciclo de 60 s lo recupera.
  useEffect(() => {
    const id = setInterval(() => { void loadPalletSlots(); }, 60_000);
    return () => clearInterval(id);
  }, [loadPalletSlots]);
  // Incremental realtime: apply INSERT/UPDATE/DELETE deltas directly to local state
  // instead of doing a full DB reload on every event. Eliminates the query storm where
  // N supervisors each reload the full table on every change.
  // onReconnect = loadPalletSlots ensures a full reload if the WebSocket was disconnected
  // (catching any events missed during the gap).
  useEffect(() => {
    const unsub = subscribeToPickingPallets(
      ({ eventType, new: newRow, old: oldRow }) => {
        // Extract only the PalletSlot fields we care about from the full payload row
        const toSlot = (r: Record<string, unknown>): PalletSlot => ({
          id:           r.id as number,
          store_cod:    r.store_cod as string,
          state_key:    r.state_key as string,
          picker_label: (r.picker_label as string) ?? '',
          tipo:         (r.tipo as string) ?? 'P',
          contenido:    (r.contenido as string) ?? 'hogar',
          section:      (r.section as string | null) ?? null,
          refs:         (r.refs as string) ?? '',
          created_at:   r.created_at as string,
          // Sin estas cinco, el evento de Realtime PISABA el peso recién guardado con undefined:
          // el slot local volvía a quedar sin pesar hasta la próxima recarga completa.
          peso_kg:      (r.peso_kg as number | null) ?? null,
          alto:         (r.alto as number | null) ?? null,
          largo:        (r.largo as number | null) ?? null,
          ancho:        (r.ancho as number | null) ?? null,
          peso_v:       (r.peso_v as number | null) ?? null,
        });

        if (eventType === 'INSERT') {
          const isActive   = (newRow as { is_active?: boolean }).is_active;
          const stateKey   = (newRow as { state_key?: string }).state_key ?? '';
          const pickerLbl  = (newRow as { picker_label?: string }).picker_label ?? '';
          const isBodega   = stateKey.endsWith('__bodega') || pickerLbl === 'Bodega';
          if (isActive !== false && !isBodega) {
            const slot = toSlot(newRow as Record<string, unknown>);
            setPalletSlots(prev =>
              prev.some(s => s.id === slot.id) ? prev : [...prev, slot]
            );
          }
        } else if (eventType === 'UPDATE') {
          const row = newRow as Record<string, unknown> & { is_active?: boolean };
          const id  = row.id as number;
          if (!row.is_active) {
            // Slot deactivated (e.g. combine operation) — remove from visible state
            setPalletSlots(prev => prev.filter(s => s.id !== id));
          } else {
            setPalletSlots(prev =>
              prev.map(s => s.id !== id ? s : toSlot(row))
            );
          }
        } else if (eventType === 'DELETE') {
          const id = (oldRow as { id?: number }).id;
          if (id !== undefined) setPalletSlots(prev => prev.filter(s => s.id !== id));
        }
      },
      loadPalletSlots, // full reload on WebSocket reconnect
    );
    return unsub;
  }, [loadPalletSlots]);

  const addPalletSlot = useCallback(async (stateKey: string, storeCod: string, pickerLabel: string, tipo: string, contenido = 'hogar', refs = '', section: string | null = null, medidas?: MedidasPallet) => {
    const date = todayISO();
    // Idempotencia: id de operación único por click. Si el POST se reintenta (red,
    // doble-click, replay de cola offline), el server deduplica por client_op_id.
    const clientOpId = crypto.randomUUID();
    const actorName = presenceRef.current.name;
    // Optimistic update: add a temp slot immediately so the counter in PickerGroupCard
    // reflects the in-flight add. This prevents the rapid-click race condition where
    // clicking + multiple times before the POST returns creates duplicate slots.
    const tempId = tempIdRef.current--;
    const tempSlot: PalletSlot = {
      id: tempId, store_cod: storeCod, state_key: stateKey,
      picker_label: pickerLabel, tipo, contenido, section, refs,
      created_at: new Date().toISOString(),
      ...(medidas ?? {}),
    };
    setPalletSlots(prev => [...prev, tempSlot]);
    try {
      const res = await pickingFetch('/api/picking-pallets', {
        method: 'POST',
        body: JSON.stringify({ date, store_cod: storeCod, state_key: stateKey, picker_label: pickerLabel, tipo, contenido, section, refs, actor_name: actorName, client_op_id: clientOpId, ...(medidas ?? {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        console.error('[picking] addPalletSlot error', res.status, err.error ?? '');
        setPalletSlots(prev => prev.filter(s => s.id !== tempId));
        showToast('⚠ No se pudo agregar el pallet — se reintentará al reconectar', '#D97706');
        enqueuePickingItem({ op: 'add', stateKey, storeCod, pickerLabel, tipo, contenido, section, refs, date, clientOpId, actorName, medidas });
        return;
      }
      const json = await res.json() as { data?: PalletSlot };
      if (json.data) {
        // 4-case dedup: the incremental INSERT handler may have already added the real slot
        // (realtime via WebSocket arrives faster than the HTTP response).
        // Possible states: (A) only temp, (B) temp + real, (C) only real, (D) neither.
        setPalletSlots(prev => {
          const hasTemp = prev.some(s => s.id === tempId);
          const hasReal = prev.some(s => s.id === json.data!.id);
          if (hasTemp && hasReal) return prev.filter(s => s.id !== tempId); // (B) drop temp
          if (hasTemp)            return prev.map(s => s.id === tempId ? json.data! : s); // (A) swap
          if (!hasReal)           return [...prev, json.data!]; // (D) add real
          return prev;           // (C) real already there, nothing to do
        });
        pickingFetch('/api/despacho-picking', {
          method: 'POST',
          body: JSON.stringify({ slot_id: json.data.id, store_cod: storeCod, tipo, contenido, date }),
        }).catch(err => console.error('[picking] despacho-picking error', err));
        // Recargar mis propios eventos: así el usuario ve su propia alta en Actividad al
        // instante (la presencia solo se transmite a otros supervisores).
        void loadEventos();
      } else {
        setPalletSlots(prev => prev.filter(s => s.id !== tempId));
      }
    } catch (e) {
      console.error('[picking] addPalletSlot network error', e);
      setPalletSlots(prev => prev.filter(s => s.id !== tempId));
      showToast('⚠ Sin conexión — el pallet se agregará al reconectar', '#D97706');
      enqueuePickingItem({ op: 'add', stateKey, storeCod, pickerLabel, tipo, contenido, section, refs, date, clientOpId, actorName });
    }
  }, [pickingFetch, showToast, loadEventos]);

  // Modo manual: crea el PRIMER pallet (tipo P) de un encargado escrito a mano — mismo
  // addPalletSlot que ya usa el stepper +/-, así que no hace falta nada nuevo del lado del
  // servidor. En cuanto exista esta fila, `allGroups` levanta la tarjeta sola (ver arriba) y
  // de ahí en más el supervisor ajusta P/B/C/CH con el stepper normal de la card.
  const crearEncargadoManual = useCallback((cod: string) => {
    const nombre = manualName.trim();
    if (!nombre) return;
    const stateKey = `${cod}__${nombre.toLowerCase()}`;
    // Misma sección/contenido que ya deriva el stepper real (onTipoPalletsChange) a partir del
    // filtro activo — acá no hay categorías de Odoo de las que derivarlo, así que se elige a
    // mano: 'all' ("Todas") ⇒ sin sección (mixto — 'todas' significa "sin sección específica",
    // NO "una operación por cada sección"), o una de las 4 secciones reales.
    // BUG 7 corregido: antes 'all' caía en contenido='hogar' por defecto, así que
    // seccionDeSlot (sin `section`, cae al contenido) lo clasificaba como Hogar en vez de
    // dejarlo sin clasificar — 'mixto' no matchea ninguna sección en seccionDeContenido.
    const { seccion, contenido } = seccionYContenidoManual(manualSeccion, manualTipo);
    void addPalletSlot(stateKey, cod, nombre, manualTipo, contenido, '', seccion);
    // BUG 1/2 corregido: sin esto, el campo "Nombre del picker" del card recién creado
    // aparecía vacío (solo el placeholder mostraba el nombre) y la advertencia de fallback
    // salía de entrada aunque el encargado ya tuviera nombre real. Al sembrar el nombre acá
    // queda guardado desde el principio, igual que si alguien lo hubiera escrito a mano.
    setPickerDisplayNames(prev => ({ ...prev, [stateKey]: nombre }));
    upsertSessionState(stateKey, nombre, 'P');
    // El batch escrito en el formulario se guarda como si se hubiera tipeado en la card, así la
    // etiqueta sale con BATCH/N desde la primera impresión y no hay que volver a entrar a ponerlo.
    const batch = normalizarBatch(manualBatch);
    if (batch) setPickerBatchValue(stateKey, batch);
    setManualName('');
    setManualBatch('');
    setAddingManualCod(null);
  }, [manualName, manualSeccion, manualTipo, manualBatch, addPalletSlot, upsertSessionState, setPickerBatchValue]);

  // section: cuando hay filtro de sección activo, elimina un slot DE ESA sección (para que el
  // "−" del stepper baje el conteo de la sección visible, no cualquier pallet del picker).
  const removePalletSlot = useCallback(async (stateKey: string, tipo: string, section: Seccion | null = null) => {
    if (!isOnline) { console.warn('[picking] offline — cannot remove pallet slot'); return; }
    // Read from ref (avoids stale closure) and skip pending deletes; filters by tipo for 3-counter accuracy
    const slot = palletSlotsRef.current
      .filter(s => s.state_key === stateKey && (s.tipo || 'P') === tipo
        && (section == null || seccionDeSlot(s) === section)
        && !pendingDeleteIds.current.has(s.id))
      .at(-1);
    if (!slot) return;
    pendingDeleteIds.current.add(slot.id);
    setPalletSlots(prev => prev.filter(s => s.id !== slot.id));
    try {
      const res = await pickingFetch('/api/picking-pallets', {
        method: 'DELETE',
        body: JSON.stringify({ id: slot.id, actor_name: presenceRef.current.name }),
      });
      if (!res.ok) setPalletSlots(prev => [...prev, slot].sort((a, b) => a.id - b.id));
      else void loadEventos(); // ver mi propia baja en Actividad al instante
    } catch {
      setPalletSlots(prev => [...prev, slot].sort((a, b) => a.id - b.id));
    } finally {
      pendingDeleteIds.current.delete(slot.id);
    }
  }, [loadEventos]);

  // sectionFilter y labelConfig persistidos automáticamente por useLocalStorage

  // ── Canonical names: shared across all supervisor desktops ────────────────────
  const loadCanonicalNames = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('picker_canonical_names')
        .select('key, display_name')
        .order('key');
      if (!data?.length) return;
      const next: Record<string, string> = {};
      for (const r of data) if (r.display_name) next[r.key] = r.display_name;
      setCanonicalNames(next);
    } catch { /* silent */ }
  }, []);

  // Cargar canonical names una vez que el token esté disponible (profile cargado)
  useEffect(() => { if (profile) void loadCanonicalNames(); }, [loadCanonicalNames, profile]);
  useRealtimeRefresh('picker_canonical_names', loadCanonicalNames);

  // Cargar nombres de tiendas desde Supabase — mismo patrón que CalendarioColumnas.
  // Sobreescribe TIENDAS_INICIAL con los datos editados en /admin/tiendas.
  const loadTiendaOverrides = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('tiendas')
        .select('codigo, nombre, tipo, direccion, sector_comuna');
      if (!data) return;
      const overrides: Record<string, string> = {};
      const tipoInfo: Record<string, { tipo: string; d: string; z: string }> = {};
      for (const t of data) {
        if (t.codigo && t.nombre) overrides[t.codigo] = t.nombre;
        if (t.codigo) tipoInfo[t.codigo] = { tipo: t.tipo ?? '', d: t.direccion ?? '', z: t.sector_comuna ?? '' };
      }
      setTiendaOverrides(overrides);
      setTiendaTipoInfo(tipoInfo);
    } catch { /* silent */ }
  }, []);
  useEffect(() => { void loadTiendaOverrides(); }, [loadTiendaOverrides]);
  // tiendas is a static lookup table — no realtime subscription needed
  // (los nombres con override y la fusión con adelantos se resuelven en el memo
  //  `todayStores` más abajo)

  const handleCanonicalNamesChange = useCallback((names: Record<string, string>, changedKey?: string, changedVal?: string, byName?: string) => {
    setCanonicalNames(names); // persisted automatically by useLocalStorage
    if (changedKey !== undefined) {
      void pickingFetch('/api/picker-canonical-names', {
        method: 'POST',
        body: JSON.stringify({ key: changedKey, display_name: changedVal ?? '', updated_by_name: byName ?? '' }),
      });
    }
  }, []);

  const handleColsPerRowChange = useCallback((n: number) => {
    setColsPerRow(n); // persisted automatically by useLocalStorage
  }, [setColsPerRow]);

  // Case-insensitive lookup: Odoo may return "pickers 3" while canonical key is "Pickers 3".
  // Busca contra la lista fusionada (built-in + custom agregados) para que los pickers nuevos
  // resuelvan su nombre configurado igual que los de fábrica.
  const getCanonicalName = useCallback((key: string): string => {
    if (canonicalNames[key]) return canonicalNames[key];
    const lower = key.toLowerCase().trim();
    const match = buildPickerKeyList(canonicalNames).find(k => k.toLowerCase().trim() === lower);
    return match ? (canonicalNames[match] ?? '') : '';
  }, [canonicalNames]);

  // Nombres ya conocidos (built-in de Picking + agregados en Config) para sugerir al crear un
  // encargado manual — el datalist permite elegir uno existente O escribir uno nuevo con el
  // mismo campo, sin un selector aparte.
  const nombresConocidos = useMemo(
    () => buildPickerKeyList(canonicalNames).map(k => getCanonicalName(k) || k),
    [canonicalNames, getCanonicalName],
  );

  // Persistir nombres en localStorage (cross-session), delimitado por fecha — ver
  // parseSavedNames/serializeSavedNames. Evita que nombres de ayer (misma state_key,
  // ya que los responsables de Odoo son slots fijos que se repiten cada día) reaparezcan hoy.
  useEffect(() => {
    localStorage.setItem(SAVED_NAMES_KEY, serializeSavedNames(pickerDisplayNames));
  }, [pickerDisplayNames]);

  // Persistir sesión en sessionStorage cuando cambia el estado relevante.
  // opsMapFetchedAt = hora real del último fetch a Odoo (lastRefresh), para que loadSession
  // pueda descartar un opsMap de otro día aunque la sesión se re-guarde con la fecha de hoy.
  useEffect(() => {
    saveSession({ date: todayISO(), selectedCods, opsMap, pickerDisplayNames, opsMapFetchedAt: lastRefresh?.toISOString() });
  }, [selectedCods, opsMap, pickerDisplayNames, lastRefresh]);

  // Disparar impresión después del re-render:
  // 1) espera a que recordPrints termine (registro en Supabase)
  // 2) doble rAF para que JsBarcode (dynamic import) haya pintado los SVG
  useEffect(() => {
    if (!doPrint) return;
    setDoPrint(false);
    void (async () => {
      if (pendingPrintRef.current) {
        const failures = await pendingPrintRef.current;
        pendingPrintRef.current = null;
        if (failures > 0) showToast(`⚠ ${failures} etiqueta(s) no se pudieron registrar`, '#D97706');
      }
      const handleAfterPrint = () => {
        setPrintOnlyStore(null);
        setPrintOnlyStateKey(null);
        setPrintOnlySection(null);
        setSelectionPrint(null);
        setSlotsCopia(new Set());
        window.removeEventListener('afterprint', handleAfterPrint);
      };
      window.addEventListener('afterprint', handleAfterPrint);
      // Double rAF: primer frame aplica el render de React, segundo frame
      // garantiza que JsBarcode (dynamic import async) terminó de dibujar los SVG
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    })();
  }, [doPrint, showToast]);

  // Cargar tiendas del calendario (bust caché para evitar datos viejos del merge)
  // Nombre de tienda: Supabase override primero, luego hardcoded
  const nameFor = useCallback((cod: string): string =>
    tiendaOverrides[cod] || getStoreName(cod), [tiendaOverrides]);

  // Tipo de tienda (Mall / Strip / Street / …) para el badge del header — Supabase primero,
  // luego el catálogo hardcoded TIENDAS_INICIAL (mismo patrón que nameFor).
  const tipoFor = useCallback((cod: string) => {
    const info = tiendaTipoInfo[cod];
    const base = TIENDAS_INICIAL[cod];
    return tipoTienda(info?.tipo || base?.tipo, info?.d || base?.d, info?.z || base?.z);
  }, [tiendaTipoInfo]);

  const applyCalendar = useCallback((cal: Record<string, { rm: string[]; costa: string[]; fal: string[] }>) => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const today = DAY_CODES[new Date().getDay()];
    const day = cal[today];
    if (!day) return;
    setCalStores([
      ...day.fal.map(cod   => ({ cod, name: nameFor(cod), sources: ['regiones'] as ('rm' | 'regiones')[] })),
      ...day.costa.map(cod => ({ cod, name: nameFor(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
      ...day.rm.map(cod    => ({ cod, name: nameFor(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
    ]);
  }, [nameFor]);

  // [P6] Tiendas del CALENDARIO DE CONGELADOS de hoy. El tab Congelados no puede alimentarse del
  // calendario seco: una tienda con congelados hoy que no esté en el seco no aparecería en el panel
  // y su picking quedaría invisible. Se usa DAY_CODES (incluye DOMINGO, que el calendario de
  // congelados sí contempla) — no `getDia`, que pliega el domingo al lunes.
  const [calStoresCong, setCalStoresCong] = useState<TodayStore[]>([]);
  const applyCalendarCong = useCallback((cal: CalRecord) => {
    const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
    const day = cal[DAY_CODES[new Date().getDay()]];
    if (!day) { setCalStoresCong([]); return; }
    setCalStoresCong([
      ...(day.fal   ?? []).map(cod => ({ cod, name: nameFor(cod), sources: ['regiones'] as ('rm' | 'regiones')[] })),
      ...(day.costa ?? []).map(cod => ({ cod, name: nameFor(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
      ...(day.rm    ?? []).map(cod => ({ cod, name: nameFor(cod), sources: ['rm']       as ('rm' | 'regiones')[] })),
    ]);
  }, [nameFor]);

  useEffect(() => {
    fetchCalendarioCongelados().then(applyCalendarCong).catch(() => {});
    return subscribeToCalendarioCongelados(applyCalendarCong);
  }, [applyCalendarCong]);

  // ── Tiendas de adelanto (extra del día, fuera del calendario de abastecimiento) ──────
  const loadAdelantos = useCallback(async () => {
    setAdelantos(await getTiendasAdelantoHoy());
  }, []);
  useEffect(() => { void loadAdelantos(); }, [loadAdelantos]);
  useRealtimeRefresh('tiendas_adelanto', loadAdelantos, true, 30000, 1000);

  const handleDeleteAdelanto = useCallback(async (id: number) => {
    const ok = await deleteTiendaAdelanto(id);
    if (ok) setAdelantos(prev => prev.filter(a => a.id !== id));
    else showToast('No se pudo eliminar el adelanto');
  }, [showToast]);

  // todayStores = calendario (con overrides de nombre) + tiendas de adelanto de hoy.
  const todayStores = useMemo<TodayStore[]>(() => {
    // [P6] En el tab Congelados la lista sale del calendario de CONGELADOS; en el resto, del seco.
    const fuente = esTabCongelados ? calStoresCong : calStores;
    const base = fuente.map(s => ({ ...s, name: tiendaOverrides[s.cod] || getStoreName(s.cod) }));
    const present = new Set(base.map(s => s.cod));
    const extra: TodayStore[] = adelantos.map(a => ({
      cod:      a.store_cod,
      name:     tiendaOverrides[a.store_cod] || getStoreName(a.store_cod),
      sources:  (a.zona === 'fal' ? ['regiones'] : ['rm']) as ('rm' | 'regiones')[],
      adelanto: { id: a.id, zona: a.zona, fecha_despacho: a.fecha_despacho },
    }));
    // Anota como adelanto las que ya estuvieran en el calendario; agrega las nuevas.
    for (const e of extra) {
      if (present.has(e.cod)) {
        const i = base.findIndex(s => s.cod === e.cod);
        if (i >= 0) base[i] = { ...base[i], adelanto: e.adelanto };
      } else {
        base.push(e);
      }
    }
    return base;
  }, [calStores, calStoresCong, esTabCongelados, adelantos, tiendaOverrides]);

  // Lookup store_cod → adelanto (para marcar la etiqueta de esa tienda).
  const adelantoByCod = useMemo(() => {
    const m: Record<string, { fecha_despacho: string | null }> = {};
    for (const a of adelantos) m[a.store_cod] = { fecha_despacho: a.fecha_despacho };
    return m;
  }, [adelantos]);

  // Resizable divider logic is handled by useResizablePanel hook above.

  useEffect(() => {
    setStoresLoading(true);
    // refreshCalendario busts both in-memory and localStorage cache → always gets live Sheets data
    refreshCalendario()
      .then(cal => { applyCalendar(cal); setStoresLoading(false); })
      .catch(() => setStoresLoading(false));
    // Re-apply when admin updates calendar from another tab
    return subscribeToCalendarChanges(applyCalendar);
  }, [applyCalendar]);

  // Si hay tiendas seleccionadas al restaurar sesión, mostrar planilla y siempre recargar ops frescos
  useEffect(() => {
    if (selectedCods.length > 0) {
      setPanelView('planilla');
      void fetchBatchOps(selectedCods); // un solo request en vez de N paralelos
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allGroups = useMemo((): PickerGroup[] => {
    const result: PickerGroup[] = [];
    for (const cod of selectedCods) {
      const ops = opsMap[cod] ?? [];
      // Group by normalized (lowercase/trim) name → same picker regardless of casing entered on each desktop
      const map: Record<string, { displayKey: string; ops: PickingOperation[] }> = {};
      for (const op of ops) {
        const raw        = op.responsible || 'Sin asignar';
        const normalized = raw.toLowerCase().trim();
        if (!map[normalized]) map[normalized] = { displayKey: raw, ops: [] };
        map[normalized].ops.push(op);
      }
      // Modo manual (Odoo apagado, o un encargado fuera de Odoo): sin operación de Odoo detrás,
      // pero SÍ con pallets reales en picking_pallets — `addPalletSlot` (más abajo) ya es 100%
      // manual, así que basta con levantar la tarjeta desde los pallets ya guardados en vez de
      // desde `opsMap`. Sin tabla ni endpoint nuevo: `palletSlots` ya excluye lo creado en
      // Bodega (ver loadPalletSlots), así que todo lo que llega acá es de Picking.
      const prefix = `${cod}__`;
      for (const slot of palletSlots) {
        if (slot.store_cod !== cod || !slot.state_key.startsWith(prefix)) continue;
        const normalized = slot.state_key.slice(prefix.length);
        if (!map[normalized]) {
          // `key` (el badge/placeholder) tiene que quedar CONGELADO desde la creación — ni
          // `slot.picker_label` ni `pickerDisplayNames` sirven de fuente acá porque los edita
          // en vivo, carácter a carácter, el campo "Nombre del picker" (onNameChange/
          // renamePickerSlots): usarlos hacía que el badge (y su placeholder) fueran mostrando
          // "a", "ma", "mar"… mientras alguien escribía, y que si borraba el campo el badge se
          // quedara pegado en lo último tipeado en vez de volver al nombre real. Se deriva del
          // propio `state_key` (inmutable) — mismo criterio que un `group.key` de Odoo, que
          // tampoco cambia si se edita el nombre mostrado.
          const nombreEstable = normalized.replace(/\b\p{L}/gu, c => c.toUpperCase());
          map[normalized] = { displayKey: nombreEstable, ops: [] };
        }
      }
      for (const [normKey, { displayKey, ops: gOps }] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
        result.push({ key: displayKey, storeCod: cod, stateKey: `${cod}__${normKey}`, operations: gOps });
      }
    }
    return result;
  }, [selectedCods, opsMap, palletSlots]);

  // NOTA: el progreso de Odoo para el semáforo de Bodega lo calcula ahora UNA sola fuente
  // —el refresco batch del servidor en GET /api/picking-store-progress, que atribuye los
  // pickings por tienda con `resolveStoreCode` sobre TODAS las tiendas—. Antes PickingScreen
  // también posteaba un conteo (total = ops cargadas por el picker), calculado con un criterio
  // distinto; los dos escritores se pisaban con totales diferentes y el semáforo saltaba entre
  // verde y naranja al cambiar de pestaña. Con fuente única el estado es estable (refresco ≤60s).

  const handleToggleStore = useCallback(async (cod: string) => {
    const isSelected = selectedCods.includes(cod);
    if (isSelected) {
      setSelectedCods(prev => prev.filter(c => c !== cod));
    } else {
      setSelectedCods(prev => [...prev, cod]);
      if (!opsMap[cod]) await fetchOpsForStore(cod);
    }
    setPanelView('planilla');
  }, [selectedCods, opsMap, fetchOpsForStore]);

  // Grupos cuyo texto de "Documento origen" trae una fecha distinta a hoy (typo o plantilla
  // vieja en Odoo). YA vienen filtrados por scheduled_date=hoy (campo estructurado, confiable)
  // al traerlos de Odoo, así que esta fecha de texto libre es solo una señal de advertencia —
  // no se ocultan, se muestran igual con un aviso para que el supervisor decida.
  // Conservador: si la fecha está vacía/ilegible NO se marca como advertencia (beneficio de la duda).
  const otroDiaGroupKeys = useMemo(() => {
    const d = new Date();
    const todayDMY = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const validDate = (s: string) => /^\d{2}\/\d{2}\/\d{4}$/.test(s);
    const keys = new Set<string>();
    for (const g of allGroups) {
      if (g.operations.length > 0 && g.operations.every(o => validDate(o.originDate) && o.originDate !== todayDMY))
        keys.add(g.stateKey);
    }
    return keys;
  }, [allGroups]);

  const otroDiaCount = useMemo(
    () => allGroups.filter(g => otroDiaGroupKeys.has(g.stateKey)).length,
    [allGroups, otroDiaGroupKeys],
  );

  const filteredGroups = useMemo(() => {
    // [P6] Cada tab ve solo lo suyo: Congelados muestra únicamente las ops congeladas, y Seco las
    // excluye. Antes 'Todas' mezclaba ambas y los conteos se cruzaban entre tabs.
    //
    // Modo manual: un grupo creado a mano nunca tiene "operations" de Odoo (siempre `[]`), así que
    // un filtro de `operations.length > 0` lo hacía desaparecer. Cuando no hay operaciones se
    // decide por sus pallets reales de picking_pallets, tanto para el tab como para la sección.
    const base = allGroups
      .map(g => {
        const congeladas = new Set(filtrarOpsPorSeccion(g.operations, 'congelados'));
        return { ...g, operations: g.operations.filter(op => congeladas.has(op) === esTabCongelados) };
      })
      .filter(g => {
        if (g.operations.length > 0) return true;
        const slots = slotsByStateKey[g.stateKey] ?? [];
        return slots.some(s => (seccionDeSlot(s) === 'congelados') === esTabCongelados);
      });
    if (esTabCongelados || sectionFilter === 'all') return base;
    // Recorta las operaciones de cada grupo a la sección activa y descarta los grupos sin ops
    // en ella. Antes era un test de inclusión (dejaba ops de otras secciones dentro de un picker
    // mixto → se mostraba/contaba la suma cruzada). Ahora cada sección es independiente.
    return base
      .map(g => ({ ...g, operations: filtrarOpsPorSeccion(g.operations, sectionFilter) }))
      .filter(g => {
        if (g.operations.length > 0) return true;
        const slots = slotsByStateKey[g.stateKey] ?? [];
        return slots.length > 0 && slots.some(s => seccionDeSlot(s) === sectionFilter);
      });
  }, [allGroups, sectionFilter, esTabCongelados, slotsByStateKey]);

  // Grupos de TODAS las secciones por tienda — para calcular offsets globales
  const allGroupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of allGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [allGroups]);

  const groupedByStore = useMemo(() => {
    const map: Record<string, PickerGroup[]> = {};
    for (const g of filteredGroups) { if (!map[g.storeCod]) map[g.storeCod] = []; map[g.storeCod].push(g); }
    return map;
  }, [filteredGroups]);

  // Guarda seq y canonical_id en picking_pallets al momento de imprimir
  // Solo actualiza slots que aún no tienen canonical_id (idempotente en re-impresión)
  // `soloIds`: al imprimir una selección, SOLO esos pallets. El código de barras marca "ya impreso"
  // (ver reimpresion.ts): asignárselo a los que no se imprimieron los haría salir como COPIA en su
  // primera impresión de verdad.
  const assignCanonicalIds = useCallback(async (groups: PickerGroup[], soloIds?: Set<number>) => {
    const date = todayISO();
    const slots: { id: number; seq: number; canonical_id: string }[] = [];
    for (const group of groups) {
      const groupSlots = slotsByStateKey[group.stateKey] ?? [];
      for (const slot of groupSlots) {
        if (!slot.id || slot.id < 0) continue;  // saltar slots temporales (aún no persistidos)
        if (soloIds && !soloIds.has(slot.id)) continue;
        const pNum = palletNumsBySlotId[slot.id];
        if (pNum === undefined) continue;
        const tipo = (slot.tipo as PickerType) ?? 'P';
        slots.push({
          id:           slot.id,
          seq:          pNum,
          canonical_id: buildCanonicalId(tipo, pNum, group.storeCod, date),
        });
      }
    }
    if (!slots.length) return;
    await pickingFetch('/api/picking-pallets', {
      method: 'PATCH',
      body:   JSON.stringify({ slots }),
    }).catch(() => {});
  }, [slotsByStateKey, palletNumsBySlotId, pickingFetch]);

  const recordPrints = useCallback(async (groups: PickerGroup[], section: Seccion | null = null): Promise<number> => {
    const date = todayISO();
    // Slots de un grupo, recortados a la sección si se imprime una card en un filtro activo.
    const slotsOf = (stateKey: string) => {
      const all = slotsByStateKey[stateKey] ?? [];
      return section == null ? all : all.filter(s => seccionDeSlot(s) === section);
    };
    const candidates = groups.filter(group => slotsOf(group.stateKey).length > 0);
    if (candidates.length === 0) return 0;

    const results = await Promise.allSettled(
      candidates.map(group => {
        const pallets     = slotsOf(group.stateKey).length;
        // El `picker_label` del slot como respaldo: si el nombre en sesión se perdió —les pasó a
        // 25 encargados cuando el batch pisaba esa fila— el slot todavía lo tiene. Mismo orden
        // que ya usaba la tarjeta al mostrarlo.
        const pickerLabel = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key)
          || slotsOf(group.stateKey)[0]?.picker_label || group.key;
        // Tipo dominante entre los slots (de la sección) del picker (evita perder grupos mixtos P+B)
        const slotTipos = slotsOf(group.stateKey).map(s => s.tipo || 'P');
        const tipo = slotTipos.length === 0 ? 'P' :
          slotTipos.reduce((acc, t) =>
            slotTipos.filter(x => x === t).length > slotTipos.filter(x => x === acc).length ? t : acc
          , slotTipos[0]);
        // BATCH (Transferir Agrupación): de Odoo si hay, o el que se ingresó a mano (pickerBatch).
        const batch = group.operations.find(o => o.batch)?.batch || (pickerBatch[group.stateKey] ? `BATCH/${pickerBatch[group.stateKey]}` : '');
        return pickingFetch('/api/picking-prints', {
          method: 'POST',
          body: JSON.stringify({ stateKey: group.stateKey, pickerLabel, pallets, tipo, date, printedByName: profile?.full_name ?? '', batch }),
        }).then(res => {
          if (!res.ok) throw new Error(`picking-prints ${res.status}`);
          return { storeCod: group.storeCod, pickerLabel, pallets, tipo, printedAt: new Date().toISOString() } satisfies SupervisorPrint;
        });
      })
    );

    const newPrints = results
      .filter((r): r is PromiseFulfilledResult<SupervisorPrint> => r.status === 'fulfilled')
      .map(r => r.value);
    const failures = results.filter(r => r.status === 'rejected').length;

    if (failures > 0) {
      console.error(`[picking] ${failures} registro(s) de impresión no guardados`);
      // Encolar prints fallidos para reintentar al reconectar
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const group     = candidates[i];
          const pallets   = slotsOf(group.stateKey).length;
          const pickerLabel = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key)
            || slotsOf(group.stateKey)[0]?.picker_label || group.key;
          const slotTipos = slotsOf(group.stateKey).map(s => s.tipo || 'P');
          const tipo = slotTipos.length === 0 ? 'P' :
            slotTipos.reduce((acc, t) =>
              slotTipos.filter(x => x === t).length > slotTipos.filter(x => x === acc).length ? t : acc
            , slotTipos[0]);
          const batch = group.operations.find(o => o.batch)?.batch || (pickerBatch[group.stateKey] ? `BATCH/${pickerBatch[group.stateKey]}` : '');
          enqueuePickingItem({ op: 'print', stateKey: group.stateKey, pickerLabel, pallets, tipo, date, printedByName: profile?.full_name ?? '', batch });
        }
      });
    }

    if (newPrints.length > 0 && channelRef.current) {
      const updated: SupervisorPresence = {
        ...presenceRef.current,
        recentPrints: [...newPrints, ...presenceRef.current.recentPrints].slice(0, 8),
        lastActive:   new Date().toISOString(),
      };
      presenceRef.current = updated;
      void channelRef.current.track(updated);
    }

    // Recargar los registros propios: la presencia solo se transmite a OTROS supervisores,
    // así que sin esto el usuario actual no vería sus propias impresiones/reimpresiones en
    // Actividad (sí las vería un compañero que recarga). El reload lo hace determinista.
    void loadPrintRecords();

    return failures;
  }, [pickerDisplayNames, getCanonicalName, pickingFetch, slotsByStateKey, isOnline, loadPrintRecords, pickerBatch]);

  // Imprime y registra SOLO los labels de un picker específico.
  // Evita que un supervisor "reclame" los pickers de otro al hacer click en su propia card.
  const printGroupLabels = useCallback(async (group: PickerGroup) => {
    // Bloquear impresión si el grupo no tiene slots PERSISTIDOS (id real > 0).
    // Evita el Caso 1: registrar un print sin pallet real → queda en Actividad pero
    // sin slot en Monitoreo/Bodega y sin código.
    const persisted = (slotsByStateKey[group.stateKey] ?? []).filter(s => (s.id ?? 0) > 0).length;
    if (persisted === 0) {
      showToast('⚠ Agrega al menos un pallet (con conexión) antes de imprimir', '#D97706');
      return;
    }
    setSelectionPrint(null);
    setPrintOnlyStore(null);
    setPrintOnlyStateKey(group.stateKey);
    // Si hay filtro de sección activo, imprimir SOLO esa sección de la card (consistente con su contador).
    const section: Seccion | null = sectionFilter === 'all' ? null : (sectionFilter as Seccion);
    setPrintOnlySection(section);
    setSlotsCopia(slotsYaImpresos(palletSlots));
    // 1) Asignar seq + canonical ANTES de registrar/imprimir → la etiqueta lleva código y queda en BD.
    await assignCanonicalIds([group]);
    // 2) Registrar la impresión y disparar el print del navegador.
    pendingPrintRef.current = recordPrints([group], section);
    setDoPrint(true);
  }, [slotsByStateKey, showToast, recordPrints, assignCanonicalIds, sectionFilter, palletSlots]);

  const printStoreLabels = useCallback((cod: string) => {
    setSlotsCopia(slotsYaImpresos(palletSlots));
    setSelectionPrint(null);
    setPrintOnlyStateKey(null);
    setPrintOnlySection(null);
    setPrintOnlyStore(cod);
    const groups = groupedByStore[cod] ?? [];
    pendingPrintRef.current = recordPrints(groups);
    void assignCanonicalIds(groups);
    setDoPrint(true);
  }, [groupedByStore, recordPrints, assignCanonicalIds, palletSlots]);

  const printSelectedLabels = useCallback((stateKey: string, slotIds: Set<number>) => {
    if (slotIds.size === 0) return;             // nunca imprimir "todas" por una selección vacía
    setSlotsCopia(slotsYaImpresos(palletSlots));
    setSelectionPrint({ stateKey, slotIds });
    setPrintOnlyStore(null);
    setPrintOnlyStateKey(null);
    setPrintOnlySection(null); // la selección ya está acotada por ids
    setDoPrint(true);
    // Código de barras SOLO para los seleccionados (el comentario de antes lo decía; el código no).
    const allGroups = Object.values(groupedByStore).flat().filter(g => g.stateKey === stateKey);
    void assignCanonicalIds(allGroups, slotIds);
  }, [groupedByStore, assignCanonicalIds, palletSlots]);

  const printAll = useCallback(() => {
    setSlotsCopia(slotsYaImpresos(palletSlots));
    setPrintOnlyStore(null);
    setPrintOnlyStateKey(null);
    setPrintOnlySection(null);
    pendingPrintRef.current = Promise.all(
      selectedCods.map(cod => recordPrints(groupedByStore[cod] ?? []))
    ).then(counts => counts.reduce((s, n) => s + n, 0));
    for (const cod of selectedCods) void assignCanonicalIds(groupedByStore[cod] ?? []);
    setDoPrint(true);
  }, [selectedCods, groupedByStore, recordPrints, assignCanonicalIds, palletSlots]);

  const todayLabel     = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  // Datos de impresión — una etiqueta por slot, sección activa del supervisor
  const printableLabels = useMemo(() => {
    type LabelData = {
      value: string; palletNum: number; total: number;
      storeCod: string; pickerLabel: string; responsibleKey: string;
      allCategories: string[]; totalPickers: number; stateKey: string; tipo: string; slotId: number;
      canonicalId: string; footerExtra?: string;
      batch?: string; finishedAt?: string | null;
      secSlot: Seccion | null; // sección del pallet (para imprimir SOLO una sección de una card)
    };
    const labels: LabelData[] = [];
    for (const cod of selectedCods) {
      const storeGroups    = groupedByStore[cod] ?? [];       // respects section filter
      const allStoreGroups = allGroupedByStore[cod] ?? [];    // for totalPickers count
      const storeSlots     = palletSlots.filter(s => s.store_cod === cod);
      if (storeSlots.length === 0 || storeGroups.length === 0) continue;
      // Pre-compute total per tipo for this store (P count, C count, B count independently).
      // Excluye "Sin asignar" para que el total de la etiqueta ("X de Y") coincida con la numeración (P6).
      const totalByTipo: Record<string, number> = {};
      for (const s of storeSlots) {
        if (isSinAsignar(s.picker_label)) continue;
        totalByTipo[s.tipo || 'P'] = (totalByTipo[s.tipo || 'P'] ?? 0) + 1;
      }

      const firstSlotTime: Record<string, number> = {};
      for (const s of storeSlots) {
        const t = new Date(s.created_at).getTime();
        if (firstSlotTime[s.state_key] === undefined || t < firstSlotTime[s.state_key])
          firstSlotTime[s.state_key] = t;
      }
      const sortedGroups = [...storeGroups].sort((a, b) =>
        (firstSlotTime[a.stateKey] ?? Infinity) - (firstSlotTime[b.stateKey] ?? Infinity)
      );

      for (const group of sortedGroups) {
        const groupSlots = storeSlots.filter(s => s.state_key === group.stateKey);
        if (!groupSlots.length) continue;
        // Modo manual: sin operaciones de Odoo no hay `op.categories` de dónde sacar el tipo de
        // carga — antes la etiqueta impresa salía siempre sin categoría para un encargado
        // manual. Se deriva de la sección real de sus pallets (la elegida al crearlo).
        const allCategories = group.operations.length > 0
          ? [...new Set(group.operations.flatMap(o => o.categories))]
          : categoriasDeSlotsManual(groupSlots);
        const refs  = group.operations.map(o => o.name).join('+');
        const cats  = allCategories.join(',');
        // Prioridad: 1) nombre del supervisor en esta sesión, 2) canónico de Supabase, 3) label del slot (histórico), 4) clave Odoo
        const label = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || groupSlots[0]?.picker_label || group.key;
        // Batch (Transferir Agrupación): de Odoo si hay, o el que se ingresó a mano (pickerBatch).
        const batch = group.operations.find(o => o.batch)?.batch ?? (pickerBatch[group.stateKey] ? `BATCH/${pickerBatch[group.stateKey]}` : undefined);
        // Hora de término: solo si TODAS las operaciones del grupo ya cerraron (state 'done') —
        // si alguna sigue abierta, no se imprime un "término" prematuro/engañoso. Entre las
        // operaciones cerradas, la más reciente (comparación lexicográfica válida en
        // 'YYYY-MM-DD HH:MM:SS') marca cuándo terminó el grupo completo.
        const allOpsDone = group.operations.length > 0 && group.operations.every(o => o.state === 'done');
        const finishedAt = allOpsDone
          ? group.operations.reduce<string | null>((max, o) => (o.dateDone && (!max || o.dateDone > max) ? o.dateDone : max), null)
          : null;
        for (const slot of groupSlots) {
          const pNum  = palletNumsBySlotId[slot.id];
          if (pNum === undefined) continue; // slot sin numerar (bucket "Sin asignar") — no se imprime [P6]
          const tipo  = (slot.tipo as PickerType) ?? 'P';
          const total = totalByTipo[tipo] ?? 1;
          // [Req 1] Un slot de chocolate (CH, o pallet con contenido chocolate) muestra "Chocolate"
          // como contenido en la etiqueta, aunque las categorías del grupo no lo incluyan.
          const esChoc   = tipo === 'CH' || String((slot as { contenido?: string }).contenido ?? '').toLowerCase().includes('chocolate');
          const slotCats = esChoc && !allCategories.some(c => /chocolate/i.test(c)) ? ['Chocolate', ...allCategories] : allCategories;
          labels.push({
            value: `${group.storeCod};${sanitizeForBarcode(label)};${refs};${tipo}${pNum};${cats}`,
            palletNum: pNum,
            total,
            storeCod: group.storeCod,
            pickerLabel: label,
            responsibleKey: group.key,
            allCategories: slotCats,
            totalPickers: allStoreGroups.length,
            stateKey: group.stateKey,
            tipo,
            slotId: slot.id,
            canonicalId: buildCanonicalId(tipo, pNum, group.storeCod, todayISO()),
            footerExtra: slot.refs || undefined,
            batch,
            finishedAt,
            secSlot: seccionDeSlot(slot),
          });
        }
      }
    }
    return labels;
  }, [selectedCods, groupedByStore, allGroupedByStore, palletSlots, palletNumsBySlotId, pickerDisplayNames, getCanonicalName, pickerBatch]);

  const hasBarcodes = printableLabels.length > 0;

  return (
    <>
    <style dangerouslySetInnerHTML={{ __html:
      '@media print{' +
      '@page{size:landscape;margin:0}' +
      'html,body{width:100%;height:100%;margin:0;padding:0}' +
      // El portal renderiza #picking-print-root como hijo directo de body.
      // body>* oculta todo; el selector de ID tiene mayor especificidad y gana.
      'body>*{display:none!important}' +
      '#picking-print-root{display:block!important;width:100%;height:auto}' +
      '.picking-label{display:flex!important;flex-direction:column!important;' +
      'width:100vw!important;height:100vh!important;max-width:100vw!important;' +
      'border-radius:0!important;margin:0!important;border:none!important;' +
      'padding:8mm!important;box-sizing:border-box!important;' +
      'break-after:page;page-break-after:always;overflow:hidden}' +
      '.picking-label>div{flex:1!important;display:flex!important;flex-direction:column!important;' +
      'height:100%!important;min-height:0!important;padding:0!important}' +
      '.picking-label:last-child{break-after:avoid;page-break-after:avoid}}'
    }} />

    {/* Portal a document.body — escapa AppShell (overflow:hidden + transform:translateZ)
        y permite que break-after:page funcione con múltiples etiquetas */}
    {mounted && createPortal(
      <div id="picking-print-root" style={{ display: 'none' }}>
        {(selectionPrint
          ? etiquetasDeLaSeleccion(printableLabels, selectionPrint)
          : printOnlyStateKey
            ? printableLabels.filter(l => l.stateKey === printOnlyStateKey && (printOnlySection == null || l.secSlot === printOnlySection))
            : printOnlyStore
              ? printableLabels.filter(l => l.storeCod === printOnlyStore)
              : printableLabels
        ).map((label, idx) => (
          <BarcodeCard key={idx} {...label} labelConfig={labelConfig} copia={slotsCopia.has(label.slotId)} />
        ))}
      </div>,
      document.body
    )}

    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#F5F6FA]">

      {/* ── Header ── */}
      <div className="mobile-menu-safe flex items-center gap-3 px-4 py-2.5 flex-shrink-0 print:hidden bg-white"
        style={{ borderBottom: '1px solid var(--color-border)' }}>
        {/* Solo navegación interna en mobile (planilla → lista de tiendas). El "Inicio"
            se quitó: el sidebar ya provee la navegación a casa. */}
        {panelView === 'planilla' && (
          <button className="lg:hidden border cursor-pointer text-slate-500 hover:text-slate-800 text-[13px] font-medium px-2.5 py-1.5 rounded"
            style={{ background: '#F1F5F9', borderColor: 'var(--color-border)' }}
            onClick={() => setPanelView('stores')}>
            ← Tiendas
          </button>
        )}

        <div className="flex-1 min-w-0">
          {selectedCods.length > 0 ? (
            <div className="text-[13px] font-semibold text-slate-700 truncate">{selectedCods.join(' · ')}</div>
          ) : (
            <div className="text-[13px] font-semibold text-slate-700 truncate">
              {profile?.full_name ?? ''} <span className="font-normal text-slate-400">· {todayLabel}</span>
            </div>
          )}
        </div>

        {selectedCods.length > 0 && lastRefresh && (
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0">
            <RefreshCw size={11} />
            {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

      </div>

      {/* ── Alerta cambios calendario ── */}
      {notifCount > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2.5 print:hidden"
          style={{ background: 'rgba(255,149,0,0.10)', borderBottom: '1px solid rgba(255,149,0,0.25)' }}>
          <Bell size={14} className="text-amber-600 shrink-0" />
          <div className="flex-1 text-[12px] text-amber-700 font-medium">
            Control Interno realizó {notifCount} cambio{notifCount !== 1 ? 's' : ''} al calendario
          </div>
          <button
            onClick={() => router.push('/despacho/config-tiendas')}
            className="text-[12px] font-semibold px-3 py-1 rounded shrink-0 cursor-pointer border"
            style={{ borderColor: 'rgba(217,119,6,0.35)', color: '#92400E', background: 'transparent' }}>
            Revisar
          </button>
        </div>
      )}

      {/* ── Split body ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT PANEL */}
        <div
          className={[
            'flex flex-col bg-white shrink-0 overflow-hidden',
            panelView === 'planilla' ? 'hidden lg:flex' : 'flex',
            isDesktop ? '' : 'w-full border-r border-border',
          ].join(' ')}
          style={isDesktop ? { width: selectorColapsado ? 0 : leftWidth } : undefined}
          aria-hidden={selectorColapsado || undefined}
          inert={selectorColapsado || undefined}
        >
          <StoreListPanel
            selectedCods={selectedCods}
            loadingCods={loadingCods}
            errorCods={errorCods}
            opsMap={opsMap}
            todayStores={todayStores}
            storesLoading={storesLoading}
            onToggleStore={handleToggleStore}
            tiendaOverrides={tiendaOverrides}
            onOpenAdelanto={() => setAdelantoDialogOpen(true)}
            onDeleteAdelanto={handleDeleteAdelanto}
          />
        </div>

        {adelantoDialogOpen && (
          <AgregarAdelantoDialog
            date={adelantoTodayISO()}
            creadoPor={profile?.full_name ?? undefined}
            onClose={() => setAdelantoDialogOpen(false)}
            onAdded={loadAdelantos}
          />
        )}

        {/* RESIZE DIVIDER — desktop only */}
        {isDesktop && (
          <div
            role="button"
            tabIndex={0}
            aria-expanded={!selectorColapsado}
            aria-label={selectorColapsado ? 'Mostrar las tiendas' : 'Esconder las tiendas'}
            title={selectorColapsado ? 'Mostrar las tiendas' : 'Arrastra para ajustar · toca para esconder'}
            className="group flex-shrink-0 flex flex-col items-center justify-center gap-1.5 relative select-none z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            style={{ width: selectorColapsado ? 14 : 6, background: 'rgba(0,0,0,0.06)', cursor: selectorColapsado ? 'pointer' : 'col-resize' }}
            onMouseDown={e => { if (selectorColapsado) return; handlePanelMouseDown(e); }}
            onTouchStart={e => { if (selectorColapsado) return; handlePanelTouchStart(e); }}
            onClick={() => setSelectorAbiertoManual(v => !v)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectorAbiertoManual(v => !v); } }}
          >
            <div className="absolute inset-0 group-hover:bg-blue-500/10 transition-colors duration-150" />
            <div className="flex flex-col gap-1 relative z-10 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-[4px] h-[4px] rounded-full" style={{ background: '#94A3B8' }} />
              ))}
            </div>
            <span className="relative z-10 text-[10px] leading-none opacity-50 group-hover:opacity-100 transition-opacity" style={{ color: '#64748B' }} aria-hidden="true">
              {selectorColapsado ? '›' : '‹'}
            </span>
            <div className="flex flex-col gap-1 relative z-10 opacity-40 group-hover:opacity-100 transition-opacity duration-150">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-[4px] h-[4px] rounded-full" style={{ background: '#94A3B8' }} />
              ))}
            </div>
          </div>
        )}

        {/* RIGHT PANEL */}
        <div className={[
          'flex flex-col flex-1 overflow-hidden min-w-0',
          panelView === 'stores' ? 'hidden lg:flex' : 'flex',
        ].join(' ')}>

          {/* Offline banner */}
          {!isOnline && (
            <div className="flex items-center gap-2 px-4 py-2 text-[12px] font-medium text-amber-800 bg-amber-50 border-b border-amber-200 print:hidden flex-shrink-0">
              <AlertTriangle size={13} className="shrink-0" />
              <span>Sin conexión — los cambios no se están guardando</span>
            </div>
          )}

          {/* ── Tab bar ── */}
          <div className="flex flex-shrink-0 print:hidden overflow-x-auto"
            style={{ background: '#fff', borderBottom: '1px solid var(--color-border)' }}>
            {([
              { key: 'monitoreo',     label: 'Seco'        },
              { key: 'congelados',    label: 'Congelados'  },
              { key: 'actividad',     label: 'Actividad'   },
              { key: 'historial',     label: 'Historial'   },
              { key: 'estadisticas',  label: 'Estadísticas'},
              { key: 'configuracion', label: 'Config'      },
              { key: 'calendario',    label: 'Calendario'  },
            ] as { key: typeof rightTab; label: string }[]).map(tab => {
              const active = rightTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setRightTab(tab.key)}
                  className="relative flex-1 py-2.5 text-[11px] font-medium cursor-pointer transition-colors border-none bg-transparent whitespace-nowrap px-3"
                  style={{
                    color: active ? '#1A2550' : '#64748B',
                    borderBottom: active ? '2px solid var(--color-info)' : '2px solid transparent',
                  }}>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── Tab content: Estadísticas ── */}
          {rightTab === 'estadisticas' && (
            <StatsTab hasOdoo={hasOdoo} odooDesactivado={odooDesactivado} canonicalNames={canonicalNames} />
          )}

          {/* ── Tab content: Actividad ── */}
          {rightTab === 'actividad' && (
            <div className="flex-1 overflow-hidden min-h-0">
              <ActivityTab
                live={{ printRecords, nameChanges, palletSlots, eventos: pickingEventos, supervisors: otherSupervisors }}
                today={todayISO()}
              />
            </div>
          )}

          {/* ── Tab content: Historial ── */}
          {rightTab === 'historial' && <HistorialTab allGroups={allGroups} nameChanges={nameChanges} records={printRecords} palletSlots={palletSlots} onRefresh={loadPrintRecords} />}

          {/* ── Tab content: Configuración ── */}
          {rightTab === 'configuracion' && (
            <ConfigTab
              labelConfig={labelConfig}
              onLabelConfigChange={setLabelConfig}
              canonicalNames={canonicalNames}
              onCanonicalNamesChange={handleCanonicalNamesChange}
              colsPerRow={colsPerRow}
              onColsPerRowChange={handleColsPerRowChange}
              currentUserName={profile?.full_name ?? ''}
            />
          )}

          {/* ── Tab content: Calendario (general, solo lectura) ──
             Sigue la sección activa: en Congelados muestra el Calendario de Congelados;
             en el resto (Seco/Aseo-Comida/Hogar/Chocolates/Todas), el Central. */}
          {rightTab === 'calendario' && (
            <div className="flex-1 overflow-y-auto min-h-0 p-3">
              <div className="flex gap-1.5 mb-3 print:hidden" role="group" aria-label="Calendario a mostrar">
                {([['despacho', 'Central'], ['congelados', 'Congelados']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setCalFuente(k)} aria-pressed={calFuente === k}
                    className="px-3.5 py-1.5 rounded text-[12px] font-medium cursor-pointer transition-all border"
                    style={{
                      background:  calFuente === k ? 'var(--color-info)' : '#fff',
                      color:       calFuente === k ? '#fff' : '#64748B',
                      borderColor: calFuente === k ? 'var(--color-info)' : 'var(--color-border)',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <CalendarioColumnas readOnly forceGeneral source={calFuente} />
            </div>
          )}

          {/* ── Tab content: Monitoreo ── */}
          {(rightTab === 'monitoreo' || rightTab === 'congelados') && (selectedCods.length === 0 ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex flex-col items-center justify-center text-center px-8 py-12">
                <div className="mb-4 text-slate-200"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                <div className="text-[16px] font-semibold text-slate-500 mb-1.5">Selecciona una o más tiendas</div>
                <div className="text-[13px] text-slate-400 max-w-sm mx-auto">
                  Elige las tiendas del panel izquierdo para gestionar sus operaciones.
                </div>
                {!hasOdoo && (() => {
                  // [M-07] Informativo, no error: el sistema está bien, Odoo está fuera. Mismo
                  // texto que Estadísticas, cambiando solo qué se pierde acá (ver avisoOdoo.ts).
                  const a = avisoOdoo(motivoOdoo(odooDesactivado), 'no se cargan las operaciones del día');
                  return (
                    <div className="mt-6 max-w-sm rounded-xl px-4 py-3 text-left inline-block"
                      style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                      <div className="text-[14px] font-bold text-slate-700">{a.titulo}</div>
                      <div className="text-[13px] text-slate-500 mt-0.5 leading-snug">{a.detalle}</div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
            <div className="px-4 pb-10">

              {/* Filtro de sección + columnas por fila */}
              <div className="mt-4 mb-3 print:hidden flex flex-wrap items-center gap-4">
                <div>
                  <div className="text-[11px] font-medium text-slate-400 mb-2">Sección</div>
                  <div className="flex gap-1.5">
                    {([
                      { key: 'all',         label: 'Todas' },
                      { key: 'aseo-comida', label: 'Aseo y Comida' },
                      { key: 'hogar',       label: 'Hogar' },
                      { key: 'chocolates',  label: 'Chocolates' },
            ] as { key: SectionFilter; label: string }[])
              // Cada pestaña ofrece lo suyo: Congelados solo "Todas"; Seco sus cuatro secciones, sin
              // "Congelados" (que tiene su propia pestaña — antes aparecía en los dos lados).
              .filter(({ key }) => seccionesDeLaPestana(esTabCongelados).includes(key))
              .map(({ key, label }) => (
                      <button key={key} onClick={() => setSectionFilter(key)}
                        className="px-3.5 py-1.5 rounded text-[12px] font-medium cursor-pointer transition-all border"
                        style={{
                          background: sectionFilter === key ? 'var(--color-info)' : '#fff',
                          color:      sectionFilter === key ? '#fff'    : '#64748B',
                          borderColor: sectionFilter === key ? 'var(--color-info)' : 'var(--color-border)',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ml-auto">
                  {hasBarcodes && (
                    <button onClick={printAll}
                      className="flex items-center gap-2 border-none cursor-pointer font-semibold text-[13px] px-3.5 py-1.5 rounded"
                      style={{ background: '#2563EB', color: '#fff' }}>
                      <Printer size={14} />
                      Imprimir {printableLabels.length}
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4 flex items-center justify-between print:hidden">
                <div>
                  <div className="text-[14px] font-semibold text-text-2">
                    {filteredGroups.length === 0
                      ? 'Sin operaciones de Abastecimiento hoy'
                      : `${filteredGroups.length} picker${filteredGroups.length !== 1 ? 's' : ''} · ${selectedCods.length} tienda${selectedCods.length !== 1 ? 's' : ''}`}
                  </div>
                  {otroDiaCount > 0 && (
                    <div className="text-[11px] text-amber-600 font-medium mt-0.5">
                      ⚠ {otroDiaCount} movimiento{otroDiaCount !== 1 ? 's' : ''} con fecha de origen distinta a hoy — revisa antes de trabajar{otroDiaCount !== 1 ? 'los' : 'lo'}
                    </div>
                  )}
                  {lastRefresh && (
                    <div className="text-[13px] text-text-3">
                      Actualizado: {lastRefresh.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void fetchBatchOps(selectedCods)}
                  disabled={loadingCods.length > 0}
                  className="flex items-center gap-1.5 text-[13px] font-medium cursor-pointer border rounded px-3 py-1.5 transition-all disabled:opacity-40"
                  style={{ borderColor: 'var(--color-border)', color: '#64748B', background: '#fff' }}>
                  <RefreshCw size={12} className={loadingCods.length > 0 ? 'animate-spin' : ''} />
                  {loadingCods.length > 0 ? 'Cargando…' : 'Actualizar'}
                </button>
              </div>

              {/* Sugerencias del datalist "Encargado manual" — una sola vez, no por tienda */}
              <datalist id="picking-nombres-conocidos">
                {nombresConocidos.map(n => <option key={n} value={n} />)}
              </datalist>

              {selectedCods.map(cod => {
                const storeGroups = groupedByStore[cod] ?? [];
                const isLoading   = loadingCods.includes(cod);
                const ops         = opsMap[cod] ?? [];
                // Solo pickeables (assigned/partially_available/done): un 'confirmed'/'waiting'
                // sin stock (duplicado/backorder) no debe restar completitud a la tienda.
                const totalOps = ops.filter(o => isPickeableState(o.state)).length;
                const doneOps = ops.filter(o => o.state === 'done').length;
                const storeStatus: 'none' | 'partial' | 'complete' =
                  totalOps === 0 ? 'none' : doneOps === totalOps ? 'complete' : 'partial';
                return (
                  <section key={cod} aria-label={`Tienda ${cod} — ${nameFor(cod)}`}
                    className="mb-6 rounded-xl"
                    style={{ border: '1px solid var(--color-border)', borderTop: '3px solid #1E40AF', background: '#F8FAFC' }}>
                    {/* Header sticky: se fija arriba mientras se hace scroll dentro de esta tienda,
                        y es empujado por el header sticky de la siguiente (patrón CSS puro). */}
                    <div className="sticky top-0 z-20 flex items-center gap-3 px-3 py-2.5 print:static print:mb-2 flex-wrap"
                      style={{ background: '#F8FAFC', borderBottom: '1px solid var(--color-border)', borderTopLeftRadius: 11, borderTopRightRadius: 11 }}>
                      <span className="font-mono text-[13px] font-semibold px-2 py-0.5 rounded" style={{ background: '#F1F5F9', color: '#475569' }}>{cod}</span>
                      <span className="text-[18px] font-semibold" style={{ color: '#0F172A' }}>{nameFor(cod)}</span>
                      {(() => {
                        const tp = tipoFor(cod);
                        if (!tp.label || tp.label === 'Otro') return null;
                        return (
                          <span className="text-[11px] font-bold rounded"
                            style={{ color: tp.color, background: `${tp.color}1A`, border: `1px solid ${tp.color}40`, padding: '2px 9px' }}>
                            {tp.label.replace(' Center', '')}
                          </span>
                        );
                      })()}
                      {storeStatus === 'complete' && (
                        <span className="text-[13px] font-bold px-3 py-0.5 rounded"
                          style={{ background: 'rgba(22,163,74,0.12)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }}>
                          ✓ Todo realizado
                        </span>
                      )}
                      {storeStatus === 'partial' && (
                        <span className="text-[13px] font-bold px-3 py-0.5 rounded"
                          style={{ background: 'rgba(234,179,8,0.12)', color: '#D97706', border: '1px solid rgba(234,179,8,0.3)' }}>
                          {doneOps}/{totalOps} ops
                        </span>
                      )}
                      {isLoading && <span className="text-[14px] text-text-3 font-medium">Cargando…</span>}
                      {!isLoading && storeGroups.length === 0 && (
                        <span className="text-[14px] text-text-3 font-medium">Sin operaciones de Abastecimiento hoy</span>
                      )}
                      {/* Acciones de tienda: actualizar todo (batch, 1 solo request) + imprimir */}
                      <div className="ml-auto flex items-center gap-2 print:hidden">
                        <button onClick={() => { const sec: SectionFilter = esTabCongelados ? 'congelados' : sectionFilter; setAddingManualCod(addingManualCod === cod ? null : cod); setManualName(''); setManualBatch(''); setManualSeccion(sec); setManualTipo(primeraUnidadPorDefecto(sec)); }}
                          className="text-[13px] font-medium px-3 py-1.5 rounded cursor-pointer transition-all flex items-center gap-1.5"
                          style={{ border: '1px solid var(--color-border)', color: '#64748B', background: '#fff' }}>
                          <UserPlus size={13} /> Encargado manual
                        </button>
                        {ops.length > 0 && (
                          <button onClick={() => void refreshAllOps(ops, cod)}
                            disabled={refreshingStoreCod === cod}
                            className="text-[13px] font-medium px-3 py-1.5 rounded cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-50"
                            style={{ border: '1px solid var(--color-border)', color: '#64748B', background: '#fff' }}>
                            <RefreshCw size={13} className={refreshingStoreCod === cod ? 'animate-spin' : ''} />
                            Actualizar todo
                          </button>
                        )}
                        {(() => {
                          const storeLabels = printableLabels.filter(l => l.storeCod === cod);
                          if (!storeLabels.length) return null;
                          const armado = armedPrintCod === cod;
                          return (
                            <button onClick={() => {
                              if (armedPrintTimerRef.current) clearTimeout(armedPrintTimerRef.current);
                              if (armado) { setArmedPrintCod(null); printStoreLabels(cod); return; }
                              setArmedPrintCod(cod);
                              armedPrintTimerRef.current = setTimeout(() => setArmedPrintCod(null), 2500);
                            }}
                              className="text-[13px] font-bold px-3 py-1.5 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                              style={armado
                                ? { background: '#D97706', color: '#fff', border: '1px solid #D97706' }
                                : { background: 'rgba(217,119,6,0.1)', color: '#D97706', border: '1px solid rgba(217,119,6,0.3)' }}>
                              <Printer size={13} /> {armado ? '¿Confirmar?' : `${cod} · ${storeLabels.length} etiqueta${storeLabels.length !== 1 ? 's' : ''}`}
                            </button>
                          );
                        })()}
                      </div>
                    </div>

                    {addingManualCod === cod && (
                      <div className="px-3 py-2.5 flex items-center gap-2 print:hidden" style={{ borderBottom: '1px solid var(--color-border)', background: '#fff' }}>
                        <input
                          type="text"
                          autoFocus
                          list="picking-nombres-conocidos"
                          value={manualName}
                          onChange={e => setManualName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') crearEncargadoManual(cod); if (e.key === 'Escape') setAddingManualCod(null); }}
                          placeholder="Nombre del encargado (elige uno o escribe uno nuevo)"
                          className="flex-1 text-[13px] px-3 py-1.5 rounded border"
                          style={{ borderColor: 'var(--color-border)', maxWidth: 280 }}
                        />
                        {/* La sección solo se pregunta en "Todas". Dentro de una sección ya se sabe
                            cuál es, así que ese espacio lo ocupa el Batch — el dato que ahí sí falta. */}
                        {pideSeccion(sectionFilter, esTabCongelados) ? (
                          <select
                            value={manualSeccion}
                            onChange={e => {
                              const sec = e.target.value as SectionFilter;
                              setManualSeccion(sec);
                              // Si la unidad elegida no existe en la sección nueva, vuelve a su default.
                              setManualTipo(t => (tiposDeUnidad(false, sec).includes(t) ? t : primeraUnidadPorDefecto(sec)));
                            }}
                            aria-label="Sección del encargado"
                            className="text-[13px] px-2 py-1.5 rounded border cursor-pointer"
                            style={{ borderColor: 'var(--color-border)', color: '#374151', background: '#fff' }}>
                            <option value="all">Todas</option>
                            <option value="aseo-comida">Aseo y Comida</option>
                            <option value="hogar">Hogar</option>
                            <option value="chocolates">Chocolates</option>
                          </select>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            value={manualBatch}
                            onChange={e => setManualBatch(normalizarBatch(e.target.value))}
                            onKeyDown={e => { if (e.key === 'Enter') crearEncargadoManual(cod); if (e.key === 'Escape') setAddingManualCod(null); }}
                            placeholder="Batch (opcional)"
                            aria-label="Número de batch"
                            className="text-[13px] px-2 py-1.5 rounded border"
                            style={{ borderColor: 'var(--color-border)', width: 130 }}
                          />
                        )}
                        {/* Con qué unidad nace. Viene preseleccionada según la sección (Congelados →
                            Caja Cartón, Chocolates → CH, el resto → P) y se puede cambiar. */}
                        <div className="flex items-center gap-1" role="radiogroup" aria-label="Primera unidad del encargado">
                          <span className="text-[11px] text-slate-400 mr-0.5">Nace con</span>
                          {tiposDeUnidad(manualSeccion === 'congelados', manualSeccion).map(t => {
                            const nombre = ({ P: 'Pallet', C: 'Contenedor', B: 'Bulto', CH: 'Chocolate', CC: 'Caja Cartón', CN: 'Caja Negra' } as Record<PickerType, string>)[t];
                            const activo = manualTipo === t;
                            return (
                              <button key={t} type="button" role="radio" aria-checked={activo}
                                onClick={() => setManualTipo(t)} title={nombre}
                                className="text-[12px] font-bold px-2 py-1 rounded cursor-pointer transition-all border"
                                style={{
                                  background:  activo ? 'var(--color-info)' : '#fff',
                                  color:       activo ? '#fff' : '#64748B',
                                  borderColor: activo ? 'var(--color-info)' : 'var(--color-border)',
                                }}>
                                {t}
                              </button>
                            );
                          })}
                        </div>
                        <button onClick={() => crearEncargadoManual(cod)} disabled={!manualName.trim()}
                          className="text-[13px] font-bold px-3 py-1.5 rounded cursor-pointer transition-all disabled:opacity-40"
                          style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.3)' }}>
                          Agregar
                        </button>
                        <button onClick={() => setAddingManualCod(null)}
                          className="text-[13px] font-medium px-3 py-1.5 rounded cursor-pointer transition-all"
                          style={{ color: '#64748B', background: 'transparent', border: 'none' }}>
                          Cancelar
                        </button>
                      </div>
                    )}

                    <div className="px-3 pt-3 pb-4">
                    {/* Sin asignar warning */}
                    {(() => {
                      const sinAsignar = (allGroupedByStore[cod] ?? []).filter(g => g.key === 'Sin asignar');
                      const count = sinAsignar.reduce((s, g) => s + g.operations.length, 0);
                      if (!count) return null;
                      return (
                        <div className="mb-3 print:hidden flex items-center gap-3 bg-white border border-[rgba(220,38,38,0.2)] rounded-xl px-4 py-2.5">
                          <AlertTriangle size={18} className="shrink-0" style={{color:'#DC2626'}} />
                          <div className="flex-1 text-[13px]" style={{ color: '#B91C1C' }}>
                            <span className="font-bold">{count} operación{count !== 1 ? 'es' : ''} sin responsable en Odoo</span>
                            {' '}— no generarán etiqueta. Asigna picker en Odoo y recarga.
                          </div>
                          <button onClick={() => void fetchOpsForStore(cod)}
                            className="text-[13px] font-bold px-3 py-1.5 rounded-lg cursor-pointer shrink-0 transition-all"
                            style={{ background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.25)' }}>
                            ↻ Recargar
                          </button>
                        </div>
                      );
                    })()}

                    {(() => {
                        const allStore = allGroupedByStore[cod] ?? [];

                        const renderCard = (group: PickerGroup, stickerBelow = false) => {
                          // Slots/conteos/números RECORTADOS a la sección activa (o completos en "Todas"),
                          // para que contador, chips e impresión de la card sean independientes por sección.
                          const seccionActiva: Seccion | null = sectionFilter === 'all' ? null : (sectionFilter as Seccion);
                          const allCardSlots = slotsByStateKey[group.stateKey] ?? [];
                          const cardSlots = seccionActiva == null ? allCardSlots : allCardSlots.filter(s => seccionDeSlot(s) === seccionActiva);
                          const nums = seccionActiva == null
                            ? (assignedNumsByStateKey[group.stateKey] ?? [])
                            : cardSlots.map(s => palletNumsBySlotId[s.id]).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
                          const cardPalletsByTipo = seccionActiva == null
                            ? (palletsByTipoAndStateKey[group.stateKey] ?? {})
                            : cardSlots.reduce<Record<string, number>>((acc, s) => { const t = s.tipo || 'P'; acc[t] = (acc[t] ?? 0) + 1; return acc; }, {});
                          // Congelados se determina por las categorías del propio grupo (no por el
                          // filtro de página): en la vista "Todas" cada card debe mostrar SOLO Caja
                          // Cartón/Caja Negra si es de Congelados, sin importar en qué columna cae.
                          // Modo manual: sin operaciones de Odoo, cae a la sección real de sus pallets.
                          const isCongelados = group.operations.length > 0
                            ? group.operations.some(o => o.categories.includes('Congelados'))
                            : allCardSlots.some(s => seccionDeSlot(s) === 'congelados');
                          // Para el CONTENIDO/refs del pallet (que lee Bodega/Sheets) usamos las operaciones
                          // del grupo COMPLETO (no las recortadas por sección), para NO cambiar lo que Bodega
                          // ve/escribe respecto a antes. La sección va aparte, en la columna `section`.
                          const fullOps = (allGroupedByStore[group.storeCod] ?? []).find(g => g.stateKey === group.stateKey)?.operations ?? group.operations;
                          const fullGroupCats = fullOps.length > 0
                            ? [...new Set(fullOps.flatMap(o => o.categories))]
                            : categoriasDeSlotsManual(allCardSlots);
                          const fullIsCongelados = fullOps.length > 0
                            ? fullOps.some(o => o.categories.includes('Congelados'))
                            : allCardSlots.some(s => seccionDeSlot(s) === 'congelados');
                          return (
                            <PickerGroupCard
                              key={group.stateKey}
                              group={group}
                              displayName={pickerDisplayNames[group.stateKey] || getCanonicalName(group.key)}
                              palletsByTipo={cardPalletsByTipo}
                              sectionFilter={sectionFilter}
                              isCongelados={isCongelados}
                              adelanto={adelantoByCod[group.storeCod]}
                              otroDia={otroDiaGroupKeys.has(group.stateKey)}
                              batchValue={pickerBatch[group.stateKey] ?? ''}
                              onBatchChange={raw => setPickerBatchValue(group.stateKey, raw)}
                              pesoTotal={Object.fromEntries((['CH', 'CC', 'CN'] as TipoCaja[]).map(t => [t, {
                                raw: pesoTotalRaw[`${group.stateKey}::${t}`] ?? '',
                                guardado: pesoTotalGuardado[`${group.stateKey}::${t}`] ?? null,
                              }]))}
                              onPesoTotalChange={(t, raw) => setPesoTotalValue(group.stateKey, t, raw)}
                              onNameChange={name => {
                                setPickerDisplayNames(prev => ({ ...prev, [group.stateKey]: name }));
                                upsertSessionState(group.stateKey, name, 'P');
                                renamePickerSlots(group.stateKey, name);
                              }}
                              onTipoPalletsChange={(tipo, n) => {
                                const current = cardPalletsByTipo[tipo] ?? 0;
                                const delta = n - current;
                                const label = pickerDisplayNames[group.stateKey] || getCanonicalName(group.key) || group.key;
                                // [Req 1] En la sección Chocolates el pallet ES de chocolate → forzar el
                                // contenido (aunque las categorías del grupo digan otra cosa). El tipo (P)
                                // no cambia; solo el contenido, que en la card de bodega se ve como "CH".
                                // `contenido`/refs se derivan del grupo COMPLETO (fullGroupCats/fullOps) para
                                // NO cambiar lo que Bodega/Sheets ve; la sección va aparte, en `section`.
                                const contenido = sectionFilter === 'chocolates' ? 'chocolate'
                                  : sectionFilter === 'congelados' || fullIsCongelados ? 'congelados'
                                  : categoriesToContenido(fullGroupCats);
                                // Sección a etiquetar en el pallet nuevo: la del filtro activo, o (en "Todas")
                                // la del grupo (null si es mixto → solo suma en "Todas").
                                const seccionSlot: string | null = seccionActiva ?? (fullIsCongelados ? 'congelados' : seccionDeGrupo(fullGroupCats));
                                const groupRefs = fullOps.map(o => o.name).join('+');
                                if (delta > 0) {
                                  // Una caja nueva nace SIN peso: el total ya pesado era para las que
                                  // había, y repartirlo entre más sería inventar. La tarjeta avisa que
                                  // cambió la cantidad y pide volver a pesar (ver avisoCantidad).
                                  for (let i = 0; i < delta; i++) void addPalletSlot(group.stateKey, cod, label, tipo, contenido, groupRefs, seccionSlot);
                                } else if (delta < 0) {
                                  for (let i = 0; i < -delta; i++) void removePalletSlot(group.stateKey, tipo, seccionActiva);
                                }
                              }}
                              onRefreshOp={(op) => void refreshOp(op, cod)}
                              onPrint={() => printGroupLabels(group)}
                              refreshingId={refreshingId}
                              totalPickers={allStore.length}
                              assignedNums={nums}
                              isPrinted={printedKeys.has(group.stateKey)}
                              colsPerRow={colsPerRow}
                              onPrintSelected={(slotIds) => printSelectedLabels(group.stateKey, slotIds)}
                              slots={cardSlots}
                              stickerBelow={stickerBelow}
                              lastPrint={printRecordByKey.get(group.stateKey)}
                              myName={profile?.full_name ?? ''}
                            />
                          );
                        };

                        // Filtro activo (Hogar / Aseo y Comida), o la pestaña Congelados: render plano.
                        // Congelados no tiene secciones — antes caía en la grilla de Seco y mostraba
                        // tres columnas de seco vacías más una con sus tarjetas.
                        if (sectionFilter !== 'all' || esTabCongelados) {
                          return <div className="space-y-4">{storeGroups.map(g => renderCard(g))}</div>;
                        }

                        // "Todas" de Seco: grid de 3 columnas fijas, siempre visibles (Congelados tiene su pestaña)
                        const SECTION_META = {
                          'aseo-comida': { label: 'Aseo y Comida', color: '#D97706', bg: 'rgba(217,119,6,0.06)',  border: 'rgba(217,119,6,0.28)' },
                          hogar:         { label: 'Hogar',         color: '#1D4ED8', bg: 'rgba(29,78,216,0.06)',  border: 'rgba(29,78,216,0.22)' },
                          chocolates:    { label: 'Chocolates',    color: '#92400E', bg: 'rgba(146,64,14,0.06)', border: 'rgba(146,64,14,0.22)' },
                          congelados:    { label: 'Congelados',    color: '#0891B2', bg: 'rgba(8,145,178,0.06)', border: 'rgba(8,145,178,0.22)' },
                          mixto:         { label: 'Mixto',         color: '#7C3AED', bg: 'rgba(124,58,237,0.06)', border: 'rgba(124,58,237,0.22)' },
                        } as const;

                        // Un encargado manual no tiene operaciones de Odoo: su columna sale de la sección
                        // de sus unidades (antes caían TODOS en Hogar). Ver columnaSeco.
                        const getSection = (g: PickerGroup): ColumnaSeco => {
                          const esManual = g.operations.length === 0;
                          const cats = esManual
                            ? categoriasDeSlotsManual(slotsByStateKey[g.stateKey] ?? [])
                            : g.operations.flatMap(o => o.categories);
                          return columnaSeco(cats, esManual);
                        };

                        const countSlots = (gs: PickerGroup[]) =>
                          gs.reduce((sum, g) => sum + Object.values(palletsByTipoAndStateKey[g.stateKey] ?? {}).reduce((a, b) => a + b, 0), 0);

                        const aseoComidaGroups = storeGroups.filter(g => getSection(g) === 'aseo-comida');
                        const hogarGroups      = storeGroups.filter(g => getSection(g) === 'hogar');
                        const chocoGroups      = storeGroups.filter(g => getSection(g) === 'chocolates');
                        const mixtoGroups      = storeGroups.filter(g => getSection(g) === 'mixto');
                        const mixtoTotal       = countSlots(mixtoGroups);

                        const renderSectionHeader = (key: keyof typeof SECTION_META, total: number) => {
                          const meta = SECTION_META[key];
                          return (
                            <div className="mb-4 print:hidden">
                              <div className="flex items-center gap-3 mb-2">
                                <span className="font-barlow-condensed text-[18px] font-bold uppercase tracking-wide flex-shrink-0" style={{ color: meta.color }}>
                                  {meta.label}
                                </span>
                                {total > 0 && (
                                  <span className="text-[13px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0"
                                    style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                    {total} pallet{total !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <div className="h-[3px] rounded-full w-full" style={{ background: meta.color, opacity: 0.55 }} />
                            </div>
                          );
                        };

                        const columns: Array<{ key: keyof typeof SECTION_META; groups: PickerGroup[] }> = [
                          { key: 'aseo-comida', groups: aseoComidaGroups },
                          { key: 'hogar',       groups: hogarGroups },
                          { key: 'chocolates',  groups: chocoGroups },
                        ];

                        return (
                          <div className="space-y-4">
                            {/* Grid de 3 columnas fijas — todas siempre visibles */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                              {columns.map((col) => {
                                const total = countSlots(col.groups);
                                const meta  = SECTION_META[col.key];
                                return (
                                  <div key={col.key}>
                                    {renderSectionHeader(col.key, total)}
                                    {col.groups.length > 0 ? (
                                      <div className="space-y-3">
                                        {col.groups.map(g => renderCard(g, true))}
                                      </div>
                                    ) : (
                                      <div className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center py-10 px-4"
                                        style={{ borderColor: meta.color + '28', background: '#fff' }}>
                                        <div className="mb-1" style={{ opacity: 0.18 }}><Package size={28} /></div>
                                        <div className="text-[12px] font-semibold text-center" style={{ color: meta.color, opacity: 0.5 }}>
                                          Sin operaciones aún
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Mixto (Hogar + Aseo en el mismo picker) — ancho completo abajo */}
                            {mixtoGroups.length > 0 && (
                              <div>
                                {renderSectionHeader('mixto', mixtoTotal)}
                                <div className="space-y-3">
                                  {mixtoGroups.map(g => renderCard(g))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </section>
                );
              })}
            </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
