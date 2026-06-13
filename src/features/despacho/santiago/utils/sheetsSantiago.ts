import type { SantiagoItem } from '../types';
import { getTiendaSantiagoByCod } from '../data/tiendasSantiago';

const URBAN_COMMUNES = new Set([
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Ñuñoa',
  'Maipú', 'La Florida', 'Quilicura', 'Huechuraba', 'La Reina',
  'Lo Barnechea', 'Puente Alto',
]);

// Columnas DESPACHO RM (26 cols):
// ID,FECHA,COD,TIENDA,TIPO,REGIMEN,TRANSPORTE,PATENTE,CARGA,REGION,COMUNA,
// TIPO_COMUNA,PESO_KG,ALTO,LARGO,ANCHO,PESO_V,VENTANA,ESTADO,
// N_PALLET_BULTO,FECHA_LLEGADA,CONDUCTOR,RUTA,SUPERVISOR,GUIA,VALOR
export function buildRows(
  items: Record<string, SantiagoItem[]>,
  regimen: string,
  fechaISO?: string,        // YYYY-MM-DD — fecha de despacho (puede ser mañana)
  fechaArmadoISO?: string,  // YYYY-MM-DD — fecha en que se armó en Bodega (hoy)
): (string | number)[][] {
  const now   = new Date();
  const [yISO, mISO, dISO] = (fechaISO ?? '').split('-');
  const dd    = fechaISO ? dISO : String(now.getDate()).padStart(2, '0');
  const mm    = fechaISO ? mISO : String(now.getMonth() + 1).padStart(2, '0');
  const yyyy  = fechaISO ? yISO : String(now.getFullYear());
  const stamp = `${dd}${mm}${yyyy}`;
  const fecha = `${dd}/${mm}/${yyyy}`;

  // Fecha armado formateada (DD/MM/YYYY), cae a hoy si no se provee
  const fechaArmadoFmt = fechaArmadoISO
    ? fechaArmadoISO.split('-').reverse().join('/')
    : `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const rows: (string | number)[][] = [];

  for (const [cod, tiendaItems] of Object.entries(items)) {
    if (!tiendaItems.length) continue;
    const tienda = getTiendaSantiagoByCod(cod);
    if (!tienda) continue;

    for (const item of tiendaItems) {
      const tipoPrefix = item.tipo === 'Pallet' ? 'P' : item.tipo === 'Bulto' ? 'B' : item.tipo === 'Contenedor' ? 'C' : 'CH';
      const tipoLabel  = item.tipo === 'Chocolate' ? 'Bulto CH' : item.tipo;
      rows.push([
        `${item.orden}${cod}${stamp}${tipoPrefix}`,                       // ID — matches Enrutador format
        fecha,                                                             // FECHA (despacho)
        cod,                                                               // COD
        tienda.tienda,                                                     // TIENDA
        tipoLabel,                                                         // TIPO
        regimen,                                                           // REGIMEN
        'Luis Fica',                                                       // TRANSPORTE
        '',                                                                // PATENTE (enrutador la completa)
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
        '',                                                                // GUIA
        '',                                                                // VALOR
        '',                                                                // PIONETA 1 (col AA — Enrutador lo llena)
        '',                                                                // PIONETA 2 (col AB — Enrutador lo llena)
        fechaArmadoFmt,                                                    // FECHA_ARMADO (col AC)
        item.canonical_id ?? '',                                           // CÓDIGO (col AD — canonical_id picking)
      ]);
    }
  }

  return rows;
}

export function sheetsSantiagoWrite(
  items: Record<string, SantiagoItem[]>,
  regimen: string,
  fechaISO?: string,
  fechaArmadoISO?: string,
): void {
  const rows = buildRows(items, regimen, fechaISO, fechaArmadoISO);
  if (!rows.length) return;

  fetch('/api/sheets-write', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sheet: 'DESPACHO RM', rows, fuente: 'bodega_rm' }),
  }).catch(err => console.error('[sheetsSantiagoWrite]', err));
}
