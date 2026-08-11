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
