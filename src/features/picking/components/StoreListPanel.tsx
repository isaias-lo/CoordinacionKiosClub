'use client';

import React, { useState, useMemo } from 'react';
import { Loader2, AlertTriangle, Search, X, Zap, Trash2, Check } from 'lucide-react';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import type { PickingOperation, TodayStore, StoreGroupKey } from '../picking-types';
import { getStoreGroup, GROUP_LABELS, isPickeableState } from '../picking-utils';

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
  onOpenAdelanto?: () => void;              // abrir diálogo "agregar tienda (adelanto)"
  onDeleteAdelanto?: (id: number) => void;  // eliminar una tienda de adelanto
}

export const StoreListPanel = React.memo(function StoreListPanel({
  selectedCods, loadingCods, errorCods, opsMap, todayStores, storesLoading, onToggleStore, tiendaOverrides = {},
  onOpenAdelanto, onDeleteAdelanto,
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
        <div className="font-barlow-condensed text-[14px] font-semibold text-navy uppercase tracking-widest mb-2 flex items-center gap-2">
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
        <div className="flex items-center gap-2 bg-[var(--color-bg)] border border-border rounded-xl px-3 py-2">
          <Search size={16} className="text-text-3 shrink-0" aria-hidden="true" />
          <label htmlFor="store-search" className="sr-only">Buscar tienda</label>
          <input id="store-search" type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar tienda…"
            className="flex-1 bg-transparent border-none outline-none text-[14px] font-barlow text-text min-w-0" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda"
              className="text-text-3 border-none bg-transparent cursor-pointer shrink-0 flex items-center">
              <X size={14} />
            </button>
          )}
        </div>
        {onOpenAdelanto && (
          <button onClick={onOpenAdelanto}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold cursor-pointer transition-colors"
            style={{ background: 'rgba(30,64,175,0.06)', color: '#1E40AF', border: '1.5px dashed rgba(30,64,175,0.35)' }}>
            <Zap size={13} aria-hidden="true" /> Agregar tienda (adelanto)
          </button>
        )}
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
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest sticky top-0 z-10"
                style={{ background: style.bg, color: style.color, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                {GROUP_LABELS[gKey]} ({stores.length})
              </div>
              {stores.map(store => {
                const isSelected  = selectedCods.includes(store.cod);
                const isLoading   = loadingCods.includes(store.cod);
                const hasError    = errorCods.includes(store.cod);
                const ops         = opsMap[store.cod] ?? [];
                // Solo pickeables (assigned/partially_available/done) cuentan para la fracción:
                // un 'confirmed'/'waiting' sin stock (duplicado/backorder) no debe restar completitud.
                const totalOps = ops.filter(o => isPickeableState(o.state)).length;
                const doneOps = ops.filter(o => o.state === 'done').length;
                const storeStatus: 'none' | 'partial' | 'complete' =
                  totalOps === 0 ? 'none' : doneOps === totalOps ? 'complete' : 'partial';
                const pickerCount = isSelected && ops.length > 0 ? new Set(ops.map(o => o.responsible || 'Sin asignar')).size : 0;
                const opCount     = ops.length;
                // Texto para lectores de pantalla — el estado hoy se comunica solo con el
                // borde de color izquierdo (y con el fondo cuando está seleccionada).
                const statusText = storeStatus === 'complete' ? 'Todo realizado'
                  : storeStatus === 'partial' ? `${doneOps} de ${totalOps} operaciones`
                  : isSelected ? 'Seleccionada' : 'Sin operaciones';
                return (
                  <div key={store.cod}
                    className="w-full flex items-center border-b border-border transition-all"
                    style={{
                      background:  isSelected ? 'rgba(217,119,6,0.09)' : 'transparent',
                      borderLeft: `4px solid ${storeStatus === 'complete' ? '#16A34A' : storeStatus === 'partial' ? '#F59E0B' : isSelected ? '#D97706' : 'transparent'}`,
                    }}>
                    <button onClick={() => onToggleStore(store.cod)} disabled={isLoading}
                      aria-pressed={isSelected}
                      className="flex-1 min-w-0 flex items-center gap-2 px-4 py-3 cursor-pointer text-left transition-all disabled:cursor-wait border-none bg-transparent">
                      <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all"
                        style={{ borderColor: storeStatus === 'complete' ? '#16A34A' : storeStatus === 'partial' ? '#F59E0B' : isSelected ? '#D97706' : 'rgba(26,37,80,0.2)', background: isSelected ? (storeStatus === 'complete' ? '#16A34A' : storeStatus === 'partial' ? '#F59E0B' : '#D97706') : 'transparent' }}>
                        {isSelected && <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <span className="font-mono text-[13px] font-bold shrink-0 px-2 py-0.5 rounded-lg"
                        style={{ background: isSelected ? 'rgba(217,119,6,0.15)' : 'rgba(26,37,80,0.07)', color: isSelected ? '#D97706' : '#374151' }}>
                        {store.cod}
                      </span>
                      <span className="text-[14px] truncate flex-1" style={{ color: isSelected ? '#B45309' : '#374151', fontWeight: isSelected ? 600 : 400 }}>
                        {store.name}
                      </span>
                      <span className="sr-only">{statusText}</span>
                      {isLoading && <span className="shrink-0"><Loader2 size={14} className="animate-spin text-text-3" /></span>}
                      {hasError && !isLoading && <span className="shrink-0" title="Error al cargar — haz clic para reintentar"><AlertTriangle size={14} className="text-amber-600" /></span>}
                      {storeStatus === 'complete' && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1"
                          style={{ background: 'rgba(22,163,74,0.15)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.3)' }}>
                          <Check size={11} aria-hidden="true" /> Listo
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
                      {store.adelanto && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1"
                          title={store.adelanto.fecha_despacho ? `Despacho: ${store.adelanto.fecha_despacho}` : 'Adelanto'}
                          style={{ background: 'rgba(30,64,175,0.12)', color: '#1E40AF', border: '1px solid rgba(30,64,175,0.3)' }}>
                          <Zap size={9} aria-hidden="true" /> Adelanto
                        </span>
                      )}
                    </button>
                    {store.adelanto && onDeleteAdelanto && (
                      <button type="button" onClick={() => onDeleteAdelanto(store.adelanto!.id)}
                        aria-label={`Eliminar adelanto de ${store.cod}`} title="Eliminar adelanto"
                        className="shrink-0 flex items-center justify-center px-2.5 py-3 cursor-pointer border-none bg-transparent">
                        <Trash2 size={13} style={{ color: '#DC2626' }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
