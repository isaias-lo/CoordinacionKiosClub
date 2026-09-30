'use client';

// Los movimientos de Odoo del día, agrupados por tienda, para el bloque de cruce de las tarjetas.
//
// ── UNA SOLA VEZ POR PANTALLA, NO UNA POR TARJETA ──────────────────────────────────────────────
//
// Se pide el día ENTERO y se indexa por código. Abrir una tarjeta no dispara nada: la tienda que se
// abre ya está en el mapa. Pedir por tienda habría sido una llamada por clic, y con veinte tiendas
// abiertas en una jornada eso es veinte veces el mismo trabajo.
//
// Y del lado de Odoo tampoco cuesta: `cruce_pesos_dia` reusa `getDayPickings`, la consulta diaria
// que la app ya hace para armar Picking y que está cacheada 30 s. Pedir el cruce de una tienda o de
// todas cuesta lo mismo que no pedirlo.
//
// ── SOLO SI HACE FALTA ─────────────────────────────────────────────────────────────────────────
//
// `activo` en false y no se pide nada. Lo usa el permiso: quien no ve el bloque no paga la consulta.

import { useEffect, useRef, useState } from 'react';
import { armarCruce, type FilaCruce, type MovimientoOdoo } from './cruceDePesos';

export interface CruceDelDia {
  /** Código de tienda → su fila de Odoo. Vacío mientras carga o si falló. */
  porTienda: Map<string, FilaCruce>;
  listo: boolean;
  error: string | null;
}

const VACIO: CruceDelDia = { porTienda: new Map(), listo: false, error: null };

export function useCruceDelDia(fechaISO: string, activo: boolean): CruceDelDia {
  const [estado, setEstado] = useState<CruceDelDia>(VACIO);
  // La fecha que se está pidiendo AHORA. Sin esto, una respuesta lenta de ayer puede pisar la de
  // hoy cuando se cambia de día — el mismo patrón que `fechaCargadaRef` en el Enrutador.
  const pidiendoRef = useRef<string>('');

  useEffect(() => {
    if (!activo || !fechaISO) { setEstado(VACIO); return; }
    let vivo = true;
    pidiendoRef.current = fechaISO;
    setEstado(VACIO);

    (async () => {
      try {
        const [movRes, tiendasRes] = await Promise.all([
          fetch('/api/odoo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cruce_pesos_dia', fecha: fechaISO }),
          }),
          fetch('/api/tiendas'),
        ]);
        const movJson = await movRes.json() as { movimientos?: MovimientoOdoo[] };
        const tJson   = await tiendasRes.json() as { tiendas?: Array<{ codigo?: string }> };
        if (!vivo || pidiendoRef.current !== fechaISO) return;

        const codigos = new Set(
          (tJson.tiendas ?? []).map(t => String(t.codigo ?? '').toUpperCase().trim()).filter(Boolean),
        );
        // El catálogo NO se valida con una expresión regular: el destino "88ML/Stock" tiene forma de
        // código de tienda y no lo es (ver `tiendaDeDestino`).
        const filas = armarCruce(movJson.movimientos ?? [], codigos);
        setEstado({ porTienda: new Map(filas.map(f => [f.codigo, f])), listo: true, error: null });
      } catch (e) {
        if (!vivo || pidiendoRef.current !== fechaISO) return;
        // No rompe nada: sin cruce, la tarjeta sigue funcionando igual. Es un informe, no el trabajo.
        console.error('[cruce-tienda]', e);
        setEstado({ porTienda: new Map(), listo: true, error: String(e) });
      }
    })();

    return () => { vivo = false; };
  }, [fechaISO, activo]);

  return estado;
}
