/**
 * De los records a escribir (DESPACHO RM/REGIONES), devuelve las claves (fecha, cod) DISTINTAS
 * que traen una patente asignada. Se usa para avanzar el seguimiento a 'Pendiente' solo en las
 * tiendas efectivamente asignadas a un vehículo. Puro y testeable.
 */
export function clavesConPatente(
  records: { fecha?: unknown; cod?: unknown; patente?: unknown }[],
): { fecha: string; cod: string }[] {
  const seen = new Set<string>();
  const out: { fecha: string; cod: string }[] = [];
  for (const r of records) {
    const patente = String(r.patente ?? '').trim();
    const fecha   = String(r.fecha ?? '');
    const cod     = String(r.cod ?? '');
    if (!patente || !fecha || !cod) continue;
    const key = `${fecha}::${cod}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fecha, cod });
  }
  return out;
}
