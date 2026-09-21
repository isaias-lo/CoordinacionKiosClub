'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ViendoInfo { id: string; name: string; at: number; }

interface PresenceMeta { tienda: string | null; slotId: number | null; name: string; at: number }

/**
 * Presencia en vivo por tienda — quién la tiene abierta AHORA MISMO (fase 1 del pedido de
 * "no saben quién está haciendo qué"). Usa Supabase Realtime Presence: es efímero, vive en
 * memoria del canal, no una tabla — se resetea solo cuando todos se desconectan, que es
 * exactamente la semántica que queremos ("¿quién está viendo esto EN ESTE MOMENTO?", no un
 * historial). El historial de qué se hizo ya existe aparte (`logActividad`/`/api/actividad`).
 *
 * `fuente` separa el canal entre Santiago (nacional) y Regiones para no mezclar sus tiendas —
 * son bodegas distintas, con códigos de tienda que pueden coincidir por casualidad.
 *
 * [Fase 2 — por pallet] `slotAbierto` es un nivel más fino que la tienda: qué unidad de Picking
 * (picking_pallets.id) tiene el foco AHORA MISMO — la tarjeta cuyo peso/alto/etc. la persona está
 * escribiendo. Antes solo se sabía "estamos los dos en la misma tienda"; esto avisa "estamos los
 * dos en el MISMO pallet", que es la señal que de verdad previene el reingreso (ver
 * `itemPorUnidad.ts` → `esReingreso`) en vez de solo registrarlo después de que ya pasó.
 */
export function usePresenciaTienda(fuente: 'nacional' | 'regiones', tiendaAbierta: string | null, slotAbierto: number | null = null): {
  /** cod de tienda (tal cual se pasa en `tiendaAbierta`) → quiénes más la tienen abierta. Nunca
   *  incluye al usuario propio. */
  viendoPorTienda: Map<string, ViendoInfo[]>;
  /** picking_pallets.id → quiénes más tienen ESA tarjeta con el foco ahora. Nunca incluye al
   *  usuario propio. */
  viendoPorSlot: Map<number, ViendoInfo[]>;
} {
  const { profile } = useAuth();
  const [viendoPorTienda, setViendoPorTienda] = useState<Map<string, ViendoInfo[]>>(new Map());
  const [viendoPorSlot, setViendoPorSlot] = useState<Map<number, ViendoInfo[]>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Refs (no deps de efecto): se leen al momento de trackear, sin recrear el canal completo cada
  // vez que el usuario cambia de tienda o de tarjeta enfocada.
  const tiendaRef = useRef(tiendaAbierta);
  tiendaRef.current = tiendaAbierta;
  const slotRef = useRef(slotAbierto);
  slotRef.current = slotAbierto;

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`presencia-bodega-${fuente}`, {
      config: { presence: { key: profile.id } },
    });
    channelRef.current = channel;

    const sync = () => {
      const state = channel.presenceState<PresenceMeta>();
      const nextTienda = new Map<string, ViendoInfo[]>();
      const nextSlot = new Map<number, ViendoInfo[]>();
      for (const [id, metas] of Object.entries(state)) {
        if (id === profile.id || !metas.length) continue;  // nunca mostrarse a uno mismo
        const meta = metas[metas.length - 1];  // más de una pestaña del mismo usuario → la última
        if (meta.tienda) {
          const arr = nextTienda.get(meta.tienda) ?? [];
          arr.push({ id, name: meta.name, at: meta.at });
          nextTienda.set(meta.tienda, arr);
        }
        if (meta.slotId != null) {
          const arr = nextSlot.get(meta.slotId) ?? [];
          arr.push({ id, name: meta.name, at: meta.at });
          nextSlot.set(meta.slotId, arr);
        }
      }
      setViendoPorTienda(nextTienda);
      setViendoPorSlot(nextSlot);
    };

    channel
      .on('presence', { event: 'sync' }, sync)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ tienda: tiendaRef.current, slotId: slotRef.current, name: profile.full_name ?? 'Alguien', at: Date.now() } satisfies PresenceMeta);
        }
      });

    return () => { supabase.removeChannel(channel); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente, profile?.id]);

  // Solo actualiza el "track" (sin recrear canal) cuando cambia la tienda o la tarjeta enfocada.
  useEffect(() => {
    if (!channelRef.current || !profile) return;
    void channelRef.current.track({ tienda: tiendaAbierta, slotId: slotAbierto, name: profile.full_name ?? 'Alguien', at: Date.now() } satisfies PresenceMeta);
  }, [tiendaAbierta, slotAbierto, profile]);

  return { viendoPorTienda, viendoPorSlot };
}
