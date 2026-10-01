'use client';

// El lector de la handheld en Bodega (Nacional y RM/Costa), esté donde esté el cursor.
//
// Tres cosas, todas escuchando el teclado de la ventana entera:
//
//   1. Reconoce una lectura del lector (ver `lectorBodega.ts`) aunque el cursor esté en el buscador,
//      en Peso o en ningún lado, y se la entrega a la pantalla con `alEscanear`.
//   2. Si el lector escribió dentro de un campo, deja ese campo como estaba antes del primer
//      carácter. Sin esto, escanear con el cursor en Peso dejaba el código como peso.
//      Solo en los campos de la tarjeta (`data-campo`) y el buscador (`data-buscador-bodega`): en
//      cualquier otro campo (Guía, por ejemplo) una lectura puede ser justo lo que se quiere
//      escribir, y se deja pasar como siempre.
//   3. Enter en un campo de la tarjeta (`data-campo`) pasa al siguiente, y en el último toca el
//      botón de guardar (`data-accion="guardar"`) — el mismo botón, con las mismas validaciones.
//
// Escucha en fase de captura sobre `window` para ver el Enter del lector ANTES que los `onKeyDown`
// de React (el del buscador saltaba por su cuenta) y poder quedárselo.
//
// ── Android ────────────────────────────────────────────────────────────────────────────────────
//
// Con el teclado de Android (IME) activo, `keydown` llega como "Unidentified" y el carácter solo
// aparece en `beforeinput`. Auditoría ya lo resolvió así (`BarcodeInputScanner.tsx`); acá se usa
// `beforeinput` cuando la tecla no traía el carácter, y `keyup` como respaldo del Enter.

import { useEffect, useRef } from 'react';
import { Rafaga, LECTOR, siguienteCampo } from './lectorBodega';

interface Marca {
  el: HTMLInputElement | HTMLTextAreaElement | null;
  valor: string;
}

export interface OpcionesLector {
  /** Apagado mientras hay un diálogo abierto que recibe la lectura por su cuenta. */
  activo: boolean;
  /** ¿Calza con una etiqueta? Solo se consulta cuando la lectura llega sin Enter. */
  reconoce: (codigo: string) => boolean;
  alEscanear: (codigo: string) => void;
}

/** ¿Una lectura que empezó con el foco acá es de Bodega? Sin foco en un campo, siempre. */
function campoDeEscaneo(el: Marca['el']): boolean {
  return !el || el.hasAttribute('data-campo') || el.hasAttribute('data-buscador-bodega');
}

/** Escribe `valor` en un input controlado por React y le avisa, como si lo hubiera tecleado. */
function escribirEnCampo(el: HTMLInputElement | HTMLTextAreaElement, valor: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Enter en un campo de la tarjeta. `true` si lo manejó. */
function avanzarCampo(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLInputElement)) return false;
  const campo = el.dataset.campo;
  const tarjeta = el.closest('[data-tarjeta-bodega]');
  if (!campo || !tarjeta) return false;
  const campos = [...tarjeta.querySelectorAll<HTMLInputElement>('input[data-campo]')];
  const sig = siguienteCampo(campos.map(c => c.dataset.campo ?? ''), campo);
  if (sig === null) return false;
  if (sig === 'guardar') {
    // Soltar el foco primero: la tarjeta se vuelve "guardada" y el campo desaparece, y así el
    // teclado en pantalla se cierra y el próximo escaneo no cae en ningún campo.
    el.blur();
    tarjeta.querySelector<HTMLButtonElement>('[data-accion="guardar"]')?.click();
    return true;
  }
  const siguiente = campos.find(c => c.dataset.campo === sig);
  siguiente?.focus();
  siguiente?.select();
  return true;
}

/**
 * La tarjeta de un slot que se ve en pantalla.
 *
 * El formulario se dibuja dos veces —el panel de escritorio (oculto en el teléfono) y la hoja del
 * teléfono (oculta en escritorio)—, así que hay dos elementos con el mismo id y `getElementById`
 * devuelve siempre el del panel de escritorio. En la handheld ese está oculto: el salto no hacía
 * scroll ni podía poner el cursor en él.
 */
export function tarjetaVisible(slotId: number): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const todas = document.querySelectorAll<HTMLElement>(`[id="pallet-card-${slotId}"]`);
  for (const el of todas) if (el.getClientRects().length > 0) return el;
  return null;
}

/**
 * Tras saltar a una tarjeta: el cursor en Peso, listo para teclear. En una tarjeta ya guardada no
 * hay campos y no hace nada.
 */
export function enfocarPeso(tarjeta: Element): void {
  const peso = tarjeta.querySelector<HTMLInputElement>('input[data-campo="peso"]');
  if (!peso) return;
  peso.focus({ preventScroll: true });
  peso.select();
}

/** Cuándo fue el último salto a una tarjeta. Ver `huboSaltoReciente`. */
let ultimoSalto = 0;

/**
 * ¿Hubo un salto a una tarjeta en el último segundo?
 *
 * Al abrir una tienda, el formulario vuelve arriba con un `scrollTo({ top: 0 })` diferido. Si el
 * salto ya había bajado hasta la tarjeta, ese scroll lo deshacía: en una tienda con muchos pallets
 * se llegaba a la tienda pero había que bajar a buscar el escaneado. Quien vuelve arriba pregunta
 * esto antes.
 */
export function huboSaltoReciente(): boolean {
  return performance.now() - ultimoSalto < 1000;
}

/**
 * Lleva la tarjeta del slot arriba de la lista, deja el cursor en Peso, y la mantiene ahí un momento.
 *
 * "Un momento" porque justo después de un salto la pantalla se mueve sola: el formulario de la
 * tienda recién abierta se reconstruye (y puede volver a dibujar las tarjetas), y al poner el
 * cursor en Peso el teclado del teléfono se abre y achica la pantalla. Cualquiera de las dos cosas
 * puede dejar la tarjeta fuera de la vista o sin cursor. Durante `ms` se revisa y se corrige; si la
 * persona toca o desplaza la pantalla, se deja de corregir para no pelearle.
 *
 * Devuelve `false` si la tarjeta todavía no está en pantalla (el llamador reintenta).
 */
export function llevarATarjeta(slotId: number, ms = 1500): boolean {
  if (typeof window === 'undefined' || !tarjetaVisible(slotId)) return false;
  ultimoSalto = performance.now();
  const fin = ultimoSalto + ms;
  let vivo = true;
  const soltar = () => { vivo = false; };
  const eventos = ['touchstart', 'pointerdown', 'wheel'] as const;
  for (const ev of eventos) window.addEventListener(ev, soltar, { once: true, passive: true });

  const paso = () => {
    if (!vivo || performance.now() > fin) {
      for (const ev of eventos) window.removeEventListener(ev, soltar);
      return;
    }
    ultimoSalto = performance.now();
    const el = tarjetaVisible(slotId);
    if (el) {
      const alto = window.visualViewport?.height ?? window.innerHeight;
      const { top } = el.getBoundingClientRect();
      // Arriba y no al centro: con el teclado abierto, el centro queda tapado.
      if (top < 0 || top > alto * 0.45) el.scrollIntoView({ block: 'start', behavior: 'auto' });
      if (!el.contains(document.activeElement)) enfocarPeso(el);
    }
    setTimeout(paso, 120);
  };
  paso();
  return true;
}

/**
 * ¿Hay una tarjeta a medio llenar que un salto a otra unidad dejaría atrás?
 *
 * Mira solo la tarjeta que tiene el foco: es la que se está escribiendo. Sin guardar = todavía
 * tiene su botón de guardar; a medio llenar = algún campo con algo escrito.
 */
export function tarjetaAMedias(slotDestino: number): boolean {
  if (typeof document === 'undefined') return false;
  const tarjeta = document.activeElement?.closest?.('[data-tarjeta-bodega]');
  if (!tarjeta) return false;
  if (tarjeta.getAttribute('data-slot') === String(slotDestino)) return false;
  if (!tarjeta.querySelector('[data-accion="guardar"]')) return false;
  return [...tarjeta.querySelectorAll<HTMLInputElement>('input[data-campo]')].some(c => c.value.trim() !== '');
}

export function useLectorBodega({ activo, reconoce, alEscanear }: OpcionesLector): void {
  // Las funciones cambian en cada render de la pantalla; los listeners se registran una vez.
  const cb = useRef({ reconoce, alEscanear });
  useEffect(() => { cb.current = { reconoce, alEscanear }; });

  useEffect(() => {
    if (!activo || typeof window === 'undefined') return;
    const rafaga = new Rafaga<Marca>();
    let silencio: ReturnType<typeof setTimeout> | null = null;
    // La última keydown ya sumó su carácter: el beforeinput que la sigue no lo suma otra vez.
    let teclaSumada = false;
    // El Enter ya se atendió en keydown: el keyup no lo repite.
    let enterAtendido = false;

    const marcar = (): Marca => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
        ? { el, valor: el.value }
        : { el: null, valor: '' };
    };

    const entregar = ({ codigo, marca }: { codigo: string; marca: Marca }) => {
      if (marca.el?.isConnected && marca.el.value !== marca.valor) escribirEnCampo(marca.el, marca.valor);
      cb.current.alEscanear(codigo);
    };

    const cancelarSilencio = () => {
      if (silencio) { clearTimeout(silencio); silencio = null; }
    };

    // Equipos configurados sin Enter al final: tras un silencio, se evalúa lo leído. Sin Enter no
    // hay una señal de fin, así que además tiene que calzar con una etiqueta real.
    const esperarSilencio = () => {
      cancelarSilencio();
      silencio = setTimeout(() => {
        silencio = null;
        const r = rafaga.cerrar();
        if (r && campoDeEscaneo(r.marca.el) && cb.current.reconoce(r.codigo)) entregar(r);
      }, LECTOR.silencioMs);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter' || e.key === 'Tab') {
        cancelarSilencio();
        enterAtendido = e.key === 'Enter';
        const r = rafaga.cerrar();
        if (r && campoDeEscaneo(r.marca.el)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          entregar(r);
          return;
        }
        if (r) return; // lectura en otro campo: sigue su camino normal
        if (e.key === 'Enter' && avanzarCampo(e.target)) e.preventDefault();
        return;
      }
      if (e.key.length === 1) {
        rafaga.agregar(e.key, performance.now(), marcar);
        teclaSumada = true;
        esperarSilencio();
        return;
      }
      // "Unidentified" / "Process": el carácter llega en beforeinput.
      teclaSumada = false;
    };

    const onBeforeInput = (e: Event) => {
      const ie = e as InputEvent;
      if (teclaSumada) { teclaSumada = false; return; }
      if (!ie.data) return;
      rafaga.agregar(ie.data, performance.now(), marcar);
      if (/[\r\n]/.test(ie.data)) {
        cancelarSilencio();
        const r = rafaga.cerrar();
        if (r && campoDeEscaneo(r.marca.el)) { ie.preventDefault(); entregar(r); }
        return;
      }
      esperarSilencio();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      teclaSumada = false;
      if (e.key !== 'Enter' && e.keyCode !== 13) return;
      if (enterAtendido) { enterAtendido = false; return; }
      // El keydown del Enter llegó sin identificar (IME): se atiende acá.
      cancelarSilencio();
      const r = rafaga.cerrar();
      if (r && campoDeEscaneo(r.marca.el)) entregar(r);
      else if (!r) avanzarCampo(e.target);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('beforeinput', onBeforeInput, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      cancelarSilencio();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('beforeinput', onBeforeInput, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [activo]);
}
