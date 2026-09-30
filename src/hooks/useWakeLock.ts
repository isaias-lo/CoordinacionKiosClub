'use client';

import { useEffect } from 'react';

/**
 * Pantalla encendida mientras `activo`. En la handheld de Bodega la pantalla se apagaba entre un
 * pallet y otro (subirlo a la balanza toma su rato) y había que desbloquear el equipo para escanear
 * el siguiente.
 *
 * El sistema suelta el bloqueo cuando la app pasa a segundo plano; se vuelve a pedir al volver.
 * Si el navegador no lo soporta, no hace nada.
 */
export function useWakeLock(activo: boolean): void {
  useEffect(() => {
    if (!activo || typeof navigator === 'undefined' || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | null = null;
    let vigente = true;
    const pedir = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen')
        .then(l => { if (vigente) lock = l; else void l.release().catch(() => {}); })
        .catch(() => { /* opcional: batería baja o permiso negado */ });
    };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => {
      vigente = false;
      document.removeEventListener('visibilitychange', pedir);
      void lock?.release().catch(() => {});
    };
  }, [activo]);
}
