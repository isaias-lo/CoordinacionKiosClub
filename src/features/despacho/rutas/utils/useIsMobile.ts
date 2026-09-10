'use client';
import { useEffect, useState } from 'react';

/** Breakpoint único para el layout mobile del Enrutador — antes duplicado inline en
 *  InputSection.tsx y desalineado con el corte del hamburguesa global (lg:hidden, 1024px). */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isMobile;
}

/**
 * El ancho de la ventana, para layouts con más de dos estados.
 *
 * `useIsMobile` alcanza cuando la decisión es sí/no, pero el catálogo de Personal tiene tres
 * tramos (dos catálogos lado a lado / apilados / campos apilados) y necesita el número para
 * decidirlos con una función pura testeable — ver `gridPersonal.ts`.
 *
 * Arranca en 1440 (escritorio) por la misma razón que `useIsMobile` arranca en `false`: en el
 * servidor no hay ventana, y así el primer render es el de escritorio, que es el caso mayoritario
 * y el que ya se veía bien. El efecto corrige en el primer paint del cliente.
 */
export function useAnchoVentana(): number {
  const [ancho, setAncho] = useState(1440);
  useEffect(() => {
    const medir = () => setAncho(window.innerWidth);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  return ancho;
}
