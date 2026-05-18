'use client';

import { createContext, useContext, useReducer, ReactNode, useEffect, useRef } from 'react';
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

function loadState(): SantiagoState {
  if (typeof window === 'undefined') return defaultState;
  try {
    const raw = localStorage.getItem('santiagoState');
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
}

const SantiagoContext = createContext<SantiagoContextValue | null>(null);

const SANTIAGO_KEY = 'santiagoState';

export function SantiagoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const { user } = useAuth();
  const userId = user?.id;
  const lastPushedRef = useRef<string>('');
  const debounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch from Supabase on login + subscribe to Realtime for cross-device sync
  useEffect(() => {
    if (!userId) return;

    fetchSessionState('santiago').then((remote) => {
      if (!remote) return;
      const s = remote as SyncableState;
      if ((s.step as string) === 'resumen') s.step = 'form';
      lastPushedRef.current = JSON.stringify({ step: s.step, regimen: s.regimen, items: s.items });
      dispatch({ type: 'LOAD_STATE', payload: s });
    });

    const unsub = subscribeToSessionState('santiago', userId, (remoteState) => {
      const s = remoteState as SyncableState;
      if ((s.step as string) === 'resumen') s.step = 'form';
      lastPushedRef.current = JSON.stringify({ step: s.step, regimen: s.regimen, items: s.items });
      dispatch({ type: 'LOAD_STATE', payload: s });
    });

    return unsub;
  }, [userId]);

  // Debounced push to Supabase (1.5s) + localStorage fallback
  useEffect(() => {
    const payload: SyncableState = { step: state.step, regimen: state.regimen, items: state.items };
    const current = JSON.stringify(payload);
    if (current === lastPushedRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastPushedRef.current = current;
      pushSessionState('santiago', payload);
      try { localStorage.setItem(SANTIAGO_KEY, JSON.stringify(state)); } catch {}
    }, 1500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state.step, state.regimen, state.items, state]);

  return (
    <SantiagoContext.Provider value={{ state, dispatch }}>
      {children}
    </SantiagoContext.Provider>
  );
}

export function useSantiago() {
  const ctx = useContext(SantiagoContext);
  if (!ctx) throw new Error('useSantiago must be used within SantiagoProvider');
  return ctx;
}
