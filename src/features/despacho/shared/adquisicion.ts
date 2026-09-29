// Los AGREGADOS de Bodega: dos envases nuevos al lado de Pallet / Bulto / Contenedor / Chocolate.
//
//   · Adquisición   — una compra que sube al camión.
//   · Web / retiro  — un pedido web que el cliente retira en la tienda.
//
// Los dos se comportan como un BULTO en todo lo que se cuenta y se numera: suman como bulto en los
// totales y entran en la misma serie. La única diferencia es que NO se miden ni se pesan: la
// tarjeta nace completa y apretar el botón es todo lo que hay que hacer.
//
// Eso sale gratis por cómo está escrito `numeroCard`: `claseSantiago` y `claseNacional` caen por
// defecto en 'bulto', así que un tipo nuevo ya se numera y se cuenta como bulto sin tocarlas. El
// test de este módulo lo fija, para que nadie cambie ese `return 'bulto'` final sin enterarse.
//
// POR QUÉ SON DOS BOTONES Y NO UNO CON PREGUNTA. Un botón único obligaría a bautizar la familia en
// pantalla, y el candidato natural —"Agregado"— YA ESTÁ USADO en la tarjeta con otro significado:
// es la etiqueta verde de "ya quedó guardado en la carga". Una tarjeta habría dicho
// «Agregado · Agregado», y peor: el tipo se leería como un estado. Con dos botones el nombre de la
// familia solo existe acá, en el código.
//
// POR QUÉ SE GUARDAN CON SU PROPIO TIPO. Si se escribieran como 'Bulto', después no habría forma de
// separarlos de un bulto normal, ni en la planilla ni en la base — y el dato no se reconstruye. El
// tipo viaja por la columna TIPO, que YA EXISTE (es la E) y ya distingue los envases: esto son dos
// valores más, no una columna nueva. Las hojas son posicionales y acá no se corre ninguna.

/** Lo que Bodega RM/Costa guarda en `tipo` (`TipoCargamento`). */
export const TIPO_ADQUISICION = 'Adquisicion';
export const TIPO_WEB_RETIRO  = 'WebRetiro';

/** Lo que Bodega Nacional guarda en `pkg` (`TipoPaquete`). */
export const PKG_ADQUISICION = 'adquisicion';
export const PKG_WEB_RETIRO  = 'web-retiro';

/** Lo que se escribe en la columna TIPO de la planilla. Es texto para leer, con tilde. */
export const LABEL_ADQUISICION = 'Adquisición';
export const LABEL_WEB_RETIRO  = 'Web / retiro';

/**
 * Prefijo del ID de la fila (`${orden}${cod}${stamp}${prefijo}`).
 *
 * Una sola letra, como P, B y C: el parser de etiquetas separa letras de dígitos y así entran en el
 * mismo molde sin caso especial. (El chocolate usa CH, que ya existía.)
 */
export const PREFIJO_ADQUISICION = 'A';
export const PREFIJO_WEB_RETIRO  = 'W';

/** Las cuatro escrituras de cada uno: Santiago, Nacional, y la etiqueta de la planilla. */
const ADQUISICION = new Set(['adquisicion', 'adquisición']);
const WEB_RETIRO  = new Set(['webretiro', 'web-retiro', 'web / retiro', 'web/retiro', 'web retiro']);

const norm = (v?: string | null) => String(v ?? '').trim().toLowerCase();

export function esAdquisicion(tipoOPkg?: string | null): boolean {
  return ADQUISICION.has(norm(tipoOPkg));
}

export function esWebRetiro(tipoOPkg?: string | null): boolean {
  return WEB_RETIRO.has(norm(tipoOPkg));
}

/**
 * ¿Es uno de los dos agregados?
 *
 * Esta es la que usan las pantallas: lo que las distingue del resto es el comportamiento —no piden
 * medidas—, y ese comportamiento es idéntico para los dos.
 */
export function esAgregado(tipoOPkg?: string | null): boolean {
  return esAdquisicion(tipoOPkg) || esWebRetiro(tipoOPkg);
}

/**
 * ¿La tarjeta de esta fila pide medidas y peso?
 *
 * Todo lo demás sí; los agregados no. Se pregunta por acá y no con comparaciones sueltas en cada
 * pantalla, para que los dos espejos de Bodega no puedan discrepar — que es el patrón que ya dejó
 * el chocolate arreglado en un camino y roto en el otro.
 */
export function pideMedidas(tipoOPkg?: string | null): boolean {
  return !esAgregado(tipoOPkg);
}

/**
 * ¿Esta fila ya está completa apenas se crea?
 *
 * Un agregado no tiene nada que llenar, así que nace listo. Sin esto quedaría contado como
 * pendiente para siempre: los avisos de "sin pesar" miran el peso, y el suyo nunca va a llegar.
 */
export function naceCompleta(tipoOPkg?: string | null): boolean {
  return esAgregado(tipoOPkg);
}

/** La etiqueta para la planilla y para la tarjeta, o `null` si no es un agregado. */
export function etiquetaAgregado(tipoOPkg?: string | null): string | null {
  if (esAdquisicion(tipoOPkg)) return LABEL_ADQUISICION;
  if (esWebRetiro(tipoOPkg))   return LABEL_WEB_RETIRO;
  return null;
}
