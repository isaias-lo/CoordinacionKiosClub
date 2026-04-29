import { TIENDAS } from '../data/tiendas';
import type { DispatchItem } from '../../../types';

export const SANTIAGO_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbzrBdzGrmT_0uBwzVxoPi3nubtsIVSYBrnNgdaAr43f2rjS2PQr_XZ-NGw--CTH4DMFOQ/exec';

function buildRegionesSheetsRows(
  dispatchData: Record<string, DispatchItem[]>,
): Record<string, unknown>[] {
  const fecha = new Date().toISOString().split('T')[0];
  const rows: Record<string, unknown>[] = [];
  let counter = 1;

  for (const [storeName, items] of Object.entries(dispatchData)) {
    if (!items.length) continue;
    const tienda = TIENDAS[storeName];
    if (!tienda) continue;

    for (const item of items) {
      rows.push({
        ID:        `${counter}-${tienda.cod}-${fecha}`,
        FECHA:     fecha,
        COD:       tienda.cod,
        TIENDA:    tienda.name,
        REGION:    tienda.region,
        COMUNA:    tienda.comuna,
        TIPO:      item.pkg === 'pallet' ? 'Pallet' : 'Bulto',
        CONTENIDO: item.tipo,
        ORDEN:     item.orden,
        PESO_KG:   item.peso,
        ALTO:      item.alto,
        ANCHO:     item.ancho,
        LARGO:     item.largo,
        GUIA:      item.guia,
        VALOR:     item.valor,
      });
      counter++;
    }
  }

  return rows;
}

export function sheetsRegionesWrite(
  dispatchData: Record<string, DispatchItem[]>,
): boolean {
  const rows = buildRegionesSheetsRows(dispatchData);
  if (!rows.length) return false;

  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10_000);
  fetch(SANTIAGO_SHEETS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'write', sheetName: 'DespachoRegiones', rows }),
    signal: ctrl.signal,
  }).catch(() => {});

  return true;
}
