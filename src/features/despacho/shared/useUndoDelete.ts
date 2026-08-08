'use client';
import { useCallback, useRef, useState } from 'react';

export interface UndoPending { label: string }

/**
 * Estado de "deshacer último borrado" para Bodega. `armar(label, onRevert)` muestra el snackbar
 * y arma un auto-descartar; `revertir()` ejecuta el `onRevert` guardado; `descartar()` lo oculta.
 * Un solo undo pendiente a la vez (el último gana). Ver [[bodega-borrar-slot-picking]].
 */
export function useUndoDelete(defaultMs = 7000) {
  const [pending, setPending] = useState<UndoPending | null>(null);
  const revertRef = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const descartar = useCallback(() => { clearTimer(); revertRef.current = null; setPending(null); }, []);

  const armar = useCallback((label: string, onRevert: () => void, ms = defaultMs) => {
    clearTimer();
    revertRef.current = onRevert;
    setPending({ label });
    timer.current = setTimeout(() => { revertRef.current = null; setPending(null); }, ms);
  }, [defaultMs]);

  const revertir = useCallback(() => {
    const fn = revertRef.current;
    clearTimer();
    revertRef.current = null;
    setPending(null);
    fn?.();
  }, []);

  return { pending, armar, revertir, descartar };
}
