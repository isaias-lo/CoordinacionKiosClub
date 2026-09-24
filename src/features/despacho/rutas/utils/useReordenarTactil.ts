'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { indiceDestino, esMovimientoReal } from './reordenarTactil';

/**
 * Arrastrar con el dedo una lista vertical.
 *
 * `draggable` / `onDragStart` / `onDrop` son la API HTML5 de arrastre, y es de MOUSE: un teléfono
 * no dispara ninguno de esos eventos. Por eso el Planificador solo se podía reordenar en computador.
 * El gesto táctil hay que armarlo a mano, y es lo que hace este hook — el mismo patrón que ya
 * funciona en `ManualDispatch` (fantasma que sigue al dedo + `elementFromPoint` para saber sobre
 * qué fila está), acá reducido a una lista de índices.
 *
 * El cálculo que se puede equivocar en silencio vive aparte y con tests, en `reordenarTactil.ts`.
 *
 * Uso: `contenedorRef` va en el div que envuelve las filas, cada fila lleva `data-idx={i}`, y el
 * asa (la manilla) llama a `iniciar(e, i)` en `onTouchStart`. El asa —y no la fila entera— es lo
 * que arranca el gesto: si arrancara en cualquier parte de la fila, deslizar para leer la lista
 * movería paradas sin querer.
 */
export function useReordenarTactil(
  largo: number,
  onSoltar: (desde: number, hasta: number) => void,
) {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const [arrastrandoIdx, setArrastrandoIdx] = useState<number | null>(null);
  const [destinoIdx,     setDestinoIdx]     = useState<number | null>(null);

  // Los listeners se registran UNA vez (`touchmove` tiene que ser no-pasivo, y re-registrarlo en
  // cada render es tirar y poner el listener en medio del gesto). Por eso lo que cambia entre
  // renders —el largo de la lista y el callback— se lee desde refs y no desde el closure.
  const largoRef   = useRef(largo);
  const soltarRef  = useRef(onSoltar);
  largoRef.current  = largo;
  soltarRef.current = onSoltar;

  const gesto = useRef<{
    activo: boolean; desde: number | null; fantasma: HTMLElement | null;
    dx: number; dy: number; destino: number | null;
  }>({ activo: false, desde: null, fantasma: null, dx: 0, dy: 0, destino: null });

  const iniciar = useCallback((e: React.TouchEvent, idx: number) => {
    const fila = (e.currentTarget as HTMLElement).closest('[data-idx]') as HTMLElement | null;
    if (!fila) return;
    const touch = e.touches[0];
    const rect  = fila.getBoundingClientRect();

    const fantasma = fila.cloneNode(true) as HTMLElement;
    fantasma.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      'pointer-events:none',
      'opacity:0.9',
      'z-index:9999',
      'border-radius:8px',
      'background:#fff',
      'box-shadow:0 8px 28px rgba(0,0,0,0.22)',
      'transition:none',
    ].join(';');
    document.body.appendChild(fantasma);

    gesto.current = {
      activo: true, desde: idx, fantasma, destino: null,
      dx: touch.clientX - rect.left, dy: touch.clientY - rect.top,
    };
    setArrastrandoIdx(idx);
    setDestinoIdx(null);
  }, []);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    if (!contenedor) return;

    // El Planificador no scrollea la ventana: vive dentro de un panel con `overflow-y-auto`. Si el
    // auto-scroll empujara `window`, arrastrar hasta el borde no movería nada.
    function scroller(): HTMLElement | Window {
      let p = contenedor?.parentElement ?? null;
      while (p) {
        const ov = getComputedStyle(p).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return window;
    }

    /** Sobre qué fila DE ESTA lista está el dedo. Null si está fuera. */
    function filaBajoElDedo(x: number, y: number): number | null {
      const g = gesto.current.fantasma;
      if (g) g.style.pointerEvents = 'none'; // el fantasma tapa todo; hay que mirar debajo de él
      const el = document.elementFromPoint(x, y);
      const fila = (el as HTMLElement | null)?.closest('[data-idx]') as HTMLElement | null;
      // Hay dos PlanificadorTab montados a la vez (uno de escritorio y uno de móvil): una fila de
      // la otra copia no es destino válido.
      if (!fila || !contenedor?.contains(fila)) return null;
      return indiceDestino(fila.dataset.idx, largoRef.current);
    }

    function onTouchMove(e: TouchEvent) {
      if (!gesto.current.activo) return;
      e.preventDefault();
      const touch = e.touches[0];
      const { fantasma, dx, dy } = gesto.current;

      if (fantasma) {
        fantasma.style.left = `${touch.clientX - dx}px`;
        fantasma.style.top  = `${touch.clientY - dy}px`;
      }

      const destino = filaBajoElDedo(touch.clientX, touch.clientY);
      if (destino !== gesto.current.destino) {
        gesto.current.destino = destino;
        setDestinoIdx(destino);
      }

      const ZONE = 80, SPEED = 7;
      const s = scroller();
      if (touch.clientY < ZONE) s.scrollBy(0, -SPEED);
      else if (touch.clientY > window.innerHeight - ZONE) s.scrollBy(0, SPEED);
    }

    function terminar(e: TouchEvent) {
      if (!gesto.current.activo) return;
      const touch = e.changedTouches[0];
      const { fantasma, desde } = gesto.current;

      // `touchcancel` (una llamada entrante, el gesto que el sistema se lleva) NO suelta: cancela.
      const hasta = e.type === 'touchend' && touch
        ? filaBajoElDedo(touch.clientX, touch.clientY)
        : null;

      fantasma?.remove();
      gesto.current = { activo: false, desde: null, fantasma: null, dx: 0, dy: 0, destino: null };
      setArrastrandoIdx(null);
      setDestinoIdx(null);

      if (esMovimientoReal(desde, hasta)) soltarRef.current(desde as number, hasta as number);
    }

    contenedor.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', terminar);
    document.addEventListener('touchcancel', terminar);
    return () => {
      contenedor.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', terminar);
      document.removeEventListener('touchcancel', terminar);
      gesto.current.fantasma?.remove();
    };
  }, []);

  return { contenedorRef, arrastrandoIdx, destinoIdx, iniciar };
}
