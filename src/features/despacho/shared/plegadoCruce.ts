// Si el bloque CRUCE DE PESOS se ve abierto o plegado. Puro.
//
// ── POR QUÉ SE PLIEGA ──────────────────────────────────────────────────────────────────────────
//
// En el teléfono el bloque ocupa media pantalla justo encima de los pallets, que es donde se
// trabaja. En el escritorio sobra espacio y se queda abierto como siempre.
//
// ── TRES ESTADOS, NO DOS ───────────────────────────────────────────────────────────────────────
//
// Mientras la persona no lo toque, la preferencia es `null` y manda el ANCHO de la pantalla, por
// CSS (`md:`): plegado en el teléfono, abierto en el escritorio. Resolverlo por CSS y no leyendo
// `window` en el render evita el parpadeo y el desajuste entre el HTML del servidor y el cliente.
// Apenas la persona lo abre o lo cierra, esa elección queda guardada en el equipo y gana.

export type PreferenciaPlegado = 'abierto' | 'plegado' | null;

export const CLAVE_PLEGADO_CRUCE = 'bodegaCrucePlegado';

/** El ancho desde el cual el bloque arranca abierto. Es el `md` de Tailwind y el de `useIsMobile`. */
export const ANCHO_ESCRITORIO = 768;

/** Lo guardado en el equipo. Cualquier otra cosa —nada, basura, storage bloqueado— es «sin elegir». */
export function leerPreferencia(crudo: string | null | undefined): PreferenciaPlegado {
  return crudo === 'abierto' || crudo === 'plegado' ? crudo : null;
}

/** Si el bloque se ve plegado AHORA, dado lo elegido y el ancho de la pantalla. */
export function estaPlegado(pref: PreferenciaPlegado, anchoPantalla: number): boolean {
  if (pref) return pref === 'plegado';
  return anchoPantalla < ANCHO_ESCRITORIO;
}

/** Lo que queda elegido al tocar la cabecera: lo contrario de lo que se ve. */
export function alternar(pref: PreferenciaPlegado, anchoPantalla: number): Exclude<PreferenciaPlegado, null> {
  return estaPlegado(pref, anchoPantalla) ? 'abierto' : 'plegado';
}
