// La ESPECIALIDAD de un movimiento: seco, chocolates o congelados.
//
// ── POR QUÉ SE MIDE Y NO SE DECLARA ───────────────────────────────────────────────────────────
//
// Mezclar las tres en un solo número hace injusticia en las dos direcciones. Medido del 1 al 16
// de noviembre de 2026:
//
//     Christian Flores · en SECO ........ 47 ops ·  40.721 u ·  56,1 h ·  726 u/h
//     Christian Flores · en CONGELADOS .. 29 ops ·   4.063 u ·  78,4 h ·   52 u/h
//     Christian Flores · todo junto .............................. 332 u/h
//
// Congelados es ~14 veces más lento por unidad: cámara, peso, guantes. Ese 332 no es ni una cosa
// ni la otra y lo hace parecer lento. Y Mario Patiño —los especialistas, que hacen congelados
// todos los días— da 56 u/h: o sea que Flores rinde prácticamente igual que ellos cuando cubre.
// Eso solo se ve comparando congelados contra congelados.
//
// **Y se mide en vez de declararse porque si fuera una etiqueta, alguien tendría que acordarse
// de mover a Flores cada vez que cubre.** No iba a pasar. Saliendo del trabajo, el día que cubre
// aparece y el día que no, no.
//
// ── EL TIEMPO SE PUEDE PARTIR, Y ESTÁ COMPROBADO ─────────────────────────────────────────────
//
// Una tanda podría mezclar categorías y entonces repartir sus horas sería inventar. No pasa:
// medido sobre las **2.294 tandas** del mes, **ninguna** mezcló especialidades. Las 2.294 son de
// una sola. Por eso filtrar por especialidad puede mostrar también las horas y el ritmo, no solo
// el volumen.
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────────────────────────
//
// Del `origin` de Odoo, que es el mismo texto del que ya salen la tienda y la sección en la
// planilla: «Abastecimiento Congelados 58TAM 01/10/2026». Se acepta «Apertura» en el medio y el
// singular «Chocolate», que la hoja también usa.
//
// Lo que no calza con ninguna categoría cae en `seco` A PROPÓSITO: los «Agregado», «Pack» y
// «Solicitud de tienda» son abastecimiento normal de seco con el origen escrito a mano, y son
// 179 movimientos del mes. Mandarlos a un cuarto grupo «otro» los sacaría de la vista de todos.

export type Especialidad = 'seco' | 'chocolates' | 'congelados';

const CATEGORIA = /Abastecimiento\s+(?:Apertura\s+)?(Comida|Aseo|Hogar|Chocolates?|Congelados)/i;

export const ESPECIALIDADES: readonly Especialidad[] = ['seco', 'chocolates', 'congelados'];

/** Cómo se llama cada una en pantalla. */
export const NOMBRE_ESPECIALIDAD: Record<Especialidad, string> = {
  seco: 'Seco', chocolates: 'Chocolates', congelados: 'Congelados',
};

/** La especialidad de un movimiento. Lo que no calza es seco — ver la cabecera. */
export function especialidadDeOrigin(origin: string | null | undefined): Especialidad {
  const c = CATEGORIA.exec(String(origin ?? ''))?.[1] ?? '';
  if (/^Chocolate/i.test(c)) return 'chocolates';
  if (/^Congelados/i.test(c)) return 'congelados';
  return 'seco';
}
