// El `canonical_id` de una unidad de Picking: lo que va impreso en el código de barras.
//
// ── POR QUÉ ESTE ARCHIVO ──────────────────────────────────────────────────────────────────────
//
// Esta función estaba escrita SEIS veces, cada una con su propia tabla de envases:
//
//   · api/picking-pallets/create-bodega   P B CH C · A W          (el #617 le agregó A y W)
//   · api/picking-pallets/combine         P B CH C
//   · api/despacho-picking                P B CH C · CC CN
//   · features/picking/picking-utils      P B CH C · CC CN
//   · features/despacho/estado/CombineAlertsPanel  P B CH C
//   · fn_create_bodega_slot (EN LA BASE)  P B CH C
//
// La última es la que de verdad corre: `create-bodega` llama al RPC atómico y solo cae a su copia
// de TypeScript si el RPC falla. O sea que el #617 arregló el FALLBACK y el camino real siguió
// igual. Medido el 07/10/2026 sobre `picking_pallets`: **las 26 adquisiciones y los 3 web/retiro
// de toda la historia están sin su letra**, con el formato de descarte `{seq}{cod}{stamp}`.
//
// ── EL CHOQUE, QUE YA PASÓ ────────────────────────────────────────────────────────────────────
//
// 02/10/2026, tienda 23PEÑ: el slot 961 (A1) y el slot 1009 (W1) quedaron los dos con
// `123PEÑ02102026`. **Dos etiquetas distintas con el mismo código de barras**, así que la pistola
// no puede distinguirlas: `buscarPallet` devuelve la primera que encuentra. El comentario del
// #617 decía «hoy no había W, así que todavía no chocó». Chocó.
//
// ── EL BULTO ESCRIBE AL REVÉS, Y SE RESPETA ───────────────────────────────────────────────────
//
// Todos los envases son `{letra}{seq}…{letra}`; el bulto es `{seq}B…B` (`1B28TEM22092026B`). Es
// así desde el primer día y está IMPRESO en etiquetas que andan dando vueltas por la bodega: no se
// "ordena", se preserva.

/** La letra de cada envase. Va adelante y atrás del id. */
const LETRA: Record<string, string> = {
  P: 'P', B: 'B', CH: 'CH', C: 'C', CC: 'CC', CN: 'CN', A: 'A', W: 'W',
};

/** El bulto escribe el número ANTES de la letra. Ver el encabezado: está impreso así. */
const SEQ_ANTES_DE_LA_LETRA: ReadonlySet<string> = new Set(['B']);

/**
 * El id canónico de una unidad. PURA.
 *
 * `stamp` es DDMMYYYY. Un envase que no esté en la tabla cae a `{seq}{cod}{stamp}` —el mismo
 * descarte de siempre— porque cambiar ESO sí rompería ids ya impresos. Agregar un envase nuevo se
 * hace acá y en `fn_create_bodega_slot`, y en ningún otro lado.
 */
export function canonicalDeSlot(
  tipo: string,
  // `seq` admite texto porque la hoja de Nacional lo saca del `orden` de la pantalla
  // (`ordenSeq`), que devuelve los dígitos del final o el `orden` entero si no los tiene. Se
  // interpola tal cual: forzarlo a número convertiría ese caso en `NaN` y cambiaría ids impresos.
  seq: number | string,
  cod: string,
  stamp: string,
): string {
  const l = LETRA[tipo];
  if (!l) return `${seq}${cod}${stamp}`;
  const cabeza = SEQ_ANTES_DE_LA_LETRA.has(tipo) ? `${seq}${l}` : `${l}${seq}`;
  return `${cabeza}${cod}${stamp}${l}`;
}

/** DDMMYYYY desde una fecha ISO (YYYY-MM-DD). */
export function stampDesdeISO(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${dd}${mm}${yyyy}`;
}
