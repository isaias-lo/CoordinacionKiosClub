// Soltar de la pantalla las tiendas que NO son de esta bodega. PURO.
//
// ── POR QUÉ NO ALCANZÓ CERRAR LA PUERTA ───────────────────────────────────────────────────────
//
// El #681 impide que entren nuevas. Pero las que YA entraron se quedan, y no hay forma de sacarlas
// desde la pantalla: la lista filtra las tiendas de Regiones, así que la tarjeta no se dibuja y el
// ítem queda HUÉRFANO —invisible y vivo— mientras el merge lo conserva ("ausencia no es borrado").
//
// Medido el 06/10/2026 con 60PBL en RM/Costa:
//
//   · el encabezado de la lista decía 59P / 19 tiendas (filtra Regiones);
//   · el Resumen en tiempo real decía 60P / 20 tiendas (cuenta `items` entero).
//
// Dos números distintos en la misma pantalla, y los dos bien calculados: el filtro estaba en un
// lado y no en el otro. Borrarlo de la base tampoco sirve —la pestaña abierta lo reescribió 84
// segundos después— y la tarjeta no se puede borrar a mano sin llevarse el slot de la balanza con
// ella. Tiene que soltarlo la pantalla al cargar.
//
// ── POR QUÉ SOLO RM/COSTA, Y POR QUÉ ESO NO ES OLVIDARSE DEL ESPEJO ───────────────────────────
//
// `REGIONES_CODS` CRECE en runtime. Mientras no se hidrata, `esDeRegiones` contesta `false` para
// una tienda de Regiones creada en Config (60PBL). O sea:
//
//   · en RM/Costa, un `true` es conocimiento POSITIVO: solo hay tiendas de Regiones en ese Set.
//     Sin hidratar no suelta nada — falla hacia NO borrar.
//   · en Nacional sería al revés: un `false` sin hidratar haría soltar una tienda que SÍ es suya.
//     Eso es pérdida de datos, y por eso acá no va. Es una decisión, no un descuido.
//
// La contaminación además corre en un solo sentido: el catálogo de RM/Costa se arma con TODO
// `/api/tiendas`; el de Nacional solo tiene Regiones.

/** Las tiendas ajenas que hay en `items`, y el mapa sin ellas. No toca `picking_pallets`. */
export function soltarTiendasAjenas<T>(
  items: Readonly<Record<string, readonly T[]>>,
  esAjena: (cod: string) => boolean,
): { items: Record<string, readonly T[]>; ajenas: string[] } {
  const ajenas: string[] = [];
  for (const cod of Object.keys(items)) if (esAjena(cod)) ajenas.push(cod);
  if (ajenas.length === 0) return { items: items as Record<string, readonly T[]>, ajenas };
  const limpio: Record<string, readonly T[]> = {};
  for (const [cod, lista] of Object.entries(items)) if (!ajenas.includes(cod)) limpio[cod] = lista;
  return { items: limpio, ajenas };
}
