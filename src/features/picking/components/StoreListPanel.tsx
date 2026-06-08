'use client';

import React, { useState, useMemo } from 'react';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import type { PickingOperation, TodayStore, StoreGroupKey } from '../picking-types';
import { getStoreGroup, GROUP_LABELS } from '../picking-utils';

const GROUP_STYLE: Record<StoreGroupKey, { bg: string; color: string }> = {
  region:   { bg: 'rgba(37,99,235,0.07)',  color: '#1D4ED8' },
  costa:    { bg: 'rgba(16,185,129,0.07)', color: '#059669' },
  santiago: { bg: 'rgba(26,37,80,0.05)',   color: '#374151' },
};
const GROUP_ORDER: StoreGroupKey[] = ['region', 'costa', 'santiago'];

interface Props {
  selectedCods: string[];
  loadingCods: string[];
  errorCods: string[];
  opsMap: Record<string, PickingOperation[]>;
  todayStores: TodayStore[];
  storesLoading: boolean;
  onToggleStore: (cod: string) => void;
  tiendaOverrides?: Record<string, string>; // nombres desde Supabase (override del hardcoded)
}

export const StoreListPanel = React.memo(function StoreListPanel({
  selectedCods, loadingCods, errorCods, opsMap, todayStores, storesLoading, onToggleStore, tiendaOverrides = {},
}: Props) {
  const [q, setQ] = useState('');

  const { grouped, isFallback } = useMemo(() => {
    const upper = q.trim().toUpperCase();
    let source: TodayStore[];
    let fallback = false;

    if (todayStores.length > 0) {
      // Aplicar overrides a los nombres de todayStores antes de filtrar
      const withOverrides = todayStores.map(s => ({ ...s, name: tiendaOverrides[s.cod] || s.name }));
      const filtered = upper
        ? withOverrides.filter(s => s.cod.includes(upper) || s.name.toUpperCase().includes(upper))
        : withOverrides;
      if (filtered.length > 0) { source = filtered; }
      else {
        source = Object.entries(TIENDAS_INICIAL)
          .filter(([cod, info]) => !upper || cod.includes(upper) || (tiendaOverrides[cod] || info.n).toUpperCase().includes(upper))
          .map(([cod, info]) => ({ cod, name: tiendaOverrides[cod] || info.n, sources: [] as ('rm' | 'regiones')[] }));
        fallback = true;
      }
    } else {
      source = Object.entries(TIENDAS_INICIAL)
        .filter(([cod, info]) => !upper || cod.includes(upper) || (tiendaOverrides[cod] || info.n).toUpperCase().includes(upper))
        .map(([cod, info]) => ({ cod, name: tiendaOverrides[cod] || info.n, sources: [] as ('rm' | 'regiones')[] }));
      fallback = true;
    }

    const groups: Record<StoreGroupKey, TodayStore[]> = { region: [], costa: [], santiago: [] };
    for (const store of source) groups[getStoreGroup(store)].push(store);
    return { grouped: groups, isFallback: fallback };
  }, [q, todayStores, tiendaOverrides]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div className="font-barlow-condensed text-[14px] font-bold text-navy uppercase tracking-widest mb-2 flex items-center gap-2">
          Tiendas de hoy
          {storesLoading
            ? <span className="text-[12px] text-text-3 font-normal normal-case">cargando…</span>
            : todayStores.length > 0
              ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[rgba(217,119,6,0.12)] text-amber-700">{todayStores.length}</span>
              : null}
          {selectedCods.length > 0 && (
            <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">{selectedCods.length} sel.</span>
          )}
        </div>
        <div className="flex items-center gap-2 bg-[#F5F6FA] border border-border rounded-xl px-3 py-2.5">
          <svg className="w-4 h-4 text-text-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar tienda…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] font-barlow text-text min-w-0" />
          {q && <button onClick={() => setQ('')} className="text-text-3 border-none bg-transparent cursor-pointer text-[18px] leading-none shrink-0">×</button>}
        </div>
        {isFallback && !storesLoading && (
          <div className="mt-1.5 text-[12px] text-text-3 italic">
            {todayStores.length === 0 ? 'Sin despachos hoy — mostrando todas' : 'Sin coincidencias hoy — buscando en todas'}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {storesLoading && <div className="px-4 py-6 text-center text-[13px] text-text-3">Cargando despachos de hoy…</div>}
        {!storesLoading && GROUP_ORDER.map(gKey => {
          const stores = grouped[gKey];
          if (stores.length === 0) return null;
          const style = GROUP_STYLE[gKey];
          return (
            <div key={gKey}>
              <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10"
                style={{ background: style.bg, color: style.color, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                {GROUP_LABELS[gKey]} ({stores.length})
              </div>
              {stores.map(store => {
                const isSelected  = selectedCods.includes(store.cod);
                const isLoading   = loadingCods.includes(store.cod);
                const hasError    = errorCods.includes(store.cod);
                const ops         = opsMap[store.cod] ?? [];
                // Check completion of the 4 Abastecimiento categories
                const totalOps = ops.length;
                const doneOps = ops.filter(o => o.state === 'done').length;
                const storeStatus: 'none' | 'partial' | 'complete' =
                  totalOps === 0 ? 'none' : doneOps === totalOps ? 'complete' : 'partial';
                const pickerCount = isSelected && ops.length > 0 ? new Set(ops.map(o => o.responsible || 'Sin asignar')).size : 0;
                const opCount     = ops.length;
                return (
                  <button key={store.cod} onClick={() => onToggleStore(store.cod)} disabled={isLoading}
                    className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-border cursor-pointer text-left transition-all disabled:cursor-wait"
                    style={{
                      background:  isSelected ? 'rgba(217,119,6,0.09)' : 'transparent',
                      borderLeft: `4px solid ${storeStatus === 'complete' ? '#16A34A' : storeStatus === 'partial' ? '#F59E0B' : isSelected ? '#D97706' : 'transparent'}`,
                    }}>
                    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
                      style={{ borderColor: storeStatus === 'complete' ? '#16A34A' : storeStatus === 'partial' ? '#F59E0B' : isSelected ? '#D97706' : 'rgba(26,37,80,0.2)', background: isSelected ? (storeStatus === 'complete' ? '#16A34A' : storeStatus === 'partial' ? '#F59E0B' : '#D97706') : 'transparent' }}>
                      {isSelected && <span className="text-white text-[11px] font-bold leading-none">✓</span>}
                    </div>
                    <span className="font-mono text-[13px] font-bold shrink-0 px-2 py-0.5 rounded-lg"
                      style={{ background: isSelected ? 'rgba(217,119,6,0.15)' : 'rgba(26,37,80,0.07)', color: isSelected ? '#D97706' : '#374151' }}>
                      {store.cod}
                    </span>
                    <span className="text-[14px] truncate flex-1" style={{ color: isSelected ? '#B45309' : '#374151', fontWeight: isSelected ? 600 : 400 }}>
                      {store.name}
                    </span>
                    {isLoading && <span className="text-[14px] shrink-0">⏳</span>}
                    {hasError && !isLoading && <span className="text-[13px] shrink-0" title="Error al cargar — haz clic para reintentar">⚠️</span>}
                    {storeStatus === 'complete' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }}>
                        ✓ Listo
                      </span>
                    )}
                    {storeStatus === 'partial' && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#D97706', border: '1px solid rgba(245,158,11,0.3)' }}>
                        {doneOps}/{totalOps}
                      </span>
                    )}
                    {isSelected && !isLoading && storeStatus !== 'complete' && opCount > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(217,119,6,0.18)', color: '#D97706' }}>
                        {pickerCount}p · {opCount}op
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
