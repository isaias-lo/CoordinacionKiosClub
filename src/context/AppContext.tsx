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
  let pc = 1, bc = 1;
  return items.map(i => ({ ...i, orden: i.pkg === 'pallet' ? `pallet${pc++}` : `bulto${bc++}` }));
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
  getStats: () => { pallets: number; bultos: number; tiendas: number };
}

const AppContext = createContext<AppContextValue | null>(null);

const REGIONES_KEY = `regionesState_${new Date().toISOString().split('T')[0]}`;

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
  const lastPushedRef   = useRef<string>('');
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitializedRef = useRef(false);

  // Load + subscribe + poll (Realtime fires instantly; poll is the guaranteed fallback)
  useEffect(() => {
    isInitializedRef.current = false;
    if (!userId) return;

    const handleRemote = (remoteState: unknown) => {
      const remote = remoteState as { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData> };
      const remoteStr = JSON.stringify(remoteState);
      if (remoteStr === lastPushedRef.current) return; // already in sync

      const localStr = JSON.stringify({ dispatch: stateRef.current.dispatch, pdfData: stateRef.current.pdfData });
      const isDirty  = localStr !== lastPushedRef.current;

      if (isDirty && remote.dispatch) {
        const merged = { ...remote.dispatch, ...stateRef.current.dispatch };
        dispatch({ type: 'LOAD_STATE', payload: { dispatch: merged, pdfData: stateRef.current.pdfData } });
      } else {
        lastPushedRef.current = remoteStr;
        dispatch({ type: 'LOAD_STATE', payload: remote });
      }
    };

    // Initial fetch
    fetchSessionState('regiones')
      .then((remote) => {
        isInitializedRef.current = true;
        if (!remote) return;
        lastPushedRef.current = JSON.stringify(remote);
        dispatch({ type: 'LOAD_STATE', payload: remote as { dispatch?: Record<string, DispatchItem[]>; pdfData?: Record<string, PdfData> } });
      })
      .catch(() => { isInitializedRef.current = true; });

    // Realtime subscription (instant when WebSocket works)
    const unsub = subscribeToSessionState('regiones', userId, handleRemote);

    // Polling fallback every 8 s — guarantees sync even when Realtime drops
    const pollId = setInterval(async () => {
      try {
        const remote = await fetchSessionState('regiones');
        if (remote) handleRemote(remote);
      } catch {}
    }, 8000);

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
      lastPushedRef.current = current;
      pushSessionState('regiones', payload, userId ?? undefined);
      try { localStorage.setItem(REGIONES_KEY, current); } catch {}
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [state.dispatch, state.pdfData]);

  const showToast = useCallback((msg: string, color?: string) => {
    dispatch({ type: 'SHOW_TOAST', msg, color });
    setTimeout(() => dispatch({ type: 'HIDE_TOAST' }), 3000);
  }, []);

  const getStats = useCallback(() => {
    let pallets = 0, bultos = 0, tiendas = 0;
    for (const items of Object.values(state.dispatch)) {
      if (items.length > 0) tiendas++;
      for (const item of items) item.pkg === 'pallet' ? pallets++ : bultos++;
    }
    return { pallets, bultos, tiendas };
  }, [state.dispatch]);

  return (
    <AppContext.Provider value={{ state, dispatch, showToast, getStats }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
