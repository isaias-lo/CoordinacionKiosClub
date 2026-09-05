// ¿Le faltan datos de envío a esta tienda?
//
// El aviso amarillo de Bodega ("viene de Config. Tiendas sin datos completos de envío") no miraba
// ningún campo: la lista de "sin datos" se llenaba con TODAS las tiendas que venían de la BD,
// sin condición. Era un marcador de PROCEDENCIA disfrazado de validación — marcaba igual a una
// tienda con todo lleno, y no se apagaba nunca por más que se completaran los datos.
//
// Acá se evalúa lo que el export de Sendu realmente necesita. Si falta algo, se dice QUÉ falta;
// si no falta nada, no hay aviso.

export interface DatosSendu {
  region_sendu?: string | null;
  comuna?: string | null;
  calle?: string | null;
  numero?: string | null;
  email?: string | null;
  celular?: string | null;
}

/** Los campos que el Excel de Sendu necesita sí o sí, con el nombre que ve el usuario. */
const REQUERIDOS: [keyof DatosSendu, string][] = [
  ['region_sendu', 'región Sendu'],
  ['comuna',       'comuna'],
  ['calle',        'calle'],
  ['numero',       'número'],
  ['email',        'correo'],
  ['celular',      'teléfono'],
];

const vacio = (v: unknown): boolean => String(v ?? '').trim() === '';

/**
 * Qué campos de envío le faltan, en el orden en que aparecen en el formulario.
 *
 * `complemento` NO es obligatorio: hay tiendas reales sin número de local (Pucón, Machalí, Castro)
 * y exigirlo las marcaría para siempre.
 */
export function camposSenduFaltantes(t: DatosSendu | undefined | null): string[] {
  if (!t) return REQUERIDOS.map(([, label]) => label);
  return REQUERIDOS.filter(([k]) => vacio(t[k])).map(([, label]) => label);
}

/** ¿Se puede exportar a Sendu sin que salgan celdas en blanco? */
export function senduCompleta(t: DatosSendu | undefined | null): boolean {
  return camposSenduFaltantes(t).length === 0;
}

/** El aviso, ya redactado. `null` si no hay nada que avisar. */
export function avisoSendu(faltantes: { cod: string; falta: string[] }[]): string | null {
  if (!faltantes.length) return null;
  const detalle = faltantes
    .map(f => `${f.cod} (falta ${f.falta.join(', ')})`)
    .join(' · ');
  return `${faltantes.length === 1 ? 'Una tienda' : `${faltantes.length} tiendas`} sin datos completos de envío: ${detalle}. Se puede cargar normalmente; complétalos en Config → Tiendas antes de exportar a Sendu.`;
}
