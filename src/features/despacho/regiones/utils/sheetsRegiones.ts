import { TIENDAS } from '../data/tiendas';
import type { DispatchItem } from '../../../../types';

const CARGA_LABEL: Record<string, string> = {
  comida:         'Comida',
  hogar:          'Hogar',
  'comida-hogar': 'Comida-Hogar',
  aseo:           'Aseo',
  chocolate:      'Chocolate',
  mixto:          'Mixto',
};

const URBAN_COMMUNES = new Set([
  'Santiago', 'Providencia', 'Las Condes', 'Vitacura', 'Ñuñoa',
  'Maipú', 'La Florida', 'Quilicura', 'Huechuraba', 'La Reina',
  'Lo Barnechea', 'Puente Alto',
]);

// Columnas DESPACHO REGIONES (26 cols):
// ID,FECHA,COD,TIENDA,TIPO,REGIMEN,TRANSPORTE,PATENTE,CARGA,REGION,COMUNA,
// TIPO_COMUNA,PESO_KG,ALTO,LARGO,ANCHO,PESO_V,VENTANA,ESTADO,
// N_PALLET_BULTO,FECHA_LLEGADA,CONDUCTOR,RUTA,SUPERVISOR,GUIA,VALOR

// Extrae el número de secuencia de un orden tipo "pallet1", "bulto12", "contenedor3", "CH2".
function ordenSeq(orden: string): string {
  const m = orden.match(/(\d+)$/);
  return m ? m[1] : orden;
}

// Construye el canonical ID siguiendo el formato estándar del sistema
// (mismo que despacho-picking y santiago):
//   pallet      → P{seq}{cod}{stamp}P
//   bulto/box   → {seq}B{cod}{stamp}B
//   chocolate   → CH{seq}{cod}{stamp}CH
//   contenedor  → C{seq}{cod}{stamp}C
function canonicalId(pkg: string, orden: string, cod: string, stamp: string): string {
  const seq = ordenSeq(orden);
  if (pkg === 'pallet')     return `P${seq}${cod}${stamp}P`;
  if (pkg === 'contenedor') return `C${seq}${cod}${stamp}C`;
  if (pkg === 'chocolate')  return `CH${seq}${cod}${stamp}CH`;
  return `${seq}B${cod}${stamp}B`; // bulto / box (default)
}

export function buildRows(
  dispatchData: Record<string, DispatchItem[]>,
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
  const transporte = regimen === 'Falabella' ? 'Falabella' : 'Carga';

  const fechaArmadoFmt = fechaArmadoISO
    ? fechaArmadoISO.split('-').reverse().join('/')
    : `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const rows: (string | number)[][] = [];

  for (const [storeName, items] of Object.entries(dispatchData)) {
    if (!items.length) continue;
    const tienda = TIENDAS[storeName];
    if (!tienda) continue;

    for (const item of items) {
      const pesoV = item.alto && item.largo && item.ancho
        ? Math.round((item.alto * item.largo * item.ancho) / 6000 * 100) / 100
        : '';

      rows.push([
        canonicalId(item.pkg, item.orden, tienda.cod, stamp), // ID
        fecha,                                          // FECHA (despacho)
        tienda.cod,                                     // COD
        tienda.name,                                    // TIENDA
        item.pkg === 'pallet' ? 'Pallet' : item.pkg === 'contenedor' ? 'Contenedor' : item.pkg === 'chocolate' ? 'Bulto CH' : 'Bulto',  // TIPO
        regimen,                                        // REGIMEN
        transporte,                                     // TRANSPORTE
        '',                                             // PATENTE (enrutador la completa)
        CARGA_LABEL[item.tipo] ?? item.tipo,            // CARGA
        tienda.region,                                  // REGION
        tienda.comuna,                                  // COMUNA
        URBAN_COMMUNES.has(tienda.comuna) ? 'Urbano' : 'Extraurbano', // TIPO_COMUNA
        item.peso || '',                                // PESO_KG
        item.alto  || '',                               // ALTO
        item.largo || '',                               // LARGO
        item.ancho || '',                               // ANCHO
        pesoV,                                          // PESO_V
        '',                                             // VENTANA
        'Listo para despachar',                         // ESTADO
        ordenSeq(item.orden),                           // N_PALLET_BULTO
        '',                                             // FECHA_LLEGADA
        '',                                             // CONDUCTOR
        '',                                             // RUTA
        '',                                             // SUPERVISOR
        item.guia  || '',                               // GUIA
        item.valor || '',                               // VALOR
        '',                                             // PIONETA 1 (col AA — Enrutador lo llena)
        '',                                             // PIONETA 2 (col AB — Enrutador lo llena)
        fechaArmadoFmt,                                 // FECHA_ARMADO (col AC)
        item.pickingSlotId ?? '',                       // CÓDIGO (col AD — #488 = id del pallet en la etiqueta)
      ]);
    }
  }

  return rows;
}

// Devuelve la promesa del POST a Sheets para que el llamador pueda encadenar
// acciones que dependan de que la escritura ya esté en la planilla (p. ej.
// disparar la sincronización a la base de datos). La promesa nunca rechaza:
// captura el error internamente para no romper el flujo de registro.
export function sheetsRegionesWrite(
  dispatchData: Record<string, DispatchItem[]>,
  regimen = 'Carga',
  fechaISO?: string,
  fechaArmadoISO?: string,
): Promise<void> {
  const rows = buildRows(dispatchData, regimen, fechaISO, fechaArmadoISO);
  if (!rows.length) return Promise.resolve();

  return fetch('/api/sheets-write', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sheet: 'DESPACHO REGIONES', rows, fuente: 'bodega_regiones' }),
  }).then(() => undefined).catch(err => { console.error('[sheetsRegionesWrite]', err); });
}
