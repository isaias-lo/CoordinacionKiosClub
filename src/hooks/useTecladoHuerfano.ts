'use client';

// Cierra el teclado en pantalla cuando el campo que lo abrió desaparece con el cursor adentro.
// Por qué y cuándo: `lib/tecladoHuerfano.ts`. Va montado una vez para toda la app (providers).
//
// Solo en pantallas táctiles: con mouse no hay teclado en pantalla que cerrar.

import { useEffect } from 'react';
import { abreTeclado, tecladoHuerfano, type EstadoCampo, type FocoActual } from '@/lib/tecladoHuerfano';

type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** Marca del campo auxiliar del truco: el hook no lo vigila a él. */
const AUXILIAR = 'data-cierra-teclado';

function estadoDe(el: Campo): EstadoCampo {
  return {
    conectado: el.isConnected,
    // `:disabled` cubre el `<fieldset disabled>` de la tienda terminada, que no toca el input.
    deshabilitado: el.matches(':disabled'),
    visible: el.isConnected && el.getClientRects().length > 0,
  };
}

function focoActual(campo: Campo): FocoActual {
  const a = document.activeElement as HTMLElement | null;
  if (a === campo) return 'mismo';
  if (a && !a.hasAttribute(AUXILIAR) && abreTeclado(a as HTMLInputElement)) return 'otro-campo';
  return 'ninguno';
}

/**
 * El truco para bajar el teclado sin campo: un input de solo lectura (no abre teclado) recibe el
 * cursor y lo suelta de inmediato. El blur es lo que Android escucha para esconderlo.
 */
function cerrarTeclado(campo: Campo): void {
  if (document.activeElement === campo) campo.blur();
  const aux = document.createElement('input');
  aux.setAttribute(AUXILIAR, '');
  aux.setAttribute('aria-hidden', 'true');
  aux.readOnly = true;
  aux.tabIndex = -1;
  // 16 px para que iOS no haga zoom al enfocarlo.
  aux.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px;border:0;padding:0';
  document.body.appendChild(aux);
  aux.focus({ preventScroll: true });
  aux.blur();
  aux.remove();
}

export function useTecladoHuerfano(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (!window.matchMedia?.('(pointer: coarse)').matches) return;

    let campo: Campo | null = null;
    let pendiente: ReturnType<typeof setTimeout> | null = null;

    const revisar = () => {
      pendiente = null;
      if (!campo) return;
      const foco = focoActual(campo);
      if (foco === 'otro-campo') { campo = null; return; }
      if (tecladoHuerfano(estadoDe(campo), foco)) {
        const el = campo;
        campo = null;
        cerrarTeclado(el);
      } else if (foco === 'ninguno') {
        // Se soltó a propósito y el campo sigue ahí: el teclado se cerró solo. Nada que vigilar.
        campo = null;
      }
    };
    // Una revisión por tanda de cambios: React cambia muchos nodos de una vez.
    const programar = () => { if (campo && !pendiente) pendiente = setTimeout(revisar, 50); };

    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el.hasAttribute?.(AUXILIAR)) return;
      campo = abreTeclado(el as HTMLInputElement) ? el : null;
    };
    // Soltar el cursor a propósito (tocar fuera, el `blur()` del lector) cierra el teclado solo.
    // Igual se revisa: hay equipos que mandan el blur del campo que se borra y no bajan el teclado.
    const onFocusOut = (e: FocusEvent) => {
      if (e.target !== campo) return;
      if (e.relatedTarget && abreTeclado(e.relatedTarget as HTMLInputElement)) return;
      programar();
    };

    const obs = new MutationObserver(programar);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'class', 'style'] });
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      obs.disconnect();
      if (pendiente) clearTimeout(pendiente);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
    };
  }, []);
}
