'use client';

import React, { useState, useMemo } from 'react';
import { Loader2, AlertTriangle, X, Trash2 } from 'lucide-react';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import type { PickingOperation, TodayStore, StoreGroupKey } from '../picking-types';
import { getStoreGroup, GROUP_LABELS, isPickeableState } from '../picking-utils';

// Santiago arriba, como en el diseño: es el grupo con más tiendas cada día.
const GROUP_ORDER: StoreGroupKey[] = ['santiago', 'region', 'costa'];

interface Props {
  selectedCods: string[];
  loadingCods: string[];
  errorCods: string[];
  opsMap: Record<string, PickingOperation[]>;
  todayStores: TodayStore[];
  storesLoading: boolean;
  /** [m-12] Selecciona o quita el grupo entero. Sin esto, trabajar por grupo son 18 clicks. */
  onToggleGrupo?: (cods: string[], seleccionar: boolean) => void;
  onToggleStore: (cod: string) => void;
  tiendaOverrides?: Record<string, string>; // nombres desde Supabase (override del hardcoded)
  onOpenAdelanto?: () => void;              // abrir diálogo "agregar tienda (adelanto)"
  onDeleteAdelanto?: (id: number) => void;  // eliminar una tienda de adelanto
  /** Teléfono y handheld: pasar a la planilla con las tiendas elegidas. En escritorio las dos
   *  partes se ven juntas y no hace falta. */
  onVerElegidas?: () => void;
}

export const StoreListPanel = React.memo(function StoreListPanel({
  selectedCods, loadingCods, errorCods, opsMap, todayStores, storesLoading, onToggleStore, onToggleGrupo, tiendaOverrides = {},
  onOpenAdelanto, onDeleteAdelanto, onVerElegidas,
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
    <div className="pk-stores">
      <div className="pk-sh">
        <div className="t">
          Tiendas de hoy
          <span>
            {storesLoading ? 'cargando…' : todayStores.length > 0 ? `${todayStores.length}` : ''}
            {!storesLoading && todayStores.length > 0 && selectedCods.length > 0 ? ' · ' : ''}
            {selectedCods.length > 0 ? `${selectedCods.length} ${selectedCods.length === 1 ? 'elegida' : 'elegidas'}` : ''}
          </span>
        </div>
        <div className="pk-search">
          <label htmlFor="store-search" className="sr-only">Buscar tienda</label>
          <input id="store-search" type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar tienda o código…" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda"
              className="border-none bg-transparent cursor-pointer shrink-0 flex items-center" style={{ color: '#8A91A1' }}>
              <X size={14} />
            </button>
          )}
        </div>
        {onOpenAdelanto && (
          <button type="button" onClick={onOpenAdelanto} className="pk-btn" style={{ padding: 6 }}>
            + Adelantar tienda
          </button>
        )}
        {isFallback && !storesLoading && (
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            {todayStores.length === 0 ? 'Sin despachos hoy: mostrando todas' : 'Sin coincidencias hoy: buscando en todas'}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {storesLoading && <div className="px-4 py-6 text-center" style={{ fontSize: 13, color: '#6B7280' }}>Cargando despachos de hoy…</div>}
        {!storesLoading && GROUP_ORDER.map(gKey => {
          const stores = grouped[gKey];
          if (stores.length === 0) return null;
          const cods = stores.map(s => s.cod);
          const elegidas = cods.filter(c => selectedCods.includes(c)).length;
          const todas = elegidas === cods.length;
          const contenido = (
            <>
              <span>{GROUP_LABELS[gKey]} · {stores.length}</span>
              {onToggleGrupo && (
                <span className="acc">{elegidas > 0 ? `${elegidas} ${elegidas === 1 ? 'elegida' : 'elegidas'}` : 'Elegir todas'}</span>
              )}
            </>
          );
          return (
            <div key={gKey}>
              {onToggleGrupo ? (
                <button type="button" className="pk-sg"
                  onClick={() => onToggleGrupo(cods, !todas)}
                  aria-pressed={todas}
                  title={todas ? `Quitar las ${cods.length} tiendas de ${GROUP_LABELS[gKey]}` : `Elegir las ${cods.length} tiendas de ${GROUP_LABELS[gKey]}`}>
                  {contenido}
                </button>
              ) : (
                <div className="pk-sg">{contenido}</div>
              )}
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
                return (
                  <div key={store.cod} className="flex items-stretch">
                    <button type="button" onClick={() => onToggleStore(store.cod)} disabled={isLoading}
                      aria-pressed={isSelected}
                      className={`pk-sr${isSelected ? ' sel' : ''}`}>
                      <span className="ck" aria-hidden="true">
                        {isSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </span>
                      <span className="c">{store.cod}</span>
                      <span className="nm">{store.name}</span>
                      <span className="fin">
                        {isLoading && <Loader2 size={14} className="animate-spin" style={{ color: '#8A91A1' }} aria-label="Cargando" />}
                        {hasError && !isLoading && <span title="Error al cargar: toca para reintentar"><AlertTriangle size={14} style={{ color: '#A3271A' }} aria-label="Error al cargar" /></span>}
                        {store.adelanto && (
                          <span className="pk-pill info" title={store.adelanto.fecha_despacho ? `Despacho: ${store.adelanto.fecha_despacho}` : 'Adelanto'}>Adelanto</span>
                        )}
                        {storeStatus === 'complete' && <span className="pk-pill ok">Listo</span>}
                        {storeStatus === 'partial' && (
                          <span className="pk-pill warn" aria-label={`${doneOps} de ${totalOps} operaciones`}>{doneOps}/{totalOps} ops</span>
                        )}
                      </span>
                    </button>
                    {store.adelanto && onDeleteAdelanto && (
                      <button type="button" onClick={() => onDeleteAdelanto(store.adelanto!.id)}
                        aria-label={`Eliminar adelanto de ${store.cod}`} title="Eliminar adelanto"
                        className="shrink-0 flex items-center justify-center px-2.5 cursor-pointer border-none"
                        style={{ background: isSelected ? '#F3F5FD' : 'transparent' }}>
                        <Trash2 size={13} style={{ color: '#A3271A' }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {onVerElegidas && selectedCods.length > 0 && (
        <div className="lg:hidden flex-shrink-0 p-3 bg-white" style={{ borderTop: '1px solid #E4E7EC' }}>
          <button type="button" onClick={onVerElegidas} className="pk-btn pri w-full min-h-[48px]" style={{ fontSize: 16 }}>
            Ver {selectedCods.length === 1 ? 'la tienda' : `las ${selectedCods.length} tiendas`} →
          </button>
        </div>
      )}
    </div>
  );
});
