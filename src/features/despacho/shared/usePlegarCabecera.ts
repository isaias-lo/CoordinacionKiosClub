'use client';

import { useEffect, useRef, useState } from 'react';
import { debePlegarse } from './plegarCabecera';

/**
 * Pliega fechas y buscador cuando la lista se bajó lo suficiente. Ver `plegarCabecera.ts`.
 * `ocupada` = el buscador tiene texto o foco: así no se esconde mientras se escribe o escanea.
 *
 * Devuelve dos refs de callback (no `useRef`): si la lista aparece después del primer render
 * —una pantalla que carga—, el efecto se entera igual y empieza a escuchar.
 */
export function usePlegarCabecera(ocupada: boolean): {
  plegada: boolean;
  refLista: (el: HTMLElement | null) => void;
  refCabecera: (el: HTMLElement | null) => void;
} {
  const [lista, refLista] = useState<HTMLElement | null>(null);
  const [cabecera, refCabecera] = useState<HTMLElement | null>(null);
  const [plegada, setPlegada] = useState(false);
  const estado = useRef({ plegada: false, alto: 0 });

  useEffect(() => {
    if (!lista) return;
    const revisar = () => {
      // El alto se mide solo mientras se ve; plegada, vale el último medido.
      if (!estado.current.plegada && cabecera) estado.current.alto = cabecera.offsetHeight;
      const sobra = lista.scrollHeight - lista.clientHeight + (estado.current.plegada ? estado.current.alto : 0);
      const siguiente = debePlegarse({
        arriba: lista.scrollTop, sobra, altoCabecera: estado.current.alto,
        plegada: estado.current.plegada, ocupada,
      });
      if (siguiente !== estado.current.plegada) {
        estado.current.plegada = siguiente;
        setPlegada(siguiente);
      }
    };
    revisar();
    lista.addEventListener('scroll', revisar, { passive: true });
    return () => lista.removeEventListener('scroll', revisar);
  }, [lista, cabecera, ocupada]);

  return { plegada, refLista, refCabecera };
}
