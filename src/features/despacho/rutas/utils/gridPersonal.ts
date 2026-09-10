// Columnas del catálogo de Personal (FLOTA → Conductores y Pionetas).
//
// El panel se veía roto en tablet: los nombres se quebraban en varias líneas y la grilla se salía
// de su caja. La causa NO era el ancho de la pantalla sino la unidad usada.
//
// `gridTemplateColumns: '1fr 1fr 1fr'` parece "tres columnas iguales que encogen", pero `1fr` es
// `minmax(auto, 1fr)` y ese `auto` significa min-content. El min-content de un `<input>` es su
// tamaño por defecto (~20 caracteres), así que la grilla NUNCA baja de eso: cuando el contenedor
// es más angosto que la suma de los tres mínimos, se DESBORDA en vez de encoger. Eso es lo que
// deformaba el panel — y pasa en cualquier ancho, no solo en tablet.
//
// `minmax(0, …)` le da mínimo cero a cada pista, que es lo que uno cree estar pidiendo con `1fr`.
// Con eso los campos encogen de verdad y el desborde desaparece.
//
// Encima, dos cortes por ancho: los dos catálogos dejan de ir lado a lado cuando no caben, y los
// tres campos se apilan en pantallas de teléfono.
//
// Puro y testeable: no toca React ni el DOM.

/**
 * Bajo este ancho, Conductores y Pionetas dejan de ir lado a lado.
 *
 * 1024 y no 900: es el mismo corte que ya usa el hamburguesa global (`lg:hidden`), y deja a los
 * iPad en vertical (820 px) con el catálogo a ancho completo. En horizontal (~1180 px) siguen
 * lado a lado, que ahí sí caben — con `minmax(0,…)` ya no se deforman.
 */
export const BP_CATALOGO_APILADO = 1024;

/** Bajo este ancho, nombre/teléfono/empresa se apilan uno debajo del otro (teléfonos). */
export const BP_CAMPOS_APILADOS = 640;

/** Columnas del contenedor que pone los dos catálogos lado a lado. */
export function columnasCatalogo(ancho: number): string {
  return ancho < BP_CATALOGO_APILADO ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)';
}

/**
 * Columnas de la grilla nombre / teléfono / empresa.
 *
 * El nombre lleva 1.6fr contra 1fr de los otros dos: "Juan Carlos Fuentealba" necesita más ancho
 * que un teléfono de 9 dígitos, y repartir en partes iguales es lo que obligaba a cortar el
 * nombre en dos líneas.
 */
export function columnasCampos(ancho: number): string {
  return ancho < BP_CAMPOS_APILADOS
    ? 'minmax(0,1fr)'
    : 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr)';
}
