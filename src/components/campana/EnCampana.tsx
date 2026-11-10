'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { almacenCampana, type NivelAviso } from './avisosCampana';

const servidor = () => 0;

/** Si en la pantalla hay una campana montada. En el servidor y al hidratar, no. */
export function useHayCampana(): boolean {
  return useSyncExternalStore(almacenCampana.suscribir, () => almacenCampana.leer().campanas, servidor) > 0;
}

/**
 * Envuelve un aviso para que viva en la campana de la cabecera y no arriba de la pantalla.
 * Montarlo = el aviso existe; desmontarlo = se va. Sin campana en la pantalla, dibuja `children`
 * en su sitio de siempre. Ver `avisosCampana.ts`.
 *
 * El estado del aviso (plegado, modal abierto…) tiene que vivir FUERA de `children`: al aparecer o
 * irse la campana, el contenido se vuelve a montar en el otro lugar.
 */
export function EnCampana({ id, nivel, titulo, children }: {
  id: string; nivel: NivelAviso; titulo: string; children: ReactNode;
}) {
  const hay = useHayCampana();
  // Un nodo propio por aviso: la campana lo cuelga en su panel en el orden que le toca.
  const [nodo] = useState<HTMLElement | null>(() => (typeof document === 'undefined' ? null : document.createElement('div')));

  useEffect(() => {
    if (!hay || !nodo) return;
    return almacenCampana.anotar({ id, nivel, titulo, nodo });
  }, [hay, id, nivel, titulo, nodo]);

  if (!hay) return <>{children}</>;
  return nodo ? createPortal(children, nodo) : null;
}
