import { useEffect, useRef } from 'react';

/**
 * Ejecuta `onVisible` cuando la pestaña/app vuelve a estar visible o gana foco (catch-up de
 * sincronización), y `onHide` cuando se oculta (para hacer flush de cambios pendientes).
 *
 * Usa refs internos para que el llamador pueda pasar funciones inline sin re-suscribir los
 * listeners en cada render. Ataca el caso móvil↔desktop: al volver al dispositivo, se pone al día
 * con `shared_session_state` sin depender solo de Realtime (P9).
 */
export function useVisibilityRefetch(onVisible: () => void, onHide?: () => void): void {
  const visRef  = useRef(onVisible);
  const hideRef = useRef(onHide);
  visRef.current  = onVisible;
  hideRef.current = onHide;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState === 'visible') visRef.current();
      else hideRef.current?.();
    };
    const onFocus    = () => visRef.current();
    const onPageHide = () => hideRef.current?.();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);
}
