/**
 * Formatea un RUT chileno mientras se escribe: puntos de millar + guión antes del dígito
 * verificador. Puro, sin validar el dígito verificador (solo formato) — el mismo criterio que
 * ya usaban por separado `RecepcionForm.tsx` y `RecepcionClient.tsx` antes de esta extracción
 * (dos copias idénticas que habrían empezado a divergir con el próximo cambio, como ya pasó
 * antes en este proyecto con otras constantes duplicadas).
 */
export function formatRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase().slice(0, 9);
  if (clean.length < 2) return clean;
  const dv     = clean.slice(-1);
  const num    = clean.slice(0, -1);
  const dotted = num.length > 3 ? num.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : num;
  return `${dotted}-${dv}`;
}
