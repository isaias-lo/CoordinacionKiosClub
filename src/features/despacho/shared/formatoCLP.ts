// Plata en pesos chilenos, escrita como se escribe en Chile. Puro y testeable.
//
// Existe por M-01: el resumen de Bodega Nacional mostraba `$25259K`, que no es ningún formato —
// son $25.259.000. "K" además engaña: sugiere miles, y ahí ya se habían dividido por mil.

const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

/** `$25.259.000`. El monto completo, para cuando hay lugar (y para el `title` cuando no lo hay). */
export function formatCLP(monto: number): string {
  if (!Number.isFinite(monto)) return '$0';
  return CLP.format(Math.round(monto));
}

/**
 * `$25,3 M` — para celdas angostas, como la franja de totales del día.
 *
 * Bajo un millón se escribe completo: `$840.000` entra igual de bien y no obliga a nadie a
 * multiplicar mentalmente. Siempre acompañar del monto exacto en el `title`.
 */
export function formatCLPCorto(monto: number): string {
  if (!Number.isFinite(monto)) return '$0';
  const n = Math.round(monto);
  if (Math.abs(n) < 1_000_000) return formatCLP(n);
  const millones = n / 1_000_000;
  // Un decimal hasta 100 millones; de ahí en adelante el decimal ya no aporta.
  const texto = Math.abs(millones) < 100
    ? millones.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : millones.toLocaleString('es-CL', { maximumFractionDigits: 0 });
  return `$${texto} M`;
}
