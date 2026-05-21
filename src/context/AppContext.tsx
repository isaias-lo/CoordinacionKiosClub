'use client';

import { createContext, useContext, useReducer, useCallback, useEffect, useRef, ReactNode } from 'react';
import type { AppState, DispatchItem, TipoContenido, TipoPaquete, PdfData } from '../types';
import { useAuth } from '@/components/AuthProvider';
import { pushSessionState, fetchSessionState, subscribeToSessionState } from '@/lib/userSessionState';

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
  | { type: 'SET_SHEETS_URL'; payload: string }
  | { type: 'SHOW_TOAST'; msg: string; color?: string }
  | { type: 'HIDE_TOAST' }
  | { type: 'LOAD_STATE'; payload: { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData> } };

function renumber(items: DispatchItem[]): DispatchItem[] {
  let pc = 1, bc = 1, cc = 1;
  return items.map(i =>
    i.pkg === 'pallet'     ? { ...i, orden: `pallet${pc++}` }
    : i.pkg === 'contenedor' ? { ...i, orden: `contenedor${cc++}` }
    : { ...i, orden: `bulto${bc++}` }
  );
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.payload };
    case 'SET_TIENDA':
      return { ...state, selectedTienda: action.payload };
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
      return { ...state, dispatch: { ...state.dispatch, [action.tienda]: action.items } };
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
        dispatch: action.payload.dispatch ?? state.dispatch,
        pdfData:  action.payload.pdfData  ?? state.pdfData,
      };
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  showToast: (msg: string, color?: string) => void;
  getStats: () => { pallets: number; bultos: number; contenedores: number; tiendas: number };
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
    return { ...initialState, dispatch: saved.dispatch || {}, pdfData: saved.pdfData || {} };
  } catch { return initialState; }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);
  const { user } = useAuth();
  const userId = user?.id;

  // Always-current ref so async callbacks never see stale state
  const stateRef        = useRef(state);
  stateRef.current      = state;
  const lastPushedRef   = useRef<string>((() => {
    if (typeof window === 'undefined') return '';
    try {
      const raw = localStorage.getItem(REGIONES_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      return JSON.stringify({ dispatch: parsed.dispatch || {}, pdfData: parsed.pdfData || {} });
    } catch { return ''; }
  })());
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPushingRef    = useRef(false); // true while the async Supabase upsert is in-flight
  const isInitializedRef = useRef(false);
  const clearedAtRef    = useRef<number>(0); // timestamp of last intentional CLEAR_ALL push
  const lastPushCompletedAtRef = useRef<number>(0); // timestamp when last Supabase push completed

  // Load + subscribe + poll (Realtime fires instantly; poll is the guaranteed fallback)
  useEffect(() => {
    isInitializedRef.current = false;
    if (!userId) return;

    const handleRemote = (remoteState: unknown) => {
      // Block if local push is pending (debounce) or in-flight (async upsert)
      if (debounceRef.current !== null || isPushingRef.current) return;
      // Block for 3 s after push completes — Supabase propagation lag can cause stale remote to overwrite our data
      if (Date.now() - lastPushCompletedAtRef.current < 3_000) return;
      // Block for 30 s after an intentional CLEAR_ALL to prevent remote from restoring cleared data
      if (Date.now() - clearedAtRef.current < 30_000) return;
      const remote = remoteState as { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData>; sessionDate?: string };
      // Reject data from a different calendar day — prevents stale sessions from other devices
      // from pushing yesterday's guides into today's view. Old records without sessionDate are also rejected.
      if (remote.sessionDate !== SESSION_DATE) return;
      const remoteStr = JSON.stringify(remoteState);
      if (remoteStr === lastPushedRef.current) return; // already in sync

      // Per-tienda merge: local dirty (changed since last push) → local wins; clean → remote wins.
      let lastPushed: { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData> } = {};
      try { lastPushed = JSON.parse(lastPushedRef.current); } catch { lastPushed = {}; }
      const lastDispatch = lastPushed.dispatch ?? {};
      const lastPdfData  = lastPushed.pdfData  ?? {};

      // ── dispatch merge ──────────────────────────────────────────────
      const remoteDispatch = remote.dispatch ?? {};
      const localDispatch  = stateRef.current.dispatch;
      const allTiendas     = new Set([...Object.keys(remoteDispatch), ...Object.keys(localDispatch)]);
      const mergedDispatch: Record<string, DispatchItem[]> = {};
      for (const tienda of allTiendas) {
        const localItems = localDispatch[tienda];
        const remItems   = remoteDispatch[tienda];
        const lastItems  = lastDispatch[tienda];
        const dirty      = JSON.stringify(localItems ?? []) !== JSON.stringify(lastItems ?? []);
        mergedDispatch[tienda] = dirty ? (localItems ?? []) : (remItems ?? localItems ?? []);
      }

      // ── pdfData merge ───────────────────────────────────────────────
      // Same dirty/clean logic: lets remote PDFs (uploaded by other users) propagate in,
      // while protecting local uploads/clears from being overwritten.
      const remotePdf = remote.pdfData ?? {};
      const localPdf  = stateRef.current.pdfData;
      const allPdfKeys = new Set([...Object.keys(remotePdf), ...Object.keys(localPdf), ...Object.keys(lastPdfData)]);
      const mergedPdf: Record<string, PdfData> = {};
      for (const tienda of allPdfKeys) {
        const localEntry  = localPdf[tienda];
        const remoteEntry = remotePdf[tienda];
        const lastEntry   = lastPdfData[tienda];
        const dirty       = JSON.stringify(localEntry) !== JSON.stringify(lastEntry);
        if (dirty) {
          if (localEntry !== undefined) mergedPdf[tienda] = localEntry; // local upload or clear
        } else {
          if      (remoteEntry !== undefined) mergedPdf[tienda] = remoteEntry; // remote upload wins
          else if (localEntry  !== undefined) mergedPdf[tienda] = localEntry;
        }
      }

      const localStr = JSON.stringify({ dispatch: localDispatch, pdfData: localPdf });
      if (localStr === lastPushedRef.current) lastPushedRef.current = remoteStr;

      dispatch({ type: 'LOAD_STATE', payload: { dispatch: mergedDispatch, pdfData: mergedPdf } });
    };

    // Initial fetch: use same per-tienda dirty merge as handleRemote.
    // lastPushedRef is pre-seeded from localStorage so the baseline reflects last session's state.
    // Items added since page load (dirty) → local wins; unchanged items → remote wins.
    fetchSessionState('regiones')
      .then((remote) => {
        isInitializedRef.current = true;
        if (remote) handleRemote(remote);
      })
      .catch(() => { isInitializedRef.current = true; });

    // Realtime subscription (instant when WebSocket works)
    const unsub = subscribeToSessionState('regiones', userId, handleRemote);

    // Polling fallback every 15 s — guarantees sync even when Realtime drops.
    // 3 s was too aggressive: frequent polls created race-condition windows after pushes.
    const pollId = setInterval(async () => {
      try {
        const remote = await fetchSessionState('regiones');
        if (remote) handleRemote(remote);
      } catch {}
    }, 15_000);

    return () => { unsub(); clearInterval(pollId); };
  }, [userId]);

  // Debounced push to Supabase (800 ms after last change) + localStorage fallback
  useEffect(() => {
    if (!isInitializedRef.current) return;
    const payload = { dispatch: state.dispatch, pdfData: state.pdfData };
    const current = JSON.stringify(payload);
    if (current === lastPushedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // Mark a clear so handleRemote won't restore data for 30 s
      const isEmpty = Object.keys(payload.dispatch).length === 0 && Object.keys(payload.pdfData).length === 0;
      if (isEmpty) clearedAtRef.current = Date.now();
      const prevLastPushed = lastPushedRef.current;
      lastPushedRef.current = current;
      isPushingRef.current = true; // block handleRemote during the async upsert
      // Include sessionDate so other devices can reject data from a different calendar day
      pushSessionState('regiones', { ...payload, sessionDate: SESSION_DATE }, userId ?? undefined)
        .catch(() => { lastPushedRef.current = prevLastPushed; }) // reset so dirty check retries correctly
        .finally(() => { isPushingRef.current = false; lastPushCompletedAtRef.current = Date.now(); });
      try { localStorage.setItem(REGIONES_KEY, JSON.stringify(state)); } catch {}
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [state.dispatch, state.pdfData]);

  const showToast = useCallback((msg: string, color?: string) => {
    dispatch({ type: 'SHOW_TOAST', msg, color });
    setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 3000);
  }, []);

  const getStats = useCallback(() => {
    let pallets = 0, bultos = 0, contenedores = 0, tiendas = 0;
    for (const items of Object.values(state.dispatch)) {
      if (items.length > 0) tiendas++;
      for (const item of items) {
        if (item.pkg === 'pallet') pallets++;
        else if (item.pkg === 'contenedor') contenedores++;
        else bultos++;
      }
    }
    return { pallets, bultos, contenedores, tiendas };
  }, [state.dispatch]);

  // Flush any pending debounced push immediately — call before navigating away so data is never lost.
  const flushPending = useCallback(() => {
    if (!isInitializedRef.current) return;
    const payload = { dispatch: stateRef.current.dispatch, pdfData: stateRef.current.pdfData };
    const current = JSON.stringify(payload);
    if (current === lastPushedRef.current) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const prevPushed = lastPushedRef.current;
    lastPushedRef.current = current;
    pushSessionState('regiones', { ...payload, sessionDate: SESSION_DATE }, userId ?? undefined)
      .catch(() => { lastPushedRef.current = prevPushed; })
      .finally(() => { lastPushCompletedAtRef.current = Date.now(); });
    try { localStorage.setItem(REGIONES_KEY, JSON.stringify(stateRef.current)); } catch {}
  }, [userId]);

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
