'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * Hook compartido: devuelve el conjunto de códigos de tienda cuyo picking
 * está TERMINADO hoy (todos sus slots activos tienen canonical_id, es decir,
 * fueron impresos). Se actualiza en tiempo real vía Supabase Realtime.
 *
 * Lo usan tanto las bodegas (Santiago / Regiones) como Estado/Seguimiento
 * para mostrar un indicador verde cuando Picking terminó los movimientos.
 */
export function usePickingReady(): Set<string> {
  const [ready, setReady] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from('picking_pallets')
      .select('store_cod, canonical_id')
      .eq('date', today)
      .eq('is_active', true);
    if (!data) return;

    // Agrupar por tienda: lista (cod, ¿impreso?)
    const byStore: Record<string, { total: number; printed: number }> = {};
    for (const row of data) {
      const cod = row.store_cod as string;
      if (!cod) continue;
      if (!byStore[cod]) byStore[cod] = { total: 0, printed: 0 };
      byStore[cod].total++;
      if (row.canonical_id) byStore[cod].printed++;
    }

    // Lista cuando tiene slots y TODOS están impresos
    const set = new Set<string>();
    for (const [cod, { total, printed }] of Object.entries(byStore)) {
      if (total > 0 && printed === total) set.add(cod);
    }
    setReady(set);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const channel = supabase
      .channel('picking-ready-shared')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picking_pallets', filter: `date=eq.${today}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  return ready;
}
