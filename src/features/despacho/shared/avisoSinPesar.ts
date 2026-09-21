// El aviso de "hay unidades sin pesar" en la tarjeta de la grilla de Bodega. Puro.
//
// El dato ya se calculaba —`items.filter(esSinPesar).length`— pero solo DENTRO de la tienda
// abierta, y solo para advertir al marcarla como Terminada. Desde la grilla no se veía, así que
// para saber si a una tienda le faltaba pesar algo había que entrar tienda por tienda.
//
// El caso que importa es el que se ve peor: una tienda marcada TERMINADA que todavía tiene
// unidades sin pesar. Terminada y completa parecen lo mismo desde afuera, y no lo son.
//
// ── Por qué la marca va en la esquina INFERIOR izquierda ──────────────────────────────────────
//
// El diseño la puso arriba a la izquierda, pero esa esquina está ocupada: `PresenciaBadge` se
// apoya ahí (`-top-1.5 -left-1.5`, un avatar de 18 px con `z-10`) y taparía casi la mitad. Y no
// es una colisión rara: la presencia aparece justo cuando otra persona tiene la tienda abierta,
// que es el momento en que más importa ver lo que falta.
//
// Las otras esquinas tampoco estaban libres: arriba a la derecha vive el botón +/× del
// calendario, y el borde de abajo lo cruza `StoreProgressBar` a lo ancho. Queda la esquina
// inferior izquierda, por debajo de la barra: 15 px de alto entran en el padding de la tarjeta
// sin empujar nada.

export interface AvisoSinPesar {
  /** Lo que se dibuja en la marca. Un número, o `9+` cuando no entra. */
  texto: string;
  /** El texto accesible, en palabras. La marca sola no se explica. */
  titulo: string;
}

/** A partir de cuánto se abrevia: dos cifras no entran legibles en una marca de esquina. */
export const TOPE_VISIBLE = 9;

/**
 * El aviso de una tienda, o `null` si no hay nada que avisar.
 *
 * Devolver `null` —en vez de un objeto con `mostrar: false`— es a propósito: quien llama no puede
 * dibujar la marca por accidente cuando no corresponde.
 */
export function avisoSinPesar(sinPesar: number): AvisoSinPesar | null {
  const n = Math.floor(sinPesar);
  if (!Number.isFinite(n) || n <= 0) return null;
  return {
    texto: n > TOPE_VISIBLE ? `${TOPE_VISIBLE}+` : String(n),
    titulo: n === 1 ? '1 unidad sin pesar' : `${n} unidades sin pesar`,
  };
}
