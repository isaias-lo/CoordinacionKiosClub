'use client';

import { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import type { AppState, DispatchItem, TipoContenido, TipoPaquete, PdfData } from '../types';

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
  | { type: 'HIDE_TOAST' };

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

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

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
