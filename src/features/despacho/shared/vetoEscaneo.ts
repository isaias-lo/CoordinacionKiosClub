// ¿Esta pantalla de Bodega puede abrir la tienda de la etiqueta que acaban de escanear?
//
// ── POR QUÉ EXISTE, Y POR QUÉ NO ALCANZÓ EL #654 ──────────────────────────────────────────────
//
// El #654 puso el control de espejo en `saltarAPallet` —el buscador donde la persona TECLEA el
// número— y ahí quedó. Pero hay un segundo camino hacia la misma pantalla, y es el que de verdad
// se usa: la PISTOLA (`useEscaneoBodega`), que lee la etiqueta esté donde esté el cursor y llamaba
// a `selectTienda` sin preguntarle nada a nadie.
//
// Medido en `actividad_bodega` el 05/10/2026: desde la pestaña RM/Costa se trabajaron SIETE tiendas
// de Nacional —51SER, 42ANP, 57CAS, 47PTV, 39PSB, 53VAL y 41ANA— durante dos horas y media
// (11:14 a 13:50), incluyendo borrar chocolates. No fue un resbalón: fue la jornada entera por el
// camino que no tenía control. Y el 06/10 pasó otra vez con 60PBL.
//
// O sea que el #654 arregló el camino menos transitado. Por eso la decisión se muda ACÁ y la
// aplica el hook una sola vez, para los dos caminos que tiene la pistola (la etiqueta de hoy y la
// de otro día) y en los dos espejos.
//
// ── POR QUÉ RECIBE UN TRADUCTOR DE CLAVE ──────────────────────────────────────────────────────
//
// Cada espejo indexa sus mapas por tienda con una clave distinta —RM/Costa por CÓDIGO, Nacional
// por NOMBRE (ver `buscarPallet`)— y la pertenencia se decide por código. Traducir es cosa de
// quien llama; decidir, de acá.

/**
 * El aviso que corresponde si la tienda de la etiqueta es del OTRO espejo, o `null` si se puede
 * abrir. PURA.
 *
 * Sin código traducible devuelve `null` y NO bloquea, igual que `esDeOtroEspejo`: una etiqueta que
 * no se puede clasificar no es motivo para dejar a alguien con el pallet en la mano y sin salida.
 */
export function avisoSiEsDeOtraBodega(
  claveTienda: string,
  codDeClave: (clave: string) => string | undefined,
  deOtraBodega?: (cod: string) => string | null,
): string | null {
  if (!deOtraBodega) return null;
  const cod = codDeClave(claveTienda);
  if (!cod) return null;
  return deOtraBodega(cod) ?? null;
}
