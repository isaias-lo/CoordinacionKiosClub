'use client';

import { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useCallback } from 'react';
import type {
  SantiagoState, SantiagoItem, TiendaSantiago, RegimenCarga,
} from '../types';
import { useAuth } from '@/components/AuthProvider';
import { pushSessionState, fetchSessionState, subscribeToSessionState } from '@/lib/userSessionState';
import { useVisibilityRefetch } from '@/hooks/useVisibilityRefetch';

// Se eliminó el paso de selección de Régimen: se entra directo a la bodega (lista de
// tiendas) con régimen 'Seco' por defecto (es el que se escribe en Sheets/despacho_rm).
const defaultState: SantiagoState = {
  step: 'form',
  regimen: 'Seco',
  currentTienda: null,
  items: {},
};

type SyncableState = {
  step: SantiagoState['step'];
  regimen: RegimenCarga | null;
  items: Record<string, SantiagoItem[]>;
  fechaDespacho?: string;
  registrado?: boolean;
};

const _d = new Date();
const todayKey = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
const SANTIAGO_KEY = `santiagoState_${todayKey}`;

function isTodayPush(pushedAt: unknown): boolean {
  if (typeof pushedAt !== 'number') return false; // no timestamp — reject to avoid stale data
  const d = new Date(pushedAt);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}
export const SANTIAGO_TERMINADO_KEY = `santiagoTerminado_${todayKey}`;

function loadState(): SantiagoState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(SANTIAGO_KEY);
    if (!raw) return defaultState;
    const s = JSON.parse(raw) as SantiagoState & { _savedAt?: number };
    // Reject if the saved state has no timestamp or was written on a different day
    if (!isTodayPush(s._savedAt)) return defaultState;
    // Ya no existe el paso de Régimen: siempre se entra directo a la lista de tiendas.
    if (typeof window !== 'undefined') sessionStorage.removeItem('santiago_resume_form');
    s.step = 'form';
    if (!s.regimen) s.regimen = 'Seco';
    return s;
  } catch {
    return defaultState;
  }
}

type SantiagoAction =
  | { type: 'SET_REGIMEN'; payload: RegimenCarga }
  | { type: 'BACK_TO_REGIMEN' }
  | { type: 'SELECT_TIENDA'; payload: TiendaSantiago }
  | { type: 'CLEAR_TIENDA' }
  | { type: 'ADD_ITEM'; item: SantiagoItem }
  | { type: 'DELETE_ITEM'; tiendaCod: string; idx: number }
  | { type: 'EDIT_ITEM'; tiendaCod: string; idx: number; item: SantiagoItem }
  | { type: 'SET_ITEMS'; tiendaCod: string; items: SantiagoItem[] }
  | { type: 'RESET' }
  | { type: 'LOAD_STATE'; payload: SyncableState }
  | { type: 'SET_FECHA_DESPACHO'; payload: string }
  | { type: 'SET_REGISTRADO'; payload: boolean };

function reducer(state: SantiagoState, action: SantiagoAction): SantiagoState {
  switch (action.type) {
    case 'SET_REGIMEN':
      return { ...state, regimen: action.payload, step: 'form' };

    case 'BACK_TO_REGIMEN':
      return { ...state, step: 'regimen', currentTienda: null };

    case 'SELECT_TIENDA':
      return { ...state, currentTienda: action.payload };

    case 'CLEAR_TIENDA':
      return { ...state, currentTienda: null };

    case 'ADD_ITEM': {
      const cod = action.item.tiendaCod;
      return {
        ...state,
        items: { ...state.items, [cod]: [...(state.items[cod] || []), action.item] },
      };
    }

    case 'DELETE_ITEM': {
      const list = (state.items[action.tiendaCod] || []).filter((_, i) => i !== action.idx);
      return { ...state, items: { ...state.items, [action.tiendaCod]: list } };
    }

    case 'EDIT_ITEM': {
      const list = [...(state.items[action.tiendaCod] || [])];
      list[action.idx] = action.item;
      return { ...state, items: { ...state.items, [action.tiendaCod]: list } };
    }

    case 'SET_ITEMS':
      return { ...state, items: { ...state.items, [action.tiendaCod]: action.items } };

    case 'RESET':
      return { ...defaultState };

    case 'LOAD_STATE':
      return {
        ...state,
        // step is intentionally not synced — each device controls its own navigation
        regimen:       action.payload.regimen       ?? state.regimen,
        items:         action.payload.items         ?? state.items,
        fechaDespacho: action.payload.fechaDespacho ?? state.fechaDespacho,
        registrado:    action.payload.registrado    ?? state.registrado,
      };

    case 'SET_FECHA_DESPACHO':
      return { ...state, fechaDespacho: action.payload, registrado: false };

    case 'SET_REGISTRADO':
      return { ...state, registrado: action.payload };

    default:
      return state;
  }
}

interface SantiagoContextValue {
  state: SantiagoState;
  dispatch: React.Dispatch<SantiagoAction>;
  flushPending: () => void;
}

const SantiagoContext = createContext<SantiagoContextValue | null>(null);

export function SantiagoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const { user } = useAuth();
  const userId = user?.id;

  // Always-current ref so async callbacks never see stale state
  const stateRef        = useRef(state);
  stateRef.current      = state;
  const lastPushedRef   = useRef<string>('');
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPushingRef    = useRef(false); // true while the async Supabase upsert is in-flight
  const isInitializedRef = useRef(false);
  const clearedAtRef         = useRef<number>(0); // timestamp of last intentional RESET push
  const lastPushTimestampRef = useRef<number>(0); // pushedAt value included in last push payload
  const catchUpRef        = useRef<() => void>(() => {}); // [P9] re-fetch + apply remoto (catch-up)
  const pendingCatchupRef = useRef(false);                // [P9] remoto llegó durante push local → catch-up al terminar

  // Load + subscribe + poll (Realtime fires instantly; poll is the guaranteed fallback)
  useEffect(() => {
    isInitializedRef.current = false;
    if (!userId) return;

    const normalize = (s: SyncableState): SyncableState => ({
      ...s,
      step: (s.step as string) === 'resumen' ? 'form' : s.step,
    });

    const handleRemote = (remoteState: unknown) => {
      // Block if local push is pending (debounce) or in-flight (async upsert).
      // [P9] En vez de descartar, marcamos catch-up: al terminar el push re-consultamos y aplicamos.
      if (debounceRef.current !== null || isPushingRef.current) { pendingCatchupRef.current = true; return; }
      // Block for 30 s after an intentional RESET to prevent remote from restoring cleared data
      if (Date.now() - clearedAtRef.current < 30_000) return;
      // Reject data without an explicit sessionDate or from a different calendar day
      const remoteSessionDate = (remoteState as { sessionDate?: string }).sessionDate;
      if (!remoteSessionDate || remoteSessionDate !== todayKey) return;
      // Reject remote data older than our last push — prevents a stale tab/device from overwriting fresh local data
      const rawPushedAt = (remoteState as { pushedAt?: number }).pushedAt;
      if (typeof rawPushedAt === 'number' && rawPushedAt < lastPushTimestampRef.current) return;

      const remote = normalize(remoteState as SyncableState);
      const remoteStr = JSON.stringify({ step: remote.step, regimen: remote.regimen, items: remote.items });
      if (remoteStr === lastPushedRef.current) return; // already in sync

      const localStr = JSON.stringify({
        step: stateRef.current.step, regimen: stateRef.current.regimen, items: stateRef.current.items,
      });
      const isDirty = localStr !== lastPushedRef.current;

      if (isDirty && remote.items) {
        const merged = { ...remote.items, ...stateRef.current.items };
        dispatch({ type: 'LOAD_STATE', payload: { step: stateRef.current.step, regimen: stateRef.current.regimen, items: merged } });
      } else {
        lastPushedRef.current = remoteStr;
        dispatch({ type: 'LOAD_STATE', payload: remote });
      }
    };

    // [P9] Catch-up: re-consulta el estado y lo aplica (usado al volver a la pestaña/app y tras un push)
    catchUpRef.current = () => {
      fetchSessionState('santiago').then((remote) => { if (remote) handleRemote(remote); }).catch(() => {});
    };

    // Initial fetch
    fetchSessionState('santiago')
      .then((remote) => {
        isInitializedRef.current = true;
        if (!remote) return;
        // Reject data without an explicit sessionDate or from a different calendar day
        const remoteSessionDate = (remote as { sessionDate?: string }).sessionDate;
        if (!remoteSessionDate || remoteSessionDate !== todayKey) return;
        const s = normalize(remote as SyncableState);
        lastPushedRef.current = JSON.stringify({ step: s.step, regimen: s.regimen, items: s.items });
        dispatch({ type: 'LOAD_STATE', payload: s });
      })
      .catch(() => { isInitializedRef.current = true; });

    // Realtime subscription (instant when WebSocket works). Track connection health so the
    // polling fallback below only runs when Realtime is down — otherwise we'd re-download the
    // full state blob every 15 s on every open tab (wasted egress).
    let realtimeConnected = false;
    const unsub = subscribeToSessionState('santiago', userId, handleRemote, (connected) => {
      const reconnected = connected && !realtimeConnected;
      realtimeConnected = connected;
      // On (re)connect, fetch once to catch any change missed while the socket was down.
      if (reconnected) {
        fetchSessionState('santiago').then((remote) => { if (remote) handleRemote(remote); }).catch(() => {});
      }
    });

    // Polling fallback every 15 s — ONLY fires when Realtime is disconnected (3 s was too aggressive)
    const pollId = setInterval(async () => {
      if (realtimeConnected) return;
      try {
        const remote = await fetchSessionState('santiago');
        if (remote) handleRemote(remote);
      } catch {}
    }, 15000);

    return () => { unsub(); clearInterval(pollId); };
  }, [userId]);

  // Debounced push to Supabase (2.5 s after last change) + localStorage fallback.
  // The debounce window also throttles how often the full row is re-broadcast over Realtime
  // to every subscriber — a longer window means fewer rebroadcasts of the whole blob (egress).
  // The unmount cleanup flushes to localStorage so navigating away never loses data.
  useEffect(() => {
    if (!isInitializedRef.current) return;
    const payload: SyncableState = {
      step: state.step, regimen: state.regimen, items: state.items,
      fechaDespacho: state.fechaDespacho, registrado: state.registrado,
    };
    const current = JSON.stringify(payload);
    if (current === lastPushedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // Mark a clear so handleRemote won't restore data for 30 s
      const isEmpty = Object.keys(payload.items).length === 0;
      if (isEmpty) clearedAtRef.current = Date.now();
      const prevLastPushed = lastPushedRef.current;
      lastPushedRef.current = current;
      isPushingRef.current = true;
      const pushedAt = Date.now();
      lastPushTimestampRef.current = pushedAt;
      pushSessionState('santiago', { ...payload, pushedAt, sessionDate: todayKey }, userId ?? undefined)
        .catch(() => { lastPushedRef.current = prevLastPushed; }) // reset so dirty check retries correctly
        .finally(() => {
          isPushingRef.current = false;
          // [P9] Si llegó un remoto mientras empujábamos, ponerse al día ahora (no se descarta).
          if (pendingCatchupRef.current) { pendingCatchupRef.current = false; catchUpRef.current(); }
        });
      try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify({ ...state, _savedAt: Date.now() })); } catch {}
    }, 2500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        // Flush synchronously on unmount so navigating away doesn't lose data
        try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify({ ...stateRef.current, _savedAt: Date.now() })); } catch {}
      }
    };
  }, [state.step, state.regimen, state.items, state.fechaDespacho, state.registrado, state]);

  // Flush any pending debounced push immediately — call before navigating away
  const flushPending = useCallback(() => {
    if (!isInitializedRef.current) return;
    const payload: SyncableState = {
      step: stateRef.current.step, regimen: stateRef.current.regimen, items: stateRef.current.items,
      fechaDespacho: stateRef.current.fechaDespacho, registrado: stateRef.current.registrado,
    };
    const current = JSON.stringify(payload);
    if (current === lastPushedRef.current) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    const prevPushed = lastPushedRef.current;
    lastPushedRef.current = current;
    const pushedAt = Date.now();
    lastPushTimestampRef.current = pushedAt;
    pushSessionState('santiago', { ...payload, pushedAt, sessionDate: todayKey }, userId ?? undefined)
      .catch(() => { lastPushedRef.current = prevPushed; });
    try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify({ ...stateRef.current, _savedAt: Date.now() })); } catch {}
  }, [userId]);

  // [P9] Al volver a la pestaña/app → catch-up con el estado remoto; al ocultarla → flush de pendientes.
  useVisibilityRefetch(() => catchUpRef.current(), flushPending);

  return (
    <SantiagoContext.Provider value={{ state, dispatch, flushPending }}>
      {children}
    </SantiagoContext.Provider>
  );
}

export function useSantiago() {
  const ctx = useContext(SantiagoContext);
  if (!ctx) throw new Error('useSantiago must be used within SantiagoProvider');
  return ctx;
}
