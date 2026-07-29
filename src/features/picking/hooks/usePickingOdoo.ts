'use client';

import { useState, useCallback, useEffect } from 'react';
import type { PickingOperation } from '../picking-types';
import { AUTO_REFRESH_MS } from '../picking-types';
import { isAbastecimientoOp, parseOrigin, resolveStoreCode } from '../picking-utils';

interface UsePickingOdooParams {
  selectedCods:   string[];
  initialOpsMap?: Record<string, PickingOperation[]>;
}

interface UsePickingOdooResult {
  hasOdoo:       boolean;
  opsMap:        Record<string, PickingOperation[]>;
  loadingCods:   string[];
  errorCods:     string[];
  lastRefresh:   Date | null;
  refreshingId:  number | null;
  fetchBatchOps:    (cods: string[]) => Promise<void>;
  fetchOpsForStore: (cod: string)   => Promise<void>;
  refreshOp:        (op: PickingOperation, storeCod: string) => Promise<void>;
}

export function usePickingOdoo({ selectedCods, initialOpsMap = {} }: UsePickingOdooParams): UsePickingOdooResult {
  const hasOdoo = !!process.env.NEXT_PUBLIC_ODOO_URL;

  const [opsMap,       setOpsMap]       = useState<Record<string, PickingOperation[]>>(initialOpsMap);
  const [loadingCods,  setLoadingCods]  = useState<string[]>([]);
  const [errorCods,    setErrorCods]    = useState<string[]>([]);
  const [lastRefresh,  setLastRefresh]  = useState<Date | null>(null);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  // ─── Batch fetch ─────────────────────────────────────────────────────────────
  // Un solo request para todas las tiendas, reemplaza N fetches paralelos.

  const fetchBatchOps = useCallback(async (cods: string[]) => {
    if (!hasOdoo || !cods.length) return;
    setLoadingCods(prev => [...prev, ...cods.filter(c => !prev.includes(c))]);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_batch_operations', cods }),
      });
      const data = (await res.json()) as {
        byStore?: Record<string, Array<{
          id: number; name: string; origin: string; partner: string;
          fromLocation: string; toLocation: string; state: string;
          scheduledDate: string; dateDone: string | null; pickingType: string;
          responsible: string; responsibleId: number | null; lineCount: number; batch?: string;
        }>>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error Odoo');
      const updates: Record<string, PickingOperation[]> = {};
      for (const [cod, pickings] of Object.entries(data.byStore ?? {})) {
        updates[cod] = pickings
          .filter(p => isAbastecimientoOp(p.origin) && !p.origin.toUpperCase().startsWith('AUDITORIA'))
          .map(p => {
            const { categories, originDate } = parseOrigin(p.origin);
            return { ...p, categories, storeCodeFromOrigin: resolveStoreCode(p), originDate };
          });
      }
      setOpsMap(prev => ({ ...prev, ...updates }));
      setErrorCods(prev => prev.filter(c => !cods.includes(c)));
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[picking:batch]', e);
      setErrorCods(prev => [...new Set([...prev, ...cods.filter(c => !prev.includes(c))])]);
    } finally {
      setLoadingCods(prev => prev.filter(c => !cods.includes(c)));
    }
  }, [hasOdoo]);

  // ─── Single-store fetch (al agregar una tienda individualmente) ───────────────

  const fetchOpsForStore = useCallback(async (cod: string) => {
    if (!hasOdoo) return;
    setLoadingCods(prev => [...prev, cod]);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_today_operations', query: cod }),
      });
      const data = (await res.json()) as {
        pickings?: Array<{
          id: number; name: string; origin: string; partner: string;
          fromLocation: string; toLocation: string; state: string;
          scheduledDate: string; dateDone: string | null; pickingType: string;
          responsible: string; responsibleId: number | null; lineCount: number; batch?: string;
        }>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Error Odoo');
      const parsed: PickingOperation[] = (data.pickings ?? [])
        .filter(p => isAbastecimientoOp(p.origin) && !p.origin.toUpperCase().startsWith('AUDITORIA'))
        .map(p => {
          const { categories, originDate } = parseOrigin(p.origin);
          return { ...p, categories, storeCodeFromOrigin: resolveStoreCode(p), originDate };
        });
      setOpsMap(prev => ({ ...prev, [cod]: parsed }));
      setErrorCods(prev => prev.filter(c => c !== cod));
      setLastRefresh(new Date());
    } catch (e) {
      console.error('[picking]', e);
      setErrorCods(prev => prev.includes(cod) ? prev : [...prev, cod]);
    } finally {
      setLoadingCods(prev => prev.filter(c => c !== cod));
    }
  }, [hasOdoo]);

  // ─── Refresh individual picking ───────────────────────────────────────────────

  const refreshOp = useCallback(async (op: PickingOperation, storeCod: string) => {
    if (!hasOdoo) return;
    setRefreshingId(op.id);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'picking_check_state', query: op.name }),
      });
      const data = (await res.json()) as { state?: string; dateDone?: string | null };
      if (res.ok && data.state) {
        setOpsMap(prev => ({
          ...prev,
          [storeCod]: (prev[storeCod] ?? []).map(o =>
            o.id === op.id ? { ...o, state: data.state!, dateDone: data.dateDone ?? o.dateDone } : o
          ),
        }));
      }
    } catch { /* silent */ }
    setRefreshingId(null);
  }, [hasOdoo]);

  // ─── Auto-refresh silencioso cada 3 minutos ───────────────────────────────────

  useEffect(() => {
    if (selectedCods.length === 0) return;
    // Refresco INMEDIATO al entrar / al cambiar la selección, con debounce de 400ms para no
    // disparar durante la carga (el churn de selectedCods se estabiliza). Así el semáforo
    // refleja el estado REAL de Odoo desde el inicio, sin tener que dar clic tienda por tienda.
    // Odoo protegido: caché de 30s + dedup in-flight en /api/odoo → no se agrega carga real.
    const debounce = setTimeout(() => {
      if (document.visibilityState !== 'hidden') void fetchBatchOps(selectedCods);
    }, 400);
    const id = setInterval(() => {
      if (document.visibilityState !== 'hidden') void fetchBatchOps(selectedCods);
    }, AUTO_REFRESH_MS);
    return () => { clearTimeout(debounce); clearInterval(id); };
  }, [selectedCods, fetchBatchOps]);

  // Refresca al volver a la pestaña tras haber estado oculta.
  useEffect(() => {
    if (selectedCods.length === 0) return;
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void fetchBatchOps(selectedCods);
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, [selectedCods, fetchBatchOps]);

  return { hasOdoo, opsMap, loadingCods, errorCods, lastRefresh, refreshingId, fetchBatchOps, fetchOpsForStore, refreshOp };
}
