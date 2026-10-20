// El teclado en pantalla que queda abierto sin ningún campo. Puro: sin DOM ni React.
//
// ── QUÉ PASA ───────────────────────────────────────────────────────────────────────────────────
//
// Isaias, 20/10/2026: «algo que se ha repetido en ocasiones y solo en algunos dispositivos, que a
// veces se queda abierto el teclado del móvil o handheld».
//
// El teclado de Android se cierra cuando el campo que tiene el cursor lo SUELTA (blur). Pero en
// Bodega el campo muchas veces no se suelta: DESAPARECE con el cursor adentro. Se guarda la
// tarjeta y sus campos se van; la pistola salta a otra unidad y la tarjeta «Ahora» cambia; otro
// equipo marca la tienda terminada y el `<fieldset disabled>` apaga los campos. Chrome deja el
// foco en `<body>` sin avisar, y algunas versiones de Android (y algunos WebView de handheld) no
// se enteran de que ya no hay dónde escribir: el teclado queda arriba, tapando media pantalla, y
// lo que se teclea no va a ninguna parte. Por eso «solo en algunos»: en los demás el sistema lo
// cierra solo.
//
// ── EL ARREGLO ─────────────────────────────────────────────────────────────────────────────────
//
// `useTecladoHuerfano` recuerda el último campo con cursor. Si ese campo ya no está (se fue del
// DOM, quedó deshabilitado u oculto) y el foco no pasó a otro campo, el teclado está huérfano y se
// cierra con el truco de siempre: enfocar un campo de solo lectura —que no abre teclado— y
// soltarlo. Esto decide cuándo; el hook solo mira el DOM.

export interface EstadoCampo {
  /** Sigue en el documento. */
  conectado: boolean;
  /** `disabled` propio o heredado de un `<fieldset disabled>`. */
  deshabilitado: boolean;
  /** Ocupa lugar en pantalla (`getClientRects().length > 0`). */
  visible: boolean;
}

/**
 * Dónde quedó el foco ahora: en el mismo campo, en otro campo que escribe (el teclado sigue siendo
 * útil), o en ningún lado (`body`, un botón, `null`).
 */
export type FocoActual = 'mismo' | 'otro-campo' | 'ninguno';

/** ¿El teclado quedó abierto para un campo que ya no se puede usar? */
export function tecladoHuerfano(campo: EstadoCampo | null, foco: FocoActual): boolean {
  if (!campo) return false;
  // El cursor siguió a otro campo: el teclado tiene a quién escribirle.
  if (foco === 'otro-campo') return false;
  // En el mismo campo o en ninguno: huérfano si el campo ya no se puede usar.
  return !campo.conectado || campo.deshabilitado || !campo.visible;
}

/** Tipos de `<input>` que abren el teclado. Una casilla o un botón no. */
const SIN_TECLADO = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden']);

/** ¿Este elemento abre el teclado en pantalla al recibir el cursor? */
export function abreTeclado(el: { tagName: string; type?: string; readOnly?: boolean; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === 'TEXTAREA') return !el.readOnly;
  if (tag !== 'INPUT') return false;
  return !el.readOnly && !SIN_TECLADO.has(String(el.type ?? 'text').toLowerCase());
}
