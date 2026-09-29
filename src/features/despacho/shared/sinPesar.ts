// "Agregar sin pesar" — permite guardar un pallet/bulto en Bodega sin ingresar
// dimensiones. Un item pesado de verdad siempre tiene peso > 0 (lo garantiza
// saveRow al validar), así que peso 0/ausente ⟺ sin pesar.
//
// ── SALVO LOS AGREGADOS ────────────────────────────────────────────────────────────────────────
//
// Una adquisición y un web/retiro NO se pesan: nacen completos, y apretar el botón es todo lo que
// hay que hacer (ver `adquisicion.ts` → `naceCompleta`). Contarlos como "sin pesar" pedía un peso
// que no iba a llegar nunca: la tarjeta de la tienda quedaba con la alerta puesta para siempre y
// el aviso dejaba de significar algo, porque ya no distinguía "falta pesar esto" de "esto no se
// pesa".
//
// El módulo de agregados ya anticipaba esto —`naceCompleta` existe justamente para eso— pero
// quien mira el peso es esta función, y no lo sabía.

import { esAgregado } from './adquisicion';

/**
 * ¿Esta unidad está esperando que alguien la pese?
 *
 * Se miran los DOS campos porque cada espejo de Bodega llama distinto a la misma cosa: en RM/Costa
 * `tipo` es el envase ('Pallet', 'Adquisicion'), y en Nacional `tipo` es el CONTENIDO ('comida',
 * 'hogar') y el envase vive en `pkg` ('pallet', 'adquisicion'). Mirar uno solo dejaría el arreglo
 * puesto en un espejo y roto en el otro.
 */
export function esSinPesar(item: {
  peso?: number | null;
  tipo?: string | null;
  pkg?: string | null;
}): boolean {
  if (esAgregado(item.tipo) || esAgregado(item.pkg)) return false;
  return !item.peso || item.peso <= 0;
}

export const DIMS_SIN_PESAR = { peso: 0, alto: 0, largo: 0, ancho: 0, pesoVolumetrico: 0 } as const;
