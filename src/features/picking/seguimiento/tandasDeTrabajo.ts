// Cuántas horas trabajó realmente una persona, sin contar dos veces la misma TANDA.
//
// ── EL PROBLEMA QUE ARREGLA ───────────────────────────────────────────────────────────────────
//
// En Odoo, a un picker no se le asigna un pedido: se le asigna una TANDA (un `stock.picking.batch`,
// «BATCH/54939»). Los pedidos de una tanda se le dan JUNTOS y se validan JUNTOS, así que los tres
// tienen la misma hora de asignación y casi la misma hora de término. Comprobado en Odoo el
// 13/11/2026:
//
//     BATCH/54939 · Pickers 6 · 3 pedidos
//       99REC/DT/120774   asignado 15-09 14:07   validado 15-09 15:26   → 1,3172 h
//       99REC/DT/120744   asignado 15-09 14:07   validado 15-09 15:26   → 1,3172 h
//       99REC/DT/120891   asignado 15-09 14:07   validado 15-09 15:26   → 1,3175 h
//
// Sumar la duración de cada pedido daba **3,95 h** por una tanda que duró **1,32 h**. La misma
// hora de trabajo se contaba tres veces. Medido sobre octubre completo, la inflación va de
// **1,66× a 3,9×**, y en la cuenta «Mario Patiño» —donde dos personas trabajan con el mismo
// usuario— llega a **10,06×**.
//
// Eso arrastraba a `avgMinutesPerOp`, a `avgSecondsPerLine` y sobre todo a `cph` (unidades por
// hora), que es la métrica del bono: con el tiempo inflado 1,7 veces, el ritmo salía 1,7 veces
// más bajo de lo real.
//
// ── DE DÓNDE SALE ESTA REGLA ──────────────────────────────────────────────────────────────────
//
// No se inventó acá. Es exactamente lo que hace la planilla con la que la jefatura calcula el
// bono —hoja «Tiempo Picking» del archivo «Abastecimiento por Olas»—, en su columna `Tiempo_R`:
//
//     =IF(H2=""; ""; IF(COUNTIF($H$2:H2; H2)=1; G2; 0))
//
// En castellano: la columna `H` es la tanda y la `G` su duración; el tiempo se cuenta **una sola
// vez por tanda**, en la primera fila donde esa tanda aparece, y las demás suman cero. Medido en
// esa hoja: 3.433 de 3.476 tandas tienen un único valor de duración en todas sus filas, y en
// 3.475 de 3.476 el `Tiempo_R` de la tanda es igual a su duración.
//
// Y la duración de la tanda en esa planilla es `max(validado) − min(asignado)` de sus pedidos:
// calza con Odoo a cuatro decimales en los tres casos verificados.
//
// ── POR QUÉ `max − min` Y NO LA DURACIÓN DE UN PEDIDO CUALQUIERA ──────────────────────────────
//
// Porque los pedidos de una tanda no terminan todos en el mismo segundo: en BATCH/54939 dos
// marcan 1,3172 h y el tercero 1,3175. Tomar «el primero» haría que el número dependiera del
// orden en que Odoo devolvió las filas. `max − min` es el lapso que la tanda ocupó de verdad y
// no depende del orden.
//
// ── Y EL SOLAPE ENTRE TANDAS, QUE ES LO QUE FALTABA ───────────────────────────────────────────
//
// Contar cada tanda una sola vez no alcanza, porque **las tandas de una persona se pisan entre
// sí**: se le asigna la siguiente mientras todavía está cerrando la anterior. Sumarlas cuenta dos
// veces el rato compartido. Medido del 1 al 16/11/2026, suma de tandas contra UNIÓN de sus lapsos:
//
//     cuenta                     tandas  se pisan   h suma   h unión   factor   h/día con la suma
//     Mario Patiño                  226       201    745,5      78,5    9,49×   46,6  ← imposible
//     Pickers 11 · Diego Farr       150       118    238,8      76,8    3,11×   14,9  ← imposible
//     Pickers 13 · V. Conejera      121        89    165,2      66,3    2,49×   10,3  ← imposible
//     Pickers 16 · C. Flores         60        25    139,9      71,0    1,97×    8,7
//     Pickers 6  · J. Mendoza        50        13     97,7      71,1    1,37×    6,1
//     Supervisor Web                 21         3     57,5      50,0    1,15×    3,6
//
// Las otras 24 de las 30 cuentas con trabajo quedan en 1,07× o menos — por eso la suma por tanda
// calzó con la planilla en la mayoría y esto quedó tapado. Y el ritmo cambia fuerte: Diego Farr
// pasa de 320 a 995 u/h, Mario Patiño de 56 a 528. Con la unión, **ninguna cuenta pasa de 6,1
// horas por día**; con la suma, tres superan las 24 que tiene el día.
//
// ── OJO: ESTO SEPARA LA PANTALLA DE LA PLANILLA DEL BONO ──────────────────────────────────────
//
// La planilla de la jefatura NO une los lapsos: su `Tiempo_R` des-duplica por tanda y después
// suma, así que arrastra la misma inflación. En su hoja «Bono Picking», bloque
// «Congelados- Chocolate» de octubre, Haisemberg Garmendia figura con **951,34 h** —31,7 por
// día— y su `Factor CPH` queda pegado al piso que la hoja fija en `$D$3`:
//
//     Factor CPH = MAX($D$3; MIN($D$2; CPH_Real / $F$1))   con $D$3 = 0,75
//
// Los cuatro del bloque quedan en 0,75. O sea que ahí el defecto no es cosmético: les calcula el
// bono contra el piso. Por eso este módulo devuelve también `minutosSumados` y `tandasSolapadas`:
// la pantalla tiene que poder DECIR en qué personas ya no coincide con la planilla, en vez de
// mostrar otro número en silencio.
//
// ── LO QUE SIGUE SIN RESOLVER ─────────────────────────────────────────────────────────────────
//
// En «Mario Patiño» trabajan DOS personas con el mismo usuario de Odoo —hoy Joe Idrovo y
// Haisemberg Garmendia; «Congelado 1» y «Congelado 2» son las dos filas con que la planilla los
// separa a mano, no dos cuentas de Odoo—. Ahí ninguno de los dos números son las horas de una
// persona: la suma las multiplica y la unión las junta en una sola. La unión es el reloj de la
// CUENTA. Separarlas de verdad pide un usuario de Odoo por persona.
//
// ── LO QUE NO TIENE TANDA ─────────────────────────────────────────────────────────────────────
//
// Un pedido sin `batch_id` es su propio lapso. Pero entra a la unión igual que una tanda: un
// pedido suelto trabajado en medio de una tanda es el mismo rato, no uno aparte.
//
// Puro y sin red: entran operaciones, salen minutos.

/** Las fechas llegan como el naive UTC de Odoo, o `false` cuando no están. */
export type FechaOdoo = string | false | null | undefined;

export interface OperacionConTanda {
  /** `batch_id` de Odoo, ya resuelto a texto. `null` = el pedido se trabajó suelto. */
  tanda: string | null;
  /** `user_assigned_date`: cuándo se le dio el trabajo a esta persona. */
  asignadoEn: FechaOdoo;
  /** `date_done`: cuándo lo validó. */
  validadoEn: FechaOdoo;
}

export interface MinutosTrabajados {
  /** Los minutos de RELOJ: cada tanda una vez y los lapsos que se pisan unidos. */
  minutos: number;
  /** Los mismos lapsos SUMADOS, sin unir — el número que da la planilla del bono.
   *
   *  No es el que se muestra. Está para poder comparar: cuando se separa de `minutos`, la
   *  pantalla ya no coincide con la hoja de la jefatura y eso tiene que poder decirse. */
  minutosSumados: number;
  /** Cuántos lapsos se pisaron con el anterior. Cero = `minutos` y `minutosSumados` son iguales. */
  tandasSolapadas: number;
  /** Operaciones que aportaron al tiempo (tenían las dos horas). Es el divisor de los promedios. */
  medidas: number;
  /** Operaciones con alguna hora faltante: no se pudieron medir y no se esconden. */
  sinMedir: number;
  /** Cuántas tandas distintas hubo. Una tanda con 3 pedidos es UN lapso de trabajo, no tres. */
  tandas: number;
}

/** El naive UTC de Odoo a milisegundos, o `null`. */
function enMs(f: FechaOdoo): number | null {
  if (!f || typeof f !== 'string') return null;
  const t = Date.parse(f.includes('T') ? f : f.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : null;
}

/**
 * Los minutos trabajados por UNA persona, contando cada tanda una sola vez.
 *
 * Se truncan los segundos al minuto, igual que `duracionMinutos`, para que el número no cambie
 * por un segundo de más al recargar.
 */
export function minutosTrabajados(ops: readonly OperacionConTanda[]): MinutosTrabajados {
  /** Por tanda: el asignado más temprano y el validado más tardío. */
  const porTanda = new Map<string, { desde: number; hasta: number }>();
  /** Cada pedido sin tanda es su propio lapso. */
  const sueltos: { desde: number; hasta: number }[] = [];
  let medidas = 0;
  let sinMedir = 0;

  for (const o of ops) {
    const a = enMs(o.asignadoEn), b = enMs(o.validadoEn);
    if (a === null || b === null || b < a) { sinMedir++; continue; }
    medidas++;
    const t = (o.tanda ?? '').trim();
    if (!t) { sueltos.push({ desde: a, hasta: b }); continue; }
    const v = porTanda.get(t);
    if (!v) porTanda.set(t, { desde: a, hasta: b });
    else { if (a < v.desde) v.desde = a; if (b > v.hasta) v.hasta = b; }
  }

  // Los minutos de un lapso, truncando los segundos igual que `duracionMinutos`: así el número
  // no cambia por un segundo de más al recargar. Se trunca al cerrar cada lapso UNIDO y no antes,
  // porque truncar los pedazos y sumarlos pierde hasta un minuto por pedazo.
  const enMinutos = (desde: number, hasta: number) =>
    Math.floor(hasta / 60000) - Math.floor(desde / 60000);

  // Todos los lapsos juntos, ordenados por su comienzo: es lo que permite recorrerlos una vez.
  const lapsos = [...porTanda.values(), ...sueltos].sort((x, y) => x.desde - y.desde);

  let minutos = 0;          // la unión: el reloj
  let minutosSumados = 0;   // los mismos lapsos sumados: lo que da la planilla
  let tandasSolapadas = 0;
  let desde: number | null = null;
  let hasta = 0;

  for (const l of lapsos) {
    minutosSumados += enMinutos(l.desde, l.hasta);
    if (desde === null) { desde = l.desde; hasta = l.hasta; continue; }
    if (l.desde <= hasta) {
      // Pisa al lapso abierto: es el mismo rato de trabajo, así que se estira, no se suma.
      tandasSolapadas++;
      if (l.hasta > hasta) hasta = l.hasta;
    } else {
      minutos += enMinutos(desde, hasta);
      desde = l.desde; hasta = l.hasta;
    }
  }
  if (desde !== null) minutos += enMinutos(desde, hasta);

  return { minutos, minutosSumados, tandasSolapadas, medidas, sinMedir, tandas: porTanda.size };
}
