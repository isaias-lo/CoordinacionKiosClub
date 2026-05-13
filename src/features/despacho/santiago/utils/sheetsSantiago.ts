import type { SantiagoItem } from '../types';
import { getTiendaSantiagoByCod } from '../data/tiendasSantiago';

const URBAN_COMMUNES = new Set([
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Ñuñoa',
  'Maipú', 'La Florida', 'Quilicura', 'Huechuraba', 'La Reina',
  'Lo Barnechea', 'Puente Alto',
]);

// Columnas DESPACHO RM:
// ID,FECHA,COD,TIENDA,TIPO,REGIMEN,TRANSPORTE,CARGA,REGION,COMUNA,
// TIPO_COMUNA,PESO_KG,ALTO,LARGO,ANCHO,PESO_V,VENTANA,ESTADO,
// N_PALLET_BULTO,FECHA_LLEGADA,CONDUCTOR,RUTA,SUPERVISOR
function buildRows(
  items: Record<string, SantiagoItem[]>,
  regimen: string,
): (string | number)[][] {
  const now   = new Date();
  const dd    = String(now.getDate()).padStart(2, '0');
  const mm    = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy  = String(now.getFullYear());
  const stamp = `${dd}${mm}${yyyy}`;
  const fecha = `${dd}/${mm}/${yyyy}`;

  const rows: (string | number)[][] = [];

  for (const [cod, tiendaItems] of Object.entries(items)) {
    if (!tiendaItems.length) continue;
    const tienda = getTiendaSantiagoByCod(cod);
    if (!tienda) continue;

    for (const item of tiendaItems) {
      rows.push([
        `${item.orden}${cod}${stamp}`,                                    // ID
        fecha,                                                             // FECHA
        cod,                                                               // COD
        tienda.tienda,                                                     // TIENDA
        item.tipo,                                                         // TIPO
        regimen,                                                           // REGIMEN
        'Luis Fica',                                                       // TRANSPORTE
        item.contenido,                                                    // CARGA
        tienda.region,                                                     // REGION
        tienda.comuna,                                                     // COMUNA
        URBAN_COMMUNES.has(tienda.comuna) ? 'Urbano' : 'Extraurbano',     // TIPO_COMUNA
        item.peso       || '',                                             // PESO_KG
        item.alto       || '',                                             // ALTO
        item.largo      || '',                                             // LARGO
        item.ancho      || '',                                             // ANCHO
        item.pesoVolumetrico || '',                                        // PESO_V
        tienda.ventanaHoraria || '',                                       // VENTANA
        item.estado,                                                       // ESTADO
        item.orden,                                                        // N_PALLET_BULTO
        '',                                                                // FECHA_LLEGADA
        '',                                                                // CONDUCTOR
        '',                                                                // RUTA
        '',                                                                // SUPERVISOR
      ]);
    }
  }

  return rows;
}

export function sheetsSantiagoWrite(
  items: Record<string, SantiagoItem[]>,
  regimen: string,
): void {
  const rows = buildRows(items, regimen);
  if (!rows.length) return;

  fetch('/api/sheets-write', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sheet: 'DESPACHO RM', rows }),
  }).catch(err => console.error('[sheetsSantiagoWrite]', err));
}
