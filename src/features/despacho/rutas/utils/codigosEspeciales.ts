/**
 * Códigos que fluyen al Enrutador SIN estar en el calendario del día.
 *
 * Regla del sistema: "el calendario manda" — una tienda normal solo aparece si está en el
 * calendario. La EXCEPCIÓN es la Oficina Kios Club (OFIKC): no es una tienda de despacho sino
 * la oficina central (recados internos), así que nunca está en el calendario, pero SÍ debe
 * fluir cuando se arma en Bodega. Solo estos códigos hacen la excepción.
 */
export const CODIGOS_SIN_CALENDARIO = new Set<string>(['OFIKC']);

/** ¿Este código puede fluir sin estar en el calendario? (hoy: solo la Oficina Kios Club) */
export function fluyeSinCalendario(cod: string): boolean {
  return CODIGOS_SIN_CALENDARIO.has(cod);
}
