import type { SantiagoItem } from '../types';
import { getTiendaSantiagoByCod } from '../data/tiendasSantiago';
import { esSinPesar } from '../../shared/sinPesar';

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

  // Fecha armado formateada (DD/MM/YYYY), cae a hoy si no se provee.
  // [P4] Es la fecha operativa: se usa en la columna FECHA (llave de match cod+fecha con el Enrutador).
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
      // [Agregar sin pesar] Si el item no fue pesado, escribimos el NÚMERO 0 (no '') en PESO_KG.
      // sheets-write decide append+mirror-a-DB vs. ruta enrutador con `hasDims = records.some(r =>
      // r.peso_kg !== null)`, y n('') → null. Si TODOS los items del batch fueran sin pesar y
      // escribiéramos '', hasDims sería false y las filas NO se agregarían a la hoja ni al DB
      // (pérdida de datos). Con 0 numérico, peso_kg = 0 (no null) y hasDims se mantiene true.
      const sinPesar = esSinPesar(item);
      rows.push([
        `${item.orden}${cod}${stamp}${tipoPrefix}`,                       // ID — mantiene stamp de despacho (idempotencia del registro)
        fechaArmadoFmt,                                                    // FECHA (armado) [P4] — llave de match cod+fecha
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
        sinPesar ? 0 : (item.peso       || ''),                            // PESO_KG
        sinPesar ? 0 : (item.alto       || ''),                            // ALTO
        sinPesar ? 0 : (item.largo      || ''),                            // LARGO
        sinPesar ? 0 : (item.ancho      || ''),                            // ANCHO
        sinPesar ? 0 : (item.pesoVolumetrico || ''),                       // PESO_V
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
        item.pickingSlotId ?? '',                                          // CÓDIGO (col AD — #488 = id del pallet en la etiqueta)
      ]);
    }
  }

  return rows;
}

// Devuelve la promesa del POST a Sheets para que el llamador pueda encadenar
// acciones que dependan de que la escritura ya esté en la planilla (p. ej.
// disparar la sincronización a la base de datos). La promesa nunca rechaza.
export function sheetsSantiagoWrite(
  items: Record<string, SantiagoItem[]>,
  regimen: string,
  fechaISO?: string,
  fechaArmadoISO?: string,
): Promise<void> {
  const rows = buildRows(items, regimen, fechaISO, fechaArmadoISO);
  if (!rows.length) return Promise.resolve();

  return fetch('/api/sheets-write', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sheet: 'DESPACHO RM', rows, fuente: 'bodega_rm' }),
  }).then(() => undefined).catch(err => { console.error('[sheetsSantiagoWrite]', err); });
}
