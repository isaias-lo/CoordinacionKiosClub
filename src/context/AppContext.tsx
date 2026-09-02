'use client';

import { createContext, useContext, useReducer, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { AppState, DispatchItem, TipoContenido, TipoPaquete, PdfData } from '../types';
import { useAuth } from '@/components/AuthProvider';
import { pushSessionState, subscribeToSessionState, fetchSessionStateMeta, remotoEsMasViejo } from '@/lib/userSessionState';
import { useVisibilityRefetch } from '@/hooks/useVisibilityRefetch';
import { mergeEntriesByKey, mergeItemsByTienda } from '@/features/despacho/santiago/context/mergeItems';
import { stableItemKey } from '@/features/despacho/shared/formRowsReconcile';
import { serializarBase } from '@/features/despacho/shared/syncBase';

const today = new Date();
const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const dispatchDate = `${days[today.getDay()]} ${today.getDate()} ${months[today.getMonth()]}`;

const initialState: AppState = {
  activeTab: 0,
  selectedTienda: null,
  currentTipo: 'comida',
  currentPkg: 'pallet',
  dispatch: {},
  pdfData: {},
  selection: {},
  sheetsUrl: typeof window !== 'undefined' ? (localStorage.getItem('sheetsUrl') || '') : '',
  dispatchDate,
  toast: null,
};

type Action =
  | { type: 'SET_TAB'; payload: number }
  | { type: 'SET_TIENDA'; payload: string | null }
  | { type: 'SET_TIPO'; payload: TipoContenido }
  | { type: 'SET_PKG'; payload: TipoPaquete }
  | { type: 'ADD_ITEM'; tienda: string; item: DispatchItem }
  | { type: 'DELETE_ITEM'; tienda: string; idx: number }
  | { type: 'RENUMBER'; tienda: string }
  | { type: 'CLEAR_TIENDA'; tienda: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'SET_PDF'; tienda: string; data: PdfData }
  | { type: 'CLEAR_PDF'; tienda: string }
  | { type: 'UPDATE_ITEMS'; tienda: string; items: DispatchItem[] }
  | { type: 'TOGGLE_SELECTION'; tienda: string; idx: number }
  | { type: 'TOGGLE_ALL_SELECTION'; tienda: string; count: number }
  | { type: 'SELECT_ALL_GLOBAL'; selectAll: boolean }
  | { type: 'SET_SHEETS_URL'; payload: string }
  | { type: 'SHOW_TOAST'; msg: string; color?: string }
  | { type: 'HIDE_TOAST' }
  | { type: 'LOAD_STATE'; payload: { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData>; registrado?: boolean } }
  | { type: 'SET_FECHA_DESPACHO'; payload: string }
  | { type: 'SET_REGISTRADO'; payload: boolean };

// [E3b/C1] Garantiza un `id` estable a cada ítem (los ítems Nacional no lo traían y `renumber`
// crea objetos nuevos, así que `orden` no sirve como llave). Preserva el id existente (viaja en
// el objeto entre dispositivos vía shared_session_state), solo asigna si falta.
let _idCounter = 0;
function conId(item: DispatchItem): DispatchItem {
  return item.id ? item : { ...item, id: `di-${Date.now().toString(36)}-${(_idCounter++).toString(36)}` };
}

function renumber(items: DispatchItem[]): DispatchItem[] {
  let pc = 1, bc = 1, cc = 1, chc = 1;
  return items.map(i => conId(
    i.pkg === 'pallet'     ? { ...i, orden: `pallet${pc++}` }
    : i.pkg === 'contenedor' ? { ...i, orden: `contenedor${cc++}` }
    : i.pkg === 'chocolate'  ? { ...i, orden: `chocolate${chc++}` }
    : { ...i, orden: `bulto${bc++}` }
  ));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_TIENDA':
      // Al cambiar de tienda, volver el tipo de paquete a sus defaults para que el
      // form de la nueva tienda no herede el tipo de la anterior (defaults de initialState).
      return { ...state, selectedTienda: action.payload, currentPkg: 'pallet', currentTipo: 'comida' };
    case 'SET_TIPO':
      return { ...state, currentTipo: action.payload };
    case 'SET_PKG':
      return { ...state, currentPkg: action.payload };
    case 'ADD_ITEM': {
      const prev = state.dispatch[action.tienda] || [];
      const updated = renumber([...prev, action.item]);
      const sel = new Set(state.selection[action.tienda] || []);
      sel.add(updated.length - 1);
      return {
        ...state,
        dispatch: { ...state.dispatch, [action.tienda]: updated },
        selection: { ...state.selection, [action.tienda]: sel },
      };
    }
    case 'DELETE_ITEM': {
      const items = (state.dispatch[action.tienda] || []).filter((_, i) => i !== action.idx);
      const updated = renumber(items);
      const sel = new Set<number>();
      (state.selection[action.tienda] || new Set()).forEach(i => {
        if (i < action.idx) sel.add(i);
        else if (i > action.idx) sel.add(i - 1);
      });
      return {
        ...state,
        dispatch: { ...state.dispatch, [action.tienda]: updated },
        selection: { ...state.selection, [action.tienda]: sel },
      };
    }
    case 'UPDATE_ITEMS':
      return { ...state, dispatch: { ...state.dispatch, [action.tienda]: action.items.map(conId) } };
    case 'CLEAR_TIENDA': {
      const d = { ...state.dispatch }; delete d[action.tienda];
      const p = { ...state.pdfData }; delete p[action.tienda];
      const s = { ...state.selection }; delete s[action.tienda];
      return { ...state, dispatch: d, pdfData: p, selection: s };
    }
    case 'CLEAR_ALL':
      return { ...state, dispatch: {}, pdfData: {}, selection: {} };
    case 'SET_PDF':
      return { ...state, pdfData: { ...state.pdfData, [action.tienda]: action.data } };
    case 'CLEAR_PDF': {
      const p = { ...state.pdfData }; delete p[action.tienda];
      return { ...state, pdfData: p };
    }
    case 'TOGGLE_SELECTION': {
      const sel = new Set(state.selection[action.tienda] || []);
      sel.has(action.idx) ? sel.delete(action.idx) : sel.add(action.idx);
      return { ...state, selection: { ...state.selection, [action.tienda]: sel } };
    }
    case 'TOGGLE_ALL_SELECTION': {
      const cur = state.selection[action.tienda];
      const allSel = cur && cur.size === action.count;
      const sel = allSel ? new Set<number>() : new Set(Array.from({ length: action.count }, (_, i) => i));
      return { ...state, selection: { ...state.selection, [action.tienda]: sel } };
    }
    case 'SELECT_ALL_GLOBAL': {
      // Selecciona (o limpia) TODOS los items de TODAS las tiendas con items.
      if (!action.selectAll) return { ...state, selection: {} };
      const selection: Record<string, Set<number>> = {};
      for (const [tienda, items] of Object.entries(state.dispatch)) {
        if (items.length > 0) selection[tienda] = new Set(items.map((_, i) => i));
      }
      return { ...state, selection };
    }
    case 'SET_SHEETS_URL':
      if (typeof window !== 'undefined') localStorage.setItem('sheetsUrl', action.payload);
      return { ...state, sheetsUrl: action.payload };
    case 'SHOW_TOAST':
      return { ...state, toast: { msg: action.msg, color: action.color } };
    case 'HIDE_TOAST':
      return { ...state, toast: null };
    case 'LOAD_STATE':
      return {
        ...state,
        dispatch:   action.payload.dispatch
          ? Object.fromEntries(Object.entries(action.payload.dispatch).map(([k, v]) => [k, v.map(conId)]))
          : state.dispatch,
        pdfData:    action.payload.pdfData     ?? state.pdfData,
        registrado: action.payload.registrado ?? state.registrado,
      };
    case 'SET_FECHA_DESPACHO':
      return { ...state, fechaDespacho: action.payload, registrado: false };
    case 'SET_REGISTRADO':
      return { ...state, registrado: action.payload };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string, color?: string) => void;
  getStats: () => { pallets: number; bultos: number; contenedores: number; chocolates: number; tiendas: number };
  flushPending: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// Use local date (not UTC) so the key matches todayISO() used by the server helpers
const _d = new Date();
const SESSION_DATE = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const REGIONES_KEY = `regionesState_${SESSION_DATE}`;

function loadInitialState(): AppState {
  if (typeof window === 'undefined') return initialState;
  try {
    const raw = localStorage.getItem(REGIONES_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw);
    return { ...initialState, dispatch: saved.dispatch || {}, pdfData: saved.pdfData || {}, registrado: saved.registrado ?? false };
  } catch { return initialState; }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const { user } = useAuth();
  const userId = user?.id;

  // Always-current ref so async callbacks never see stale state
  const stateRef        = useRef(state);
  stateRef.current      = state;
  // [P5] Base del merge / corta-ecos. SIEMPRE con `serializarBase` (misma forma en todos los
  // puntos): antes cada sitio serializaba una forma distinta del mismo objeto, así que la
  // comparación no coincidía nunca y cada equipo re-empujaba todo remoto que adoptaba.
  const lastPushedRef   = useRef<string>((() => {
    if (typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem(REGIONES_KEY);
      if (!raw) return '';
      return serializarBase(JSON.parse(raw));
    } catch { return ''; }
  })());
  // Payload COMPLETO del último push (incluye fechaDespacho/registrado): solo para el chequeo de
  // "¿cambió algo que haya que empujar?". No se usa como base del merge.
  const lastPushedFullRef = useRef<string>('');
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPushingRef    = useRef(false); // true while the async Supabase upsert is in-flight
  const isInitializedRef = useRef(false);
  const clearedAtRef    = useRef<number>(0); // timestamp of last intentional CLEAR_ALL push
  const lastPushCompletedAtRef = useRef<number>(0); // timestamp when last Supabase push completed
  const lastPushTimestampRef   = useRef<number>(0); // pushedAt value included in last push payload
  const lastServerStampRef     = useRef<number>(0); // [C3/RC-6] updated_at (reloj SERVIDOR) del último push/adopción
  const catchUpRef        = useRef<() => void>(() => {}); // [P9] re-fetch + apply remoto (catch-up)
  const pendingCatchupRef = useRef(false);                // [P9] remoto llegó durante push local → catch-up al terminar
  // [P5] Catch-up programado cuando un remoto cae dentro de la ventana de 3 s post-push.
  const ventanaCatchupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load + subscribe + poll (Realtime fires instantly; poll is the guaranteed fallback)
  useEffect(() => {
    isInitializedRef.current = false;
    if (!userId) return;

    const handleRemote = (remoteState: unknown, updatedAt?: number) => {
      // Block if local push is pending (debounce) or in-flight (async upsert).
      // [P9] En vez de descartar, marcamos catch-up: al terminar el push re-consultamos y aplicamos.
      if (debounceRef.current !== null || isPushingRef.current) { pendingCatchupRef.current = true; return; }
      // Block for 3 s after push completes — Supabase propagation lag can cause stale remote to overwrite our data.
      // [P5] Pero NO se descarta: se PROGRAMA un catch-up para cuando la ventana expire. Antes era un
      // `return` seco y el cambio del compañero se perdía para siempre (el `pendingCatchupRef` de
      // arriba solo se consume al terminar un push, y acá el push ya terminó). Con varias personas
      // registrando —cada una empuja cada ~2.5 s— es muy probable que un push ajeno caiga justo en
      // esta ventana; sin esto, se perdían registros de otros en silencio.
      const restante = 3_000 - (Date.now() - lastPushCompletedAtRef.current);
      if (restante > 0) {
        if (ventanaCatchupRef.current === null) {
          ventanaCatchupRef.current = setTimeout(() => {
            ventanaCatchupRef.current = null;
            catchUpRef.current();
          }, restante + 50);
        }
        return;
      }
      // Block for 30 s after an intentional CLEAR_ALL to prevent remote from restoring cleared data
      if (Date.now() - clearedAtRef.current < 30_000) return;
      const remote = remoteState as { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData>; sessionDate?: string; pushedAt?: number; registrado?: boolean };
      // Reject data from a different calendar day — prevents stale sessions from other devices
      // from pushing yesterday's guides into today's view. Old records without sessionDate are also rejected.
      if (remote.sessionDate !== SESSION_DATE) return;
      // [C3/RC-6] Rechaza un remoto MÁS VIEJO que lo último que ya incorporé, ordenando por reloj del
      // SERVIDOR (updated_at) para no depender del reloj de cada equipo; sin server-stamp cae al
      // pushedAt del cliente (comportamiento previo). Evita que un push stale pise lo ya guardado.
      if (remotoEsMasViejo(updatedAt, lastServerStampRef.current, remote.pushedAt, lastPushTimestampRef.current)) return;
      // [P5] Corta-ecos con la MISMA serialización que la base (antes se comparaba el remoto crudo
      // —con sessionDate/pushedAt— contra una base sin esos campos, así que no coincidía nunca y
      // cada equipo re-empujaba lo que adoptaba: tormenta de escrituras que no converge).
      const remoteStr = serializarBase(remoteState as { dispatch?: unknown; pdfData?: unknown });
      if (remoteStr === lastPushedRef.current) return; // already in sync
      // Voy a incorporar este remoto → avanzo el reloj de servidor de referencia.
      if (updatedAt != null && updatedAt > lastServerStampRef.current) lastServerStampRef.current = updatedAt;

      // Per-tienda merge: local dirty (changed since last push) → local wins; clean → remote wins.
      let lastPushed: { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData> } = {};
      try { lastPushed = JSON.parse(lastPushedRef.current); } catch { lastPushed = {}; }
      const lastDispatch = lastPushed.dispatch ?? {};
      const lastPdfData  = lastPushed.pdfData  ?? {};

      // ── dispatch merge ──────────────────────────────────────────────
      // [E3b/C2] Merge POR-ÍTEM (misma función que RM/Costa). Antes era por TIENDA completa (dirty ⇒
      // gana toda la local), lo que hacía que dos personas editando la MISMA tienda se pisaran (A
      // editaba dims mientras B agregaba un bulto ⇒ uno perdía su cambio). Ahora, en las tiendas que
      // edité, reconcilia ítem por ítem con `stableItemKey` (id estable de C1); las tiendas que no
      // toqué siguen adoptando la remota tal cual (ausencia remota = borrado intencional).
      const remoteDispatch = remote.dispatch ?? {};
      const localDispatch  = stateRef.current.dispatch;
      const mergedDispatch = mergeItemsByTienda(remoteDispatch, localDispatch, lastDispatch, stableItemKey);

      // ── pdfData merge ── mismo criterio por-clave que las guías de RM/Costa (mergeEntriesByKey):
      // dirty ⇒ gana la local (subida/borrado sin empujar); limpia ⇒ manda la remota; y si el remoto
      // NO trae una clave limpia que yo sí tengo, la CONSERVO. Antes esto la borraba ("cleared
      // remotely"), pero un remoto stale/parcial —p. ej. el catch-up que re-consulta justo tras subir
      // un PDF— hacía DESAPARECER el PDF recién subido (el bug reportado: aparece el card verde y a
      // los segundos se va). El reset diario NO depende de esto (usa claves localStorage por día +
      // sessionDate), así que conservar es seguro.
      const remotePdf = remote.pdfData ?? {};
      const localPdf  = stateRef.current.pdfData;
      const mergedPdf: Record<string, PdfData> = mergeEntriesByKey(remotePdf, localPdf, lastPdfData);

      // Si lo local no cambió desde el último push, adoptamos el remoto como nueva base (y así no
      // se re-empuja). Ambos lados con `serializarBase` → la comparación ahora sí puede coincidir.
      const localStr = serializarBase({ dispatch: localDispatch, pdfData: localPdf });
      if (localStr === lastPushedRef.current) lastPushedRef.current = remoteStr;

      // Adoptar "registrado" desde otro equipo (solo si el remoto está registrado; nunca
      // des-registrar localmente con un remoto viejo).
      dispatch({ type: 'LOAD_STATE', payload: { dispatch: mergedDispatch, pdfData: mergedPdf, registrado: remote.registrado === true ? true : undefined } });
    };

    // [P9] Catch-up: re-consulta el estado y lo aplica (usado al volver a la pestaña/app y tras un push)
    catchUpRef.current = () => {
      fetchSessionStateMeta('regiones').then((m) => { if (m?.state) handleRemote(m.state, m.updatedAt ?? undefined); }).catch(() => {});
    };

    // Initial fetch: use same per-tienda dirty merge as handleRemote.
    // lastPushedRef is pre-seeded from localStorage so the baseline reflects last session's state.
    // Items added since page load (dirty) → local wins; unchanged items → remote wins.
    fetchSessionStateMeta('regiones')
      .then((m) => {
        isInitializedRef.current = true;
        if (m?.state) handleRemote(m.state, m.updatedAt ?? undefined);
      })
      .catch(() => { isInitializedRef.current = true; });

    // Realtime subscription (instant when WebSocket works). Track connection health so the
    // polling fallback below only runs when Realtime is actually down — otherwise we'd
    // re-download the full state blob every 15 s on every open tab (wasted egress).
    let realtimeConnected = false;
    const unsub = subscribeToSessionState('regiones', userId, handleRemote, (connected) => {
      const reconnected = connected && !realtimeConnected;
      realtimeConnected = connected;
      // On (re)connect, fetch once to catch any change missed while the socket was down.
      if (reconnected) {
        fetchSessionStateMeta('regiones').then((m) => { if (m?.state) handleRemote(m.state, m.updatedAt ?? undefined); }).catch(() => {});
      }
    });

    // Polling fallback every 15 s — ONLY fires while Realtime is disconnected.
    // 3 s was too aggressive: frequent polls created race-condition windows after pushes.
    const pollId = setInterval(async () => {
      if (realtimeConnected) return;
      try {
        const m = await fetchSessionStateMeta('regiones');
        if (m?.state) handleRemote(m.state, m.updatedAt ?? undefined);
      } catch {}
    }, 15_000);

    return () => {
      unsub(); clearInterval(pollId);
      if (ventanaCatchupRef.current) { clearTimeout(ventanaCatchupRef.current); ventanaCatchupRef.current = null; }
    };
  }, [userId]);

  // Debounced push to Supabase (2.5 s after last change) + localStorage fallback.
  // The debounce window also throttles how often the full row is re-broadcast over Realtime
  // to every subscriber — a longer window means fewer rebroadcasts of the whole blob (egress).
  // flushPending() + localStorage on unmount guarantee no data is lost on navigation.
  useEffect(() => {
    if (!isInitializedRef.current) return;
    const payload = { dispatch: state.dispatch, pdfData: state.pdfData, fechaDespacho: state.fechaDespacho, registrado: state.registrado };
    // [P5] "¿Hay algo que empujar?" mira el payload COMPLETO (incluye fechaDespacho/registrado);
    // la BASE del merge y del corta-ecos se guarda aparte con `serializarBase`.
    const current = JSON.stringify(payload);
    if (current === lastPushedFullRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // Mark a clear so handleRemote won't restore data for 30 s
      const isEmpty = Object.keys(payload.dispatch).length === 0 && Object.keys(payload.pdfData).length === 0;
      if (isEmpty) clearedAtRef.current = Date.now();
      const prevLastPushed = lastPushedRef.current;
      const prevLastFull   = lastPushedFullRef.current;
      lastPushedRef.current     = serializarBase(payload);
      lastPushedFullRef.current = current;
      isPushingRef.current = true; // block handleRemote during the async upsert
      const pushedAt = Date.now();
      lastPushTimestampRef.current = pushedAt;
      // Include sessionDate and pushedAt so other devices/tabs can reject stale pushes
      pushSessionState('regiones', { ...payload, sessionDate: SESSION_DATE, pushedAt }, userId ?? undefined)
        .then((serverTs) => { if (serverTs != null) lastServerStampRef.current = Math.max(lastServerStampRef.current, serverTs); }) // [C3/RC-6] reloj de servidor de mi push
        .catch(() => { lastPushedRef.current = prevLastPushed; lastPushedFullRef.current = prevLastFull; }) // reset so dirty check retries correctly
        .finally(() => {
          isPushingRef.current = false; lastPushCompletedAtRef.current = Date.now();
          // [P9] Si llegó un remoto mientras empujábamos, ponerse al día ahora (no se descarta).
          if (pendingCatchupRef.current) { pendingCatchupRef.current = false; catchUpRef.current(); }
        });
      try { localStorage.setItem(REGIONES_KEY, JSON.stringify(state)); } catch {}
    }, 2500);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [state.dispatch, state.pdfData, state.fechaDespacho, state.registrado]);

  const showToast = useCallback((msg: string, color?: string) => {
    dispatch({ type: 'SHOW_TOAST', msg, color });
    setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 3000);
  }, []);

  const getStats = useCallback(() => {
    let pallets = 0, bultos = 0, contenedores = 0, chocolates = 0, tiendas = 0;
    for (const items of Object.values(state.dispatch)) {
      if (items.length > 0) tiendas++;
      for (const item of items) {
        if (item.pkg === 'pallet') pallets++;
        else if (item.pkg === 'contenedor') contenedores++;
        else if (item.pkg === 'chocolate') chocolates++;
        else bultos++;
      }
    }
    return { pallets, bultos, contenedores, chocolates, tiendas };
  }, [state.dispatch]);

  // Flush any pending debounced push immediately — call before navigating away so data is never lost.
  const flushPending = useCallback(() => {
    if (!isInitializedRef.current) return;
    const payload = { dispatch: stateRef.current.dispatch, pdfData: stateRef.current.pdfData, fechaDespacho: stateRef.current.fechaDespacho, registrado: stateRef.current.registrado };
    const current = JSON.stringify(payload);
    if (current === lastPushedFullRef.current) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const prevPushed = lastPushedRef.current;
    const prevFull   = lastPushedFullRef.current;
    lastPushedRef.current     = serializarBase(payload);
    lastPushedFullRef.current = current;
    const pushedAt = Date.now();
    lastPushTimestampRef.current = pushedAt;
    pushSessionState('regiones', { ...payload, sessionDate: SESSION_DATE, pushedAt }, userId ?? undefined)
      .then((serverTs) => { if (serverTs != null) lastServerStampRef.current = Math.max(lastServerStampRef.current, serverTs); }) // [C3/RC-6]
      .catch(() => { lastPushedRef.current = prevPushed; lastPushedFullRef.current = prevFull; })
      .finally(() => { lastPushCompletedAtRef.current = Date.now(); });
    try { localStorage.setItem(REGIONES_KEY, JSON.stringify(stateRef.current)); } catch {}
  }, [userId]);

  // [P9] Al volver a la pestaña/app → catch-up con el estado remoto; al ocultarla → flush de pendientes.
  useVisibilityRefetch(() => catchUpRef.current(), flushPending);

  return (
    <AppContext.Provider value={{ state, dispatch, showToast, getStats, flushPending }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
