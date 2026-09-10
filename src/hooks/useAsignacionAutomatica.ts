'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRealtimeRefresh } from './useRealtimeRefresh';
import { CLAVE_AUTO, leerFlagAuto, escribirFlagAuto } from '@/features/despacho/rutas/utils/autoAsignar';

/**
 * El interruptor "Asignación automática", compartido por todo el equipo.
 *
 * Mismo patrón que `useOdooActivo`: lee `config_despacho` por `GET /api/parametros-sistema`
 * (abierto a cualquier usuario autenticado) y se refresca por Realtime, así que apagarlo desde un
 * equipo se ve en los demás en segundos. La diferencia es que este además escribe.
 *
 * Antes vivía en `localStorage`, o sea uno por navegador: alguien lo apagaba para armar a mano y
 * en el equipo de al lado seguía en ON, adelantando camiones sobre el armado del primero.
 *
 * `guardar` NO decide permisos — eso lo hace el servidor, que exige admin en el POST. Acá solo se
 * refleja lo que pasó: si el POST falla, se vuelve al valor que diga el servidor.
 */
export function useAsignacionAutomatica(): {
  activo: boolean;
  guardar: (v: boolean) => Promise<boolean>;
} {
  // Optimista mientras carga, igual que useOdooActivo: ON es el comportamiento de siempre.
  const [activo, setActivo] = useState(true);

  const load = useCallback(() => {
    fetch('/api/parametros-sistema')
      .then(r => (r.ok ? r.json() : null))
      .then((json: { data?: Record<string, string> } | null) => {
        if (json?.data) setActivo(leerFlagAuto(json.data));
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh('config_despacho', load, true, 30_000, 300);

  const guardar = useCallback(async (v: boolean): Promise<boolean> => {
    const previo = activo;
    setActivo(v);  // optimista: el interruptor responde al toque, el Realtime confirma a los demás
    try {
      const res = await fetch('/api/parametros-sistema', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave: CLAVE_AUTO, valor: escribirFlagAuto(v) }),
      });
      if (!res.ok) { setActivo(previo); return false; }  // 403 de no-admin, o cualquier fallo
      return true;
    } catch {
      setActivo(previo);
      return false;
    }
  }, [activo]);

  return { activo, guardar };
}
