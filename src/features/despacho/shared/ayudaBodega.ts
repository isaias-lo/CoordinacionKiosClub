// Los textos de los «?» de Bodega, iguales en Nacional y RM/Costa. Puro: se prueba.
//
// Existe por el análisis del 22/10/2026 («Bodega vista por alguien nuevo»): «Com / Hog / Ase / Cho
// / ⋯», «#74», «UNIFICADO · 2 EN 1» y la casilla de los bultos no se explicaban en ninguna
// parte. Picking ya tenía sus «?» (`picking/marco/ayudaContexto.ts`); Bodega
// no tenía ninguno. Cada línea dice lo que pasa, no cómo se llama el botón.

export interface AyudaBodega { titulo: string; lineas: string[] }

export const AYUDAS_BODEGA = {
  tipoCarga: {
    titulo: 'Tipo de carga',
    lineas: [
      'Com es comida, Hog es hogar, Ase es aseo y Cho es chocolate. «⋯» abre las mezclas, como Comida · Aseo.',
      'Si la unidad la armó Picking, el tipo viene de su etiqueta y no se cambia acá (el candado).',
      'Al unir dos pallets, el tipo pasa a ser la mezcla de los dos.',
    ],
  },
  pesados: {
    titulo: 'Las unidades pesadas',
    lineas: [
      '#74 es el número de la unidad. Escríbelo en el buscador de arriba para encontrarla.',
      '«Unificado · 2 en 1»: dos pallets quedaron como uno solo, con el peso de los dos.',
      '«+2 CH»: a ese pallet se le sumaron 2 chocolates, que van dentro. Por eso el conteo de chocolates baja.',
      'El ✎ abre Editar, Eliminar y «Juntar con…».',
    ],
  },
  juntar: {
    titulo: 'Juntar unidades',
    lineas: [
      '«Queda dentro»: un bulto o chocolate se suma a un pallet. Su peso pasa al pallet y deja de ser una unidad aparte.',
      '«Quedan como uno»: dos pallets se unen en uno, con el peso de los dos.',
      'Después el pallet se abre para confirmar la altura, porque la carga creció.',
      'Si te equivocaste, toca Deshacer en el aviso de abajo. Dura 7 segundos.',
    ],
  },
  sumarMarcados: {
    titulo: 'Sumar varios a un pallet',
    lineas: [
      'Marca los bultos y chocolates que van dentro de un mismo pallet y toca ese pallet en «Sumar a».',
      'Su peso pasa al pallet y dejan de contarse aparte.',
      'Un pallet con borde punteado todavía no está agregado: después de sumar, acuérdate de agregarlo.',
    ],
  },
} satisfies Record<string, AyudaBodega>;

export type TemaAyudaBodega = keyof typeof AYUDAS_BODEGA;
