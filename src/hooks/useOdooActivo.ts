'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRealtimeRefresh } from './useRealtimeRefresh';

/**
 * true mientras el administrador no haya apagado Odoo desde el panel (/admin/sistema).
 * Lee `config_despacho.odoo_activo` vía el endpoint ya existente (GET /api/parametros-sistema,
 * abierto a cualquier usuario autenticado) — sin fila todavía ⇒ activo por defecto.
 *
 * Puramente informativo para la UI (mostrar el aviso de modo manual sin intentar el request):
 * el corte real que garantiza que ningún request llega a Odoo vive server-side, en
 * /api/odoo/route.ts — este hook solo evita el viaje inútil y explica por qué.
 */
export function useOdooActivo(): boolean {
  const [activo, setActivo] = useState(true); // optimista mientras carga: no bloquea la UI de arranque

  const load = useCallback(() => {
    fetch('/api/parametros-sistema')
      .then(r => (r.ok ? r.json() : null))
      .then((json: { data?: Record<string, string> } | null) => {
        if (json?.data && 'odoo_activo' in json.data) setActivo(json.data.odoo_activo !== 'false');
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh('config_despacho', load, true, 30_000, 300);

  return activo;
}
