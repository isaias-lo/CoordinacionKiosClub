'use client';

// Cuál de las tarjetas sin guardar va abierta. La regla está en `idActiva` (unidadVisual.ts).
//
// Tres caminos la cambian:
//   · Escanear una etiqueta (`foco`): gana siempre, y queda elegida cuando el salto termina.
//   · Tocar una unidad de la cola (`elegir`).
//   · Agregar una unidad a mano (`esperarNueva` antes de crearla): la nueva se abre sola. La que
//     crea la reconstrucción automática desde Picking NO se abre: eso le cambiaría la tarjeta a
//     alguien que está escribiendo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { idActiva } from './unidadVisual';

export function useTarjetaActiva<R extends { id: string; pickingSlotId?: number | null }>(
  pendientes: readonly R[],
  foco: number | null,
) {
  const [elegida, setElegida] = useState<string | null>(null);
  const antes = useRef<{ ids: Set<string>; hasta: number } | null>(null);

  const idFoco = foco == null ? null : (pendientes.find(p => p.pickingSlotId === foco)?.id ?? null);
  useEffect(() => { if (idFoco) setElegida(idFoco); }, [idFoco]);

  const firma = pendientes.map(p => p.id).join('|');
  useEffect(() => {
    const espera = antes.current;
    if (!espera) return;
    if (Date.now() > espera.hasta) { antes.current = null; return; }
    const nueva = pendientes.find(p => !espera.ids.has(p.id));
    if (nueva) { setElegida(nueva.id); antes.current = null; }
    // `firma` resume `pendientes`: el arreglo es nuevo en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  const esperarNueva = useCallback(() => {
    antes.current = { ids: new Set(pendientes.map(p => p.id)), hasta: Date.now() + 8000 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma]);

  return {
    activaId: idActiva(pendientes, { foco, elegida }),
    elegir: setElegida,
    esperarNueva,
  };
}
