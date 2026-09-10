// Peso y medidas de un pallet: normalización y peso volumétrico.
//
// `picking_pallets` ya tiene `peso_kg, alto, largo, ancho, peso_v` desde hace meses, pero SOLO las
// escribe Bodega. Picking —que es quien tiene la balanza y la huincha delante— no las manda nunca,
// así que el chocolate llega a Bodega con los 20 kg de la constante por defecto en vez del peso
// que alguien pesó de verdad.
//
// Este módulo es la capa de datos de ese arreglo: normaliza lo que viene del formulario y deriva
// el peso volumétrico. Sin UI todavía — el campo para escribirlo va en el PR siguiente, para que
// cada PR sea chico y este no cambie nada visible.
//
// Puro y testeable: no toca red ni base.

/**
 * Divisor del peso volumétrico (cm³ → kg). 6000 es la convención de transporte terrestre que ya
 * usaba `PickingSlotCards`; se centraliza acá para que no vuelva a quedar suelto en un componente.
 */
export const DIVISOR_VOLUMETRICO = 6000;

export interface MedidasPallet {
  peso_kg: number | null;
  alto: number | null;
  largo: number | null;
  ancho: number | null;
  peso_v: number | null;
}

/** Un número positivo, o null. Cubre `''`, `'abc'`, `null`, `0` y los negativos. */
function positivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Igual pero entero, para las medidas — las columnas de la base son `integer`. */
function entero(v: unknown): number | null {
  const n = positivo(v);
  return n == null ? null : Math.round(n);
}

/**
 * Peso volumétrico en kg, redondeado a un decimal. `null` si falta cualquiera de las tres medidas
 * — con una sola ausente el volumen no existe, y devolver 0 haría creer que el bulto no ocupa nada.
 */
export function pesoVolumetrico(
  alto?: unknown, largo?: unknown, ancho?: unknown,
): number | null {
  const a = positivo(alto), l = positivo(largo), an = positivo(ancho);
  if (a == null || l == null || an == null) return null;
  const v = Math.round(((a * l * an) / DIVISOR_VOLUMETRICO) * 10) / 10;
  return v > 0 ? v : null;
}

/**
 * Lo que viene del formulario (strings, vacíos, comas decimales) convertido a lo que acepta la
 * base. `peso_v` se deriva siempre que estén las tres medidas: es geometría, no depende de que
 * alguien haya pesado el bulto.
 */
export function normalizarMedidas(input: {
  peso_kg?: unknown; alto?: unknown; largo?: unknown; ancho?: unknown;
}): MedidasPallet {
  const alto = entero(input.alto);
  const largo = entero(input.largo);
  const ancho = entero(input.ancho);
  return {
    peso_kg: positivo(input.peso_kg),
    alto, largo, ancho,
    peso_v: pesoVolumetrico(alto, largo, ancho),
  };
}

/** ¿Vale la pena mandar estas medidas, o son todas vacías? Evita PATCHs sin nada que cambiar. */
export function hayMedidas(m: MedidasPallet): boolean {
  return m.peso_kg != null || m.alto != null || m.largo != null || m.ancho != null;
}
