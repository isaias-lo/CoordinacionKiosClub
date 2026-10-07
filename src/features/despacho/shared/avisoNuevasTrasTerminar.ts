'use client';

// El toast cuando Picking imprime algo en una tienda que Bodega ya marcó terminada.
//
// La lista ya lo muestra («1 nueva de Picking»), pero solo si alguien la está mirando. El toast
// llega aunque se esté pesando otra tienda. Avisa cuando el número SUBE: no al abrir la pantalla
// (eso ya lo cuenta la lista) ni cuando baja (alguien la guardó).
//
// Al entrar, los slots de Picking y las marcas de terminada llegan por partes: el número sube de 0
// a N sin que Picking haya impreso nada. Por eso los primeros segundos solo se toma la foto.

import { useEffect, useRef } from 'react';

export interface NuevasDeTienda { cod: string; nombre: string; nuevas: number }

/** Las tiendas cuyo número de unidades nuevas subió desde la vez anterior. Puro. */
export function nuevasQueSubieron(
  antes: ReadonlyMap<string, number> | null, ahora: readonly NuevasDeTienda[],
): NuevasDeTienda[] {
  if (!antes) return [];
  return ahora.filter(t => t.nuevas > (antes.get(t.cod) ?? 0));
}

export function textoAvisoNuevas(t: NuevasDeTienda, antes: number): string {
  const n = t.nuevas - antes;
  return `⚠ ${t.nombre}: Picking imprimió ${n === 1 ? '1 unidad' : `${n} unidades`} después de terminarla`;
}

/** Lo que tarda en llegar todo al abrir la pantalla. */
const CALENTAMIENTO_MS = 10_000;

export function useAvisoNuevasTrasTerminar(
  tiendas: readonly NuevasDeTienda[], showToast: (msg: string, color?: string) => void,
) {
  const antes = useRef<Map<string, number> | null>(null);
  const desde = useRef(0);
  // Una clave estable para no correr el efecto en cada render.
  const clave = tiendas.map(t => `${t.cod}:${t.nuevas}`).join('|');
  useEffect(() => {
    if (!desde.current) desde.current = Date.now();
    const calentando = Date.now() - desde.current < CALENTAMIENTO_MS;
    for (const t of calentando ? [] : nuevasQueSubieron(antes.current, tiendas)) {
      showToast(textoAvisoNuevas(t, antes.current?.get(t.cod) ?? 0), '#B45309');
    }
    antes.current = new Map(tiendas.map(t => [t.cod, t.nuevas]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
}
