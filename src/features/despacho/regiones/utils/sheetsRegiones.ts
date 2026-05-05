import { TIENDAS } from '../data/tiendas';
import type { DispatchItem, TipoContenido } from '../../../../types';

export const REGIONES_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbzrBdzGrmT_0uBwzVxoPi3nubtsIVSYBrnNgdaAr43f2rjS2PQr_XZ-NGw--CTH4DMFOQ/exec';

const CARGA_LABEL: Record<TipoContenido, string> = {
  comida:         'Comida',
  hogar:          'Hogar',
  'comida-hogar': 'Comida-Hogar',
};

const URBAN_COMMUNES = new Set([
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Ñuñoa',
  'Maipú', 'La Florida', 'Quilicura', 'Huechuraba', 'La Reina',
  'Lo Barnechea', 'Puente Alto',
]);

function buildRegionesSheetsRows(
  dispatchData: Record<string, DispatchItem[]>,
  regimen: string,
): Record<string, unknown>[] {
  const fecha = new Date()
    .toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '');                          // "DDMMYYYY"

  const fechaFmt = `${parseInt(fecha.slice(0, 2))}/${fecha.slice(2, 4)}/${fecha.slice(4)}`;
  const transporte = regimen === 'Falabella' ? 'Falabella' : 'Carga';

  const rows: Record<string, unknown>[] = [];

  for (const [storeName, items] of Object.entries(dispatchData)) {
    if (!items.length) continue;
    const tienda = TIENDAS[storeName];
    if (!tienda) continue;

    for (const item of items) {
      const pesoV = item.alto && item.largo && item.ancho
        ? Math.round((item.alto * item.largo * item.ancho) / 6000 * 100) / 100
        : 0;

      rows.push({
        ID:              `${item.orden}${tienda.cod}${fecha}`,
        FECHA_DESPACHO:  fechaFmt,
        COD_TIENDA:      tienda.cod,
        TIENDA:          tienda.name,
        TIPO_CARGAMENTO: item.pkg === 'pallet' ? 'Pallet' : 'Bulto',
        REGIMEN_CARGA:   regimen,
        TRANSPORTE:      transporte,
        CARGA:           CARGA_LABEL[item.tipo] ?? item.tipo,
        REGION_DESTINO:  tienda.region,
        COMUNA_DESTINO:  tienda.comuna,
        TIPO_COMUNA:     URBAN_COMMUNES.has(tienda.comuna) ? 'Urbano' : 'Extraurbano',
        PESO_KG:         item.peso,
        ALTO:            item.alto || '',
        LARGO:           item.largo || '',
        ANCHO:           item.ancho || '',
        PESO_V:          pesoV || '',
        VENTANA_HORARIA: '',
        ESTADO:          'Listo para despachar',
        N_Pallet_Bulto:  item.orden,
        GUIA:            item.guia || '',
        VALOR:           item.valor || '',
        FECHA_LLEGADA:   '',
      });
    }
  }

  return rows;
}

export function sheetsRegionesWrite(
  dispatchData: Record<string, DispatchItem[]>,
  regimen = 'Carga',
): boolean {
  const rows = buildRegionesSheetsRows(dispatchData, regimen);
  if (!rows.length) return false;

  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10_000);
  fetch(REGIONES_SHEETS_URL, {
    method:  'POST',
    mode:    'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'write', sheetName: 'DespachoRegiones', rows }),
    signal:  ctrl.signal,
  }).catch(() => {});

  return true;
}
