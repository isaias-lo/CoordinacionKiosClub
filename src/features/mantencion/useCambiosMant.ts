'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Avisa cuando cambia algo de Mantención, para que el tablero se recargue solo.
 *
 * Escucha `mant_solicitudes`, `mant_comentarios` y `mant_fotos` por Supabase Realtime, como el
 * resto de la app (ver `useTiendaTerminada`). Realtime respeta el RLS: Jesús recibe todo porque
 * `mant_ve_todo()` le deja ver todo.
 *
 * DOS COSAS QUE HAY QUE SABER:
 *
 *  · Las tablas tienen que estar en la publicación `supabase_realtime`
 *    (sql/2026-11-21_mantencion_realtime.sql). Si no están, la suscripción no da error: solo no
 *    llega nada. Por eso además se recarga al volver a la pestaña, que cubre ese caso y el de un
 *    computador que se durmió con la conexión cortada.
 *  · Un cambio trae varios eventos seguidos (la solicitud, sus fotos, su bitácora). Se espera un
 *    momento y se recarga una sola vez.
 */
export function useCambiosMant(alCambiar: () => void): void {
  const ref = useRef(alCambiar);
  ref.current = alCambiar;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const avisar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => ref.current(), 800);
    };
    const canal = supabase.channel(`mantencion-${Math.random().toString(36).slice(2, 8)}`);
    for (const table of ['mant_solicitudes', 'mant_comentarios', 'mant_fotos']) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table }, avisar);
    }
    canal.subscribe();

    const alVolver = () => { if (document.visibilityState === 'visible') avisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      void supabase.removeChannel(canal);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
