import type { SantiagoItem } from '../types';
import { getTiendaSantiagoByCod } from '../data/tiendasSantiago';

export const SANTIAGO_SHEETS_URL =
  'https://script.google.com/macros/s/AKfycbzrBdzGrmT_0uBwzVxoPi3nubtsIVSYBrnNgdaAr43f2rjS2PQr_XZ-NGw--CTH4DMFOQ/exec';

const URBAN_COMMUNES = new Set([
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Ñuñoa',
  'Maipú', 'La Florida', 'Quilicura', 'Huechuraba', 'La Reina',
  'Lo Barnechea', 'Puente Alto',
]);

function buildSantiagoRows(
  items: Record<string, SantiagoItem[]>,
  regimen: string,
): Record<string, unknown>[] {
  const fecha = new Date().toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'');
  const rows: Record<string, unknown>[] = [];

  for (const [cod, tiendaItems] of Object.entries(items)) {
    if (!tiendaItems.length) continue;
    const tienda = getTiendaSantiagoByCod(cod);
    if (!tienda) continue;

    for (const item of tiendaItems) {
      rows.push({
        ID:              `${item.orden}${cod}${fecha}`,
        FECHA_DESPACHO:  `${parseInt(fecha.slice(0,2))}/${fecha.slice(2,4)}/${fecha.slice(4)}`,
        COD_TIENDA:      cod,
        TIENDA:          tienda.tienda,
        TIPO_CARGAMENTO: item.tipo,
        REGIMEN_CARGA:   regimen,
        TRANSPORTE:      'Luis Fica',
        CARGA:           item.contenido,
        REGION_DESTINO:  tienda.region,
        COMUNA_DESTINO:  tienda.comuna,
        TIPO_COMUNA:     URBAN_COMMUNES.has(tienda.comuna) ? 'Urbano' : 'Extraurbano',
        PESO_KG:         item.peso,
        ALTO:            item.alto,
        LARGO:           item.largo,
        ANCHO:           item.ancho,
        PESO_V:          item.pesoVolumetrico,
        VENTANA_HORARIA: tienda.ventanaHoraria,
        ESTADO:          item.estado,
        N_Pallet_Bulto:  item.orden,
        FECHA_LLEGADA:   '',
      });
    }
  }

  return rows;
}

export function sheetsSantiagoWrite(
  items: Record<string, SantiagoItem[]>,
  regimen: string,
): boolean {
  const rows = buildSantiagoRows(items, regimen);
  if (!rows.length) return false;

  // no-cors responses are always opaque — nothing to read back.
  // Fire in background with a timeout so we never block the UI.
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 10_000);
  fetch(SANTIAGO_SHEETS_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'write', rows }),
    signal: ctrl.signal,
  }).catch(() => {});

  return true;
}
