import { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import type {
  SantiagoState, SantiagoItem, TiendaSantiago, RegimenCarga,
} from '../types';

const defaultState: SantiagoState = {
  step: 'regimen',
  regimen: null,
  currentTienda: null,
  items: {},
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
  | { type: 'RESET' };

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

    default:
      return state;
  }
}

interface SantiagoContextValue {
  state: SantiagoState;
  dispatch: React.Dispatch<SantiagoAction>;
}

const SantiagoContext = createContext<SantiagoContextValue | null>(null);

export function SantiagoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => {
    try {
      localStorage.setItem('santiagoState', JSON.stringify(state));
    } catch {}
  }, [state]);

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
