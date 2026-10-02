// A qué zona y de qué tipo es una tienda, para la ETIQUETA que sale de Picking.
//
// ── POR QUÉ ESTO VA IMPRESO ───────────────────────────────────────────────────────────────────
//
// Hoy se escribe a mano. El coordinador mandó la foto de una etiqueta real de 46TRE con
// «MALL - REGION SUR» puesto con plumón sobre la banda de AGRUPACIÓN, y «kg» y «CM» a los lados del
// código de barras. Esos tres datos ya los tiene el sistema: escribirlos a mano en cada hoja es
// trabajo que no hace falta, y la letra de cada persona es algo más que después hay que descifrar.
//
// ── DE DÓNDE SALE CADA UNO ────────────────────────────────────────────────────────────────────
//
// El TIPO sale tal cual del catálogo (Config. Tiendas): MALL, STRIPCENTER o TIENDA.
//
// La ZONA se arma con `sector_comuna` y, para las de región, con `corredor`. El campo `sector` ya
// está documentado en `rutas/data/tiendas.ts` como «la fuente de verdad de a qué zona pertenece la
// tienda», así que manda él; el corredor solo desempata entre norte y sur.
//
// ── CUANDO NO SE SABE, NO SE INVENTA ──────────────────────────────────────────────────────────
//
// Las dos devuelven `null` si el dato no está, y la etiqueta no dibuja ese rótulo. Medido sobre el
// catálogo del 02/10/2026: 3 tiendas tienen el sector en blanco y 2 están marcadas como «punto» en
// vez de un tipo. Poner «RM» por defecto en una tienda sin sector sería escribir en el papel algo
// que nadie verificó, y esa hoja la lee quien carga el camión.

export type ZonaTienda = 'RM' | 'COSTA' | 'REGIÓN NORTE' | 'REGIÓN SUR' | 'REGIÓN';
export type TipoTienda = 'MALL' | 'STRIPCENTER' | 'TIENDA';

/** Sin acentos, sin mayúsculas y sin espacios de sobra: el catálogo se carga a mano. */
function normal(s?: string | null): string {
  return String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * La zona de una tienda, o `null` si el catálogo no lo dice.
 *
 * `sector` manda. `corredor` solo decide entre norte y sur cuando el sector dice «Región» a secas.
 */
export function zonaDeTienda(
  t: { sector?: string | null; corredor?: string | null } | null | undefined,
): ZonaTienda | null {
  const sector = normal(t?.sector);
  if (!sector) return null;                       // sin dato: no se inventa
  if (sector.startsWith('costa')) return 'COSTA';
  if (!sector.startsWith('regi')) return 'RM';    // Corredor *, Las Condes, Ñuñoa, Santiago…

  // De región: el sector puede traerlo ya resuelto («Región Sur»); si no, lo dice el corredor.
  //
  // Se le saca el «región» de adelante antes de preguntar. Mirar la cadena entera no sirve:
  // «region sur» empieza con «region», no con «sur», y la tienda caía en «REGIÓN» a secas.
  const resto = sector.replace(/^regi(on(es)?)?\s*/, '').trim();
  const pista = resto || normal(t?.corredor);
  if (pista.startsWith('norte')) return 'REGIÓN NORTE';
  // «XIV Región / Los Ríos (Ruta 5 Sur)» es del sur y no empieza con «sur».
  if (pista.startsWith('sur') || pista.startsWith('xiv')) return 'REGIÓN SUR';
  return 'REGIÓN';                                // de región, pero sin saber de cuál
}

/**
 * El tipo tal cual se imprime, o `null` si no es uno de los tres que se despachan.
 *
 * «punto» y «oficina» existen en el catálogo y NO son tiendas de abastecimiento: no llevan rótulo.
 */
export function etiquetaTipoTienda(tipo?: string | null): TipoTienda | null {
  const t = normal(tipo).replace(/\s+/g, '');
  if (t === 'mall') return 'MALL';
  if (t === 'stripcenter') return 'STRIPCENTER';
  if (t === 'tienda') return 'TIENDA';
  return null;
}
