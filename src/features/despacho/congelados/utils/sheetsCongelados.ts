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
  /** kg de la caja: su parte del peso total que se pesó en Picking. null = sin pesar. */
  peso?: number | null;
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
      // PESO_KG: antes siempre vacío ("congelados no se pesa"). Ahora lleva la parte de la caja del
      // peso total pesado en Picking. La columna ya existía: no se mueve ninguna (ver sheets
      // posicionales). Sin pesar, sigue vacía como siempre.
      item.peso != null && item.peso > 0 ? item.peso : '',
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
//
// Lo que SÍ informa es si el espejo a Supabase falló: la planilla puede haberse escrito y la base
// no. Eso pasó durante meses sin que se notara, porque acá se ignoraba la respuesta entera y la
// pantalla decía "✓ Registrado" igual.
export interface ResultadoCongeladosWrite {
  /** false = ni siquiera se pudo escribir la planilla. */
  ok: boolean;
  /** Errores del espejo a despacho_rm/despacho_regiones. Vacío = la base quedó al día. */
  mirrorErrores: string[];
}

export function sheetsCongeladosWrite(
  items: CongeladoItem[],
  meta: CongeladosMeta,
  tabla: 'despacho_rm' | 'despacho_regiones',
  token?: string,
): Promise<ResultadoCongeladosWrite> {
  const rows = buildCongeladosRows(items, meta);
  if (!rows.length) return Promise.resolve({ ok: true, mirrorErrores: [] });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch('/api/sheets-write', {
    method:  'POST',
    headers,
    body:    JSON.stringify({ sheet: 'DESPACHO CONGELADOS', tabla, fuente: 'bodega_congelados', rows }),
  })
    .then(async res => {
      if (!res.ok) return { ok: false, mirrorErrores: [`HTTP ${res.status}`] };
      const body = await res.json().catch(() => ({})) as { mirrorErrores?: string[] };
      return { ok: true, mirrorErrores: body.mirrorErrores ?? [] };
    })
    .catch(err => { console.error('[sheetsCongeladosWrite]', err); return { ok: false, mirrorErrores: [String(err)] }; });
}
