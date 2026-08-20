// "Agregar sin pesar" — permite guardar un pallet/bulto en Bodega sin ingresar
// dimensiones. Un item pesado de verdad siempre tiene peso > 0 (lo garantiza
// saveRow al validar), así que peso 0/ausente ⟺ sin pesar.
export function esSinPesar(item: { peso?: number | null }): boolean {
  return !item.peso || item.peso <= 0;
}

export const DIMS_SIN_PESAR = { peso: 0, alto: 0, largo: 0, ancho: 0, pesoVolumetrico: 0 } as const;
