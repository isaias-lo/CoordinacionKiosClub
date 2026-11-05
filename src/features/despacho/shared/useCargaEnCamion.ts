'use client';

import { useEffect, useState } from 'react';
import { cargaPorTienda, type CargaCamion, type RutaCargada } from './cargaEnCamion';

// Las tiendas del día que ya van en un camión cerrado. Ver `cargaEnCamion.ts`.
//
// `rutas_despacho` tiene RLS sin políticas: desde el navegador devuelve cero filas sin error. Por
// eso se pide a /api/rutas-despacho, que lee con service role (CLAUDE.md, regla 5).
//
// Se refresca cada minuto con la pantalla a la vista y al volver a ella. Un camión se cierra unas
// pocas veces al día: no hace falta tiempo real, y una consulta por minuto por equipo es poco.

const CADA_MS = 60_000;
const VACIO: ReadonlyMap<string, CargaCamion> = new Map();

export function useCargaEnCamion(fecha: string | null | undefined, tipo: 'seco' | 'congelado' = 'seco'): ReadonlyMap<string, CargaCamion> {
  const [carga, setCarga] = useState<ReadonlyMap<string, CargaCamion>>(VACIO);

  useEffect(() => {
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { setCarga(VACIO); return; }
    let vivo = true;
    const traer = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/api/rutas-despacho?carga=1&fecha=${encodeURIComponent(fecha)}`);
        if (!res.ok) return;  // Si falla, se queda lo último que se supo: no se despinta nada.
        const json = await res.json() as { data?: RutaCargada[] };
        if (vivo) setCarga(cargaPorTienda(json.data ?? [], tipo));
      } catch { /* sin red: se reintenta en el próximo minuto */ }
    };
    setCarga(VACIO);
    void traer();
    const id = window.setInterval(traer, CADA_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') void traer(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; window.clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [fecha, tipo]);

  return carga;
}
