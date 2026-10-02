// La suma de kilos de Bodega por tienda, PURA.
//
// Vive acá y no en `lib/crucePesosDia.ts` porque la usan DOS caminos: el registro del día (la app,
// vía `pesosDeBodega`) y el cargador de días pasados (`scripts/cargar-cruce-pesos.mts`). Hasta el
// 02/10/2026 el cargador tenía su PROPIA suma —sin deduplicar nada, ni las copias exactas— así que
// cargar un día daba un número distinto al de registrarlo, y nadie lo habría notado hasta comparar
// dos filas a mano. Es justo el riesgo que los comentarios de `crucePesosDia` ya advertían.
//
// Sin dependencias del servidor a propósito: así el cargador la importa con una ruta relativa y
// los tests no arrastran el cliente de Supabase.

import { esAgregado } from './adquisicion';
import { TOPE_DURO_KG } from './pesoIngresado';
import { claseDeTipoCode } from './tipoCode';

export interface FilaDePeso {
  cod: string | null;
  peso_kg: number | null;
  tipo: string | null;
  /** La unidad de Picking detrás de la fila. `null` en las que no tienen vínculo. */
  picking_slot_id?: number | null;
}

/**
 * Suma por tienda, **contando cada unidad física UNA sola vez y con UN solo peso**.
 *
 * ── EL CASO DEL 30/09/2026: COPIAS EXACTAS ─────────────────────────────────────────────────────
 *
 * Cada unidad de RM terminó con DOS filas pesadas —una con el sello del armado y otra con el del
 * despacho—, mismo peso y mismo slot. 71 filas en 19 tiendas, 12.622,8 kg de más. La hoja todavía
 * mostraba lo bueno porque se había escrito antes, pero la siguiente carga habría puesto el doble.
 *
 * ── EL CASO DEL 01/10/2026: LA MISMA UNIDAD CON DOS PESOS ──────────────────────────────────────
 *
 * Siete tiendas de Nacional se trabajaron también en RM/Costa (#654 cerró esa puerta). Cada espejo
 * registró su propia foto del mismo pallet, con su propio sello, y acá se sumaban las dos porque
 * la llave era `slot:peso` — o sea que dos LECTURAS de una unidad contaban como dos UNIDADES.
 * Resultado en la planilla que mira Jefatura: +1.115,1 kg en 4 tiendas y porcentajes inventados,
 * 28TEM con +88,0% cuando lo real era −0,5%.
 *
 * La versión anterior lo dejaba pasar a propósito, y lo decía así: *"no hay forma de saber cuál
 * vale sin mirar la balanza"*. El razonamiento estaba bien; la premisa, no. **La balanza se puede
 * mirar**: cada fila trae su `picking_slot_id`, que es exactamente la llave de `picking_pallets`.
 *
 * ── LAS DOS REGLAS QUE QUEDAN ──────────────────────────────────────────────────────────────────
 *
 * 1. Una unidad con slot se cuenta UNA vez. La llave es el slot, nunca el slot MÁS el peso: una
 *    unidad física no se convierte en dos porque alguien la haya leído dos veces.
 *
 * 0. Y antes que nada: una fila SIN peso es un borrador —la del armado nace en 0— así que no
 *    participa. La balanza resuelve el peso de una pesada; no convierte un borrador en una.
 *
 * 2. Su peso sale de `pesoDeSlot` —la balanza— cuando lo hay. Si no, del MAYOR de los que digan
 *    sus filas. El mayor y no el primero, porque el peso de un pallet solo CRECE: los chocolates
 *    se le suman encima, así que una foto vieja siempre tiene menos. Medido sobre los 4 casos
 *    reales del 01/10, el mayor coincidió con la balanza en los cuatro.
 *
 * Y de paso esto arregla un segundo defecto sin tocarlo: el registro escribe la foto del estado
 * del navegador, que puede estar atrasada. El 01/10 eso dejó 94,45 kg afuera de la hoja —33CON
 * perdió 47,75, exactamente la suma que otra persona había hecho a las 13:54:56—. Leyendo la
 * balanza, el cruce ya no depende de cuán al día estuviera el navegador que apretó REGISTRAR.
 *
 * Los desacuerdos no se resuelven en SILENCIO: `conflictosDePeso` los lista y `pesosDeBodega` los
 * escribe en el log.
 *
 * Una fila SIN slot no se puede deduplicar —no hay con qué saber si es la misma unidad— así que
 * entra tal cual. Perder carga real sería peor que contar de más.
 */
export function sumarPesosPorTienda(
  filas: readonly FilaDePeso[],
  pesoDeSlot?: ReadonlyMap<number, number>,
): Map<string, number> {
  const pesos = new Map<string, number>();
  const porSlot = new Map<number, { cod: string; pesos: number[] }>();

  for (const f of filas) {
    const cod = String(f.cod ?? '').toUpperCase().trim();
    if (!cod) continue;
    // LOS AGREGADOS NO ENTRAN AL CRUCE.
    //
    // Este cuadro compara lo que Odoo despachó como ABASTECIMIENTO contra lo que Bodega pesó de
    // ese mismo abastecimiento. Una adquisición es una compra y un web/retiro es un pedido que el
    // cliente pasa a buscar: ninguno de los dos existe del lado de Odoo, así que sumarlos al
    // TOTAL BODEGA inflaría ese lado y la tienda aparecería con un excedente que no es real.
    //
    // Se descartan por TIPO y no por peso: hoy llegan en 0 —no se pesan—, pero el día que alguien
    // le ponga un peso a uno, tiene que seguir quedando afuera. Filtrar por "peso 0" habría
    // funcionado hasta ese día y fallado justo cuando el dato empezara a existir.
    if (esAgregado(f.tipo)) continue;
    const kg = Number(f.peso_kg) || 0;
    if (f.picking_slot_id == null) {
      pesos.set(cod, (pesos.get(cod) ?? 0) + kg);   // sin slot: no hay cómo deduplicar
      continue;
    }
    // UNA FILA SIN PESO ES UN BORRADOR, NO UNA PESADA.
    //
    // Cada unidad tiene normalmente DOS filas: la del armado, que nace en 0, y la del registro.
    // Si el 0 pudiera tomar el peso de la balanza, las dos filas contarían y el día se duplicaría
    // — medido: 01TPS del 29/09 pasaba de 1.073 a 2.176,8 kg.
    //
    // Y hay una razón más de fondo: este cuadro existe para ENCONTRAR LO QUE NO SE REGISTRÓ. Si
    // una unidad pesada pero nunca registrada sumara igual, la tienda cuadraría sola y el hueco
    // se volvería invisible. La balanza acá RESUELVE el peso de una pesada; no convierte un
    // borrador en una.
    if (kg <= 0) continue;
    const g = porSlot.get(f.picking_slot_id) ?? { cod, pesos: [] };
    g.pesos.push(kg);
    porSlot.set(f.picking_slot_id, g);
  }

  // Segunda pasada: un peso por unidad. Hace falta recorrer el grupo completo antes de elegir —
  // decidir en la primera fila se quedaría con la que llegó antes, que no es la que vale.
  for (const [slot, g] of porSlot) {
    const deLaBalanza = pesoDeSlot?.get(slot) ?? 0;
    const kg = deLaBalanza > 0 ? deLaBalanza : Math.max(...g.pesos);
    pesos.set(g.cod, (pesos.get(g.cod) ?? 0) + kg);
  }
  return pesos;
}

/** Una unidad cuyas filas registradas no se ponen de acuerdo en el peso. */
export interface ConflictoDePeso { slot: number; cod: string; pesos: number[] }

/**
 * Las unidades con filas que dicen pesos distintos. PURA, para poder probarla y para poder
 * AVISARLO en vez de resolverlo en silencio.
 *
 * LOS CEROS NO CUENTAN como un peso que discrepe. Cada unidad tiene normalmente DOS filas: la del
 * armado, en 0, y la del registro, con el peso — ese par es el diseño, no un desacuerdo. Contarlo
 * hacía que un día normal escupiera un aviso por unidad («217 / 0»), y un aviso que sale siempre
 * es un aviso que nadie lee. Un conflicto de verdad es que DOS BALANZAS digan cosas distintas.
 */
export function conflictosDePeso(filas: readonly FilaDePeso[]): ConflictoDePeso[] {
  const porSlot = new Map<number, { cod: string; pesos: Set<number> }>();
  for (const f of filas) {
    const cod = String(f.cod ?? '').toUpperCase().trim();
    if (!cod || esAgregado(f.tipo) || f.picking_slot_id == null) continue;
    const kg = Number(f.peso_kg) || 0;
    if (kg <= 0) continue;
    const g = porSlot.get(f.picking_slot_id) ?? { cod, pesos: new Set<number>() };
    g.pesos.add(kg);
    porSlot.set(f.picking_slot_id, g);
  }
  return [...porSlot.entries()]
    .filter(([, g]) => g.pesos.size > 1)
    .map(([slot, g]) => ({ slot, cod: g.cod, pesos: [...g.pesos].sort((a, b) => b - a) }));
}

/**
 * El peso de la balanza, o 0 si no es creíble.
 *
 * ── POR QUÉ UNA FUENTE AUTORITATIVA NECESITA UN TECHO ──────────────────────────────────────────
 *
 * Desde que el cruce resuelve el peso acá, `picking_pallets` manda sobre lo que lee Jefatura, sin
 * que nadie lo revise en el medio. Un tipeo pasa derecho.
 *
 * No es hipotético: el slot 132 —el P1 de 55ITA del 28/09— tiene **9.357,5 kg**, el incidente de
 * la coma del #608. Odoo dice que esa tienda recibió 606,28 kg en TODO el día. La fila registrada
 * sí se corrigió a 335,7 por decisión del coordinador; el slot nunca. Leyendo la balanza a ciegas,
 * 55ITA habría vuelto a la planilla con 9.594,4 kg.
 *
 * El tope es el MISMO `TOPE_DURO_KG` que el campo de peso usa desde el #608 —medido sobre 7.194
 * pesos reales— así que no se inventa un número nuevo: lo que la pantalla no deja escribir, esto
 * no lo deja publicar. Por encima del techo manda la fila registrada, que es lo que una persona
 * revisó.
 *
 * Es UN solo slot en toda la base, verificado. El techo no está para los que hay: está para que
 * el que venga no llegue a la hoja.
 */
export function pesoCreible(peso: number | null, tipoCode: string | null, slot?: number): number {
  const kg = Number(peso) || 0;
  if (kg <= 0) return 0;
  const tope = TOPE_DURO_KG[claseDeTipoCode(tipoCode)];
  if (kg > tope) {
    console.warn(`[cruce] unidad ${slot ?? '?'}: la balanza dice ${kg} kg, sobre el techo de ${tope} para ${tipoCode} → se usa lo registrado`);
    return 0;
  }
  return kg;
}
