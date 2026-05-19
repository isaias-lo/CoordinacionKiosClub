'use client';

import { createContext, useContext, useReducer, ReactNode, useEffect, useRef, useCallback } from 'react';
import type {
  SantiagoState, SantiagoItem, TiendaSantiago, RegimenCarga,
} from '../types';
import { useAuth } from '@/components/AuthProvider';
import { pushSessionState, fetchSessionState, subscribeToSessionState } from '@/lib/userSessionState';

const defaultState: SantiagoState = {
  step: 'regimen',
  regimen: null,
  currentTienda: null,
  items: {},
};

type SyncableState = {
  step: SantiagoState['step'];
  regimen: RegimenCarga | null;
  items: Record<string, SantiagoItem[]>;
};

const todayKey = new Date().toISOString().split('T')[0];
const SANTIAGO_KEY = `santiagoState_${todayKey}`;
export const SANTIAGO_TERMINADO_KEY = `santiagoTerminado_${todayKey}`;

function loadState(): SantiagoState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem(SANTIAGO_KEY);
    if (!raw) return defaultState;
    const s = JSON.parse(raw) as SantiagoState;
    if ((s.step as string) === 'resumen') s.step = 'form';
    return s;
  } catch {
    return defaultState;
  }
}

type SantiagoAction =
  | { type: 'SET_REGIMEN'; payload: RegimenCarga }
  | { type: 'SELECT_TIENDA'; payload: TiendaSantiago }
  | { type: 'CLEAR_TIENDA' }
  | { type: 'ADD_ITEM'; item: SantiagoItem }
  | { type: 'DELETE_ITEM'; tiendaCod: string; idx: number }
  | { type: 'EDIT_ITEM'; tiendaCod: string; idx: number; item: SantiagoItem }
  | { type: 'SET_ITEMS'; tiendaCod: string; items: SantiagoItem[] }
  | { type: 'RESET' }
  | { type: 'LOAD_STATE'; payload: SyncableState };

function reducer(state: SantiagoState, action: SantiagoAction): SantiagoState {
  switch (action.type) {
    case 'SET_REGIMEN':
      return { ...state, regimen: action.payload, step: 'form' };

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
        step:    action.payload.step    ?? state.step,
        regimen: action.payload.regimen ?? state.regimen,
        items:   action.payload.items   ?? state.items,
      };

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
  const clearedAtRef    = useRef<number>(0); // timestamp of last intentional RESET push

  // Load + subscribe + poll (Realtime fires instantly; poll is the guaranteed fallback)
  useEffect(() => {
    isInitializedRef.current = false;
    if (!userId) return;

    const normalize = (s: SyncableState): SyncableState => ({
      ...s,
      step: (s.step as string) === 'resumen' ? 'form' : s.step,
    });

    const handleRemote = (remoteState: unknown) => {
      // Block if local push is pending (debounce) or in-flight (async upsert)
      if (debounceRef.current !== null || isPushingRef.current) return;
      // Block for 30 s after an intentional RESET to prevent remote from restoring cleared data
      if (Date.now() - clearedAtRef.current < 30_000) return;

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

    // Initial fetch
    fetchSessionState('santiago')
      .then((remote) => {
        isInitializedRef.current = true;
        if (!remote) return;
        const s = normalize(remote as SyncableState);
        lastPushedRef.current = JSON.stringify({ step: s.step, regimen: s.regimen, items: s.items });
        dispatch({ type: 'LOAD_STATE', payload: s });
      })
      .catch(() => { isInitializedRef.current = true; });

    // Realtime subscription (instant when WebSocket works)
    const unsub = subscribeToSessionState('santiago', userId, handleRemote);

    // Polling fallback every 3 s — guarantees sync even when Realtime drops
    const pollId = setInterval(async () => {
      try {
        const remote = await fetchSessionState('santiago');
        if (remote) handleRemote(remote);
      } catch {}
    }, 3000);

    return () => { unsub(); clearInterval(pollId); };
  }, [userId]);

  // Debounced push to Supabase (800 ms after last change) + localStorage fallback
  useEffect(() => {
    if (!isInitializedRef.current) return;
    const payload: SyncableState = { step: state.step, regimen: state.regimen, items: state.items };
    const current = JSON.stringify(payload);
    if (current === lastPushedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      // Mark a clear so handleRemote won't restore data for 30 s
      const isEmpty = Object.keys(payload.items).length === 0;
      if (isEmpty) clearedAtRef.current = Date.now();
      lastPushedRef.current = current;
      isPushingRef.current = true;
      pushSessionState('santiago', payload, userId ?? undefined)
        .finally(() => { isPushingRef.current = false; });
      try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify(state)); } catch {}
    }, 800);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [state.step, state.regimen, state.items, state]);

  // Flush any pending debounced push immediately — call before navigating away
  const flushPending = useCallback(() => {
    if (!isInitializedRef.current) return;
    const payload: SyncableState = { step: stateRef.current.step, regimen: stateRef.current.regimen, items: stateRef.current.items };
    const current = JSON.stringify(payload);
    if (current === lastPushedRef.current) return;
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    lastPushedRef.current = current;
    pushSessionState('santiago', payload, userId ?? undefined);
    try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify(stateRef.current)); } catch {}
  }, [userId]);

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
