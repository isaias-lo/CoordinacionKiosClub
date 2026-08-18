export interface CongeladoItem {
  id: string;              // id único/canónico de la caja (col A). Si viene vacío, generalo aguas arriba.
  tiendaCod: string;
  tienda: string;
  tipoCaja: 'CC' | 'CN';   // CC = Caja Cartón, CN = Caja Negra
  region: string;
  comuna: string;
  tipoComuna: string;
  ventana: string;
  nPalletBulto: string;    // etiqueta/seq de la caja (ej. canonical o "CC1")
  pickingSlotId: number | null;
  fechaArmado?: string | null; // ISO yyyy-mm-dd (col AC) — opcional
}

export interface CongeladosMeta {
  fecha: string;       // DD/MM/YYYY
  supervisor: string;
}

// Columnas DESPACHO CONGELADOS (30 cols A..AD — mismo layout posicional que DESPACHO RM):
// ID,FECHA,COD,TIENDA,TIPO,REGIMEN,TRANSPORTE,PATENTE,CARGA,REGION,COMUNA,
// TIPO_COMUNA,PESO_KG,ALTO,LARGO,ANCHO,PESO_V,VENTANA,ESTADO,N_PALLET_BULTO,
// FECHA_LLEGADA,CONDUCTOR,RUTA,SUPERVISOR,GUIA,VALOR,PIONETA1,PIONETA2,
// FECHA_ARMADO,CÓDIGO
export function buildCongeladosRows(
  items: CongeladoItem[],
  meta: CongeladosMeta,
): (string | number)[][] {
  const rows: (string | number)[][] = [];

  for (const item of items) {
    // Fecha armado formateada (DD/MM/YYYY) — mismo formato que sheetsSantiago (col AC).
    const fechaArmadoFmt = item.fechaArmado
      ? item.fechaArmado.split('-').reverse().join('/')
      : '';

    rows.push([
      item.id,                                                          // ID
      meta.fecha,                                                       // FECHA
      item.tiendaCod,                                                   // COD
      item.tienda,                                                      // TIENDA
      item.tipoCaja === 'CC' ? 'Caja Cartón' : 'Caja Negra',            // TIPO
      'Congelado',                                                      // REGIMEN
      '',                                                                // TRANSPORTE (enrutador lo completa)
      '',                                                                // PATENTE (enrutador la completa)
      'Congelados',                                                     // CARGA
      item.region,                                                      // REGION
      item.comuna,                                                      // COMUNA
      item.tipoComuna,                                                  // TIPO_COMUNA
      '',                                                                // PESO_KG (congelados no se pesa)
      '',                                                                // ALTO
      '',                                                                // LARGO
      '',                                                                // ANCHO
      '',                                                                // PESO_V
      item.ventana,                                                     // VENTANA
      'Registrado',                                                     // ESTADO
      item.nPalletBulto,                                                // N_PALLET_BULTO
      '',                                                                // FECHA_LLEGADA
      '',                                                                // CONDUCTOR
      '',                                                                // RUTA
      meta.supervisor,                                                  // SUPERVISOR
      '',                                                                // GUIA
      '',                                                                // VALOR
      '',                                                                // PIONETA 1 (col AA — Enrutador lo llena)
      '',                                                                // PIONETA 2 (col AB — Enrutador lo llena)
      fechaArmadoFmt,                                                   // FECHA_ARMADO (col AC)
      item.pickingSlotId ?? '',                                         // CÓDIGO (col AD)
    ]);
  }

  return rows;
}

// Devuelve la promesa del POST a Sheets para que el llamador pueda encadenar
// acciones que dependan de que la escritura ya esté en la planilla. La promesa
// nunca rechaza (espeja sheetsSantiagoWrite).
export function sheetsCongeladosWrite(
  items: CongeladoItem[],
  meta: CongeladosMeta,
  tabla: 'despacho_rm' | 'despacho_regiones',
  token?: string,
): Promise<void> {
  const rows = buildCongeladosRows(items, meta);
  if (!rows.length) return Promise.resolve();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch('/api/sheets-write', {
    method:  'POST',
    headers,
    body:    JSON.stringify({ sheet: 'DESPACHO CONGELADOS', tabla, fuente: 'bodega_congelados', rows }),
  }).then(() => undefined).catch(err => { console.error('[sheetsCongeladosWrite]', err); });
}
