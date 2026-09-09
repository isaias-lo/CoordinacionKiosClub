'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ViendoInfo { id: string; name: string; at: number; }

interface PresenceMeta { tienda: string | null; name: string; at: number }

/**
 * Presencia en vivo por tienda — quién la tiene abierta AHORA MISMO (fase 1 del pedido de
 * "no saben quién está haciendo qué"). Usa Supabase Realtime Presence: es efímero, vive en
 * memoria del canal, no una tabla — se resetea solo cuando todos se desconectan, que es
 * exactamente la semántica que queremos ("¿quién está viendo esto EN ESTE MOMENTO?", no un
 * historial). El historial de qué se hizo ya existe aparte (`logActividad`/`/api/actividad`).
 *
 * `fuente` separa el canal entre Santiago (nacional) y Regiones para no mezclar sus tiendas —
 * son bodegas distintas, con códigos de tienda que pueden coincidir por casualidad.
 */
export function usePresenciaTienda(fuente: 'nacional' | 'regiones', tiendaAbierta: string | null): {
  /** cod de tienda (tal cual se pasa en `tiendaAbierta`) → quiénes más la tienen abierta. Nunca
   *  incluye al usuario propio. */
  viendoPorTienda: Map<string, ViendoInfo[]>;
} {
  const { profile } = useAuth();
  const [viendoPorTienda, setViendoPorTienda] = useState<Map<string, ViendoInfo[]>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Ref (no dep de efecto): la tienda actual se lee al momento de trackear, sin tener que
  // recrear el canal completo cada vez que el usuario cambia de tienda.
  const tiendaRef = useRef(tiendaAbierta);
  tiendaRef.current = tiendaAbierta;

  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`presencia-bodega-${fuente}`, {
      config: { presence: { key: profile.id } },
    });
    channelRef.current = channel;

    const sync = () => {
      const state = channel.presenceState<PresenceMeta>();
      const next = new Map<string, ViendoInfo[]>();
      for (const [id, metas] of Object.entries(state)) {
        if (id === profile.id || !metas.length) continue;  // nunca mostrarse a uno mismo
        const meta = metas[metas.length - 1];  // más de una pestaña del mismo usuario → la última
        if (!meta.tienda) continue;
        const arr = next.get(meta.tienda) ?? [];
        arr.push({ id, name: meta.name, at: meta.at });
        next.set(meta.tienda, arr);
      }
      setViendoPorTienda(next);
    };

    channel
      .on('presence', { event: 'sync' }, sync)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ tienda: tiendaRef.current, name: profile.full_name ?? 'Alguien', at: Date.now() } satisfies PresenceMeta);
        }
      });

    return () => { supabase.removeChannel(channel); channelRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente, profile?.id]);

  // Solo actualiza el "track" (sin recrear canal) cuando cambia la tienda que se está mirando.
  useEffect(() => {
    if (!channelRef.current || !profile) return;
    void channelRef.current.track({ tienda: tiendaAbierta, name: profile.full_name ?? 'Alguien', at: Date.now() } satisfies PresenceMeta);
  }, [tiendaAbierta, profile]);

  return { viendoPorTienda };
}
