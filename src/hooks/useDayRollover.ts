'use client';

import { useEffect, useRef } from 'react';

function localDayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Recarga la página cuando cambia el día calendario local.
 *
 * Las pantallas de despacho calculan su "fecha de hoy" UNA vez al cargar el módulo
 * (constantes `todayKey`/`TODAY_KEY`/`SESSION_DATE`). En una pestaña/PWA que el equipo
 * de bodega deja abierta toda la jornada, esas constantes NO avanzan al cruzar medianoche,
 * así que al día siguiente la UI sigue leyendo claves (guías, estado, semáforo) del día
 * anterior y muestra verdes/naranjas fantasma. Un reload re-evalúa los módulos con la
 * fecha correcta y limpia ese estado viejo.
 *
 * Solo recarga cuando la pestaña vuelve a estar visible (no interrumpe a alguien que está
 * trabajando activamente) o en un chequeo periódico de baja frecuencia.
 */
export function useDayRollover(): void {
  const dayRef = useRef<string>(localDayKey());

  useEffect(() => {
    const check = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (localDayKey() !== dayRef.current) {
        window.location.reload();
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    // Respaldo: chequeo cada 5 min por si la pestaña queda visible cruzando medianoche.
    const id = setInterval(check, 300_000);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
      clearInterval(id);
    };
  }, []);
}
