// Del día de la planilla a las celdas de la hoja PICKING de «Abastecimiento por Olas».
// Módulo puro: sin red ni UI. Decide QUÉ se escribe y DÓNDE; no escribe nada.
//
// ── LA HOJA, MEDIDA EL 05/11/2026 ─────────────────────────────────────────────────────────────
//
// De sus 25 columnas, en un día ya cerrado solo se llenan cinco, y tres de ellas las pone quien
// arma el esqueleto antes del turno:
//
//     A  Fecha      número de serie de Sheets, no texto      ─┐
//     B  Tienda     SOLO en la primera fila de cada grupo     ├─ ya vienen puestas
//     C  Sección    'COMIDA' · 'ASEO ' · 'HOGAR' ·            │   (el esqueleto)
//                   'CHOCOLATES' · 'CONGELADOS'              ─┘
//     F  Pistolero  el nombre de la persona                  ─┐ esto es lo que
//     S  Usuario    la cuenta de Odoo («Pickers 18»)         ─┘ se registra
//
// D (Cantidad), E (SKU), las horas y el rendimiento están vacías SIEMPRE, también en días
// cerrados. T, U y X son fórmulas. Por eso este módulo solo produce celdas de F y de S.
//
// ── POR QUÉ EL PAR (S, F) ES DELICADO ─────────────────────────────────────────────────────────
//
//     Tiempo Picking!D  =XLOOKUP(CONCAT(fecha; cuenta); PICKING!T:T; PICKING!F:F; cuenta; 0; 1)
//     Bono Picking      SUMIFS sobre 'Tiempo Picking'!D, cruzando POR EL NOMBRE
//
// con PICKING!T = CONCATENATE(A; S). O sea: **S es la llave y F es lo que cobra**. Un nombre con
// una tilde de más en F no da error: el XLOOKUP devuelve el nombre, el SUMIFS no lo encuentra y
// ese bono queda en cero, en silencio.
//
// Por eso F NO sale de `display_name` sino de `nombre_olas`, que guarda el string exacto que la
// hoja espera (ver `sql/2026-11-06_nombre_olas.sql`). Una cuenta sin `nombre_olas` no se adivina:
// se salta y se informa.
//
// ── Y POR QUÉ S ES LA CUENTA CRUDA, AUNQUE EL NOMBRE SE HAYA CORREGIDO ────────────────────────
//
// Si el coordinador corrigió «la pistola era de Marcelo pero la usó Juliette», lo correcto es
// escribir S = «Pickers 7» (la cuenta, que es lo que va a traer Tiempo Picking) y F = Juliette.
// Eso es exactamente lo que la corrección significa: las unidades de esa pistola ese día son de
// Juliette. Por eso S nunca se corrige y F siempre sale del nombre que la planilla muestra.
//
// ── LO QUE NO HACE ────────────────────────────────────────────────────────────────────────────
//
// - **No crea filas.** Si no hay esqueleto para el día, no hay dónde escribir y se informa. Crear
//   filas al final duplicaría el día si alguien ya lo había armado más arriba, y el XLOOKUP se
//   queda con el primero que encuentra: el duplicado no daría error, daría un número mal.
// - **No pisa lo escrito.** Una celda que ya tiene algo distinto se informa y se deja. Puede ser
//   una corrección a mano hecha a propósito.
// - **No toca congelados.** Esa sección vive en otra pestaña de Picking y no está en esta
//   planilla; sus filas se dejan como están.

import type { MovimientoPlanilla, SeccionPlanilla } from './armarPlanilla';
import { SECCIONES_A_MANO } from './esqueletoOlas';
import { normalizar, parejasDeCelda, type Pareja } from './parejasCelda';

// `normalizar` vive en `parejasCelda` desde el 21/11/2026 —el esqueleto la necesita y no puede
// importarla de acá sin armar un ciclo entre los dos módulos— y se reexporta para que nada de lo
// que la importa desde este archivo tenga que cambiar.
export { normalizar };

/** Una fila del bloque del día en la hoja, tal como se leyó. */
export interface FilaHoja {
  /** El número de fila en la hoja (1-based), que es a dónde se escribe. */
  fila: number;
  /** Columna B. Viene vacía en todas menos la primera de cada grupo de tienda. */
  tienda: string;
  /** Columna C, tal cual: puede traer espacio al final («ASEO »). */
  seccion: string;
  /** Columna F, lo que ya hubiera. */
  pistolero: string;
  /** Columna S, lo que ya hubiera. */
  usuario: string;
}

/** Una celda a escribir. */
export interface Escritura {
  fila: number;
  /** 'F' (Pistolero) o 'S' (Usuario). Nunca otra: ver la cabecera. */
  columna: 'F' | 'S';
  valor: string;
}

/** Algo que el registro no pudo o no quiso hacer. Todo lo que no se escribe sale acá. */
export interface Aviso {
  tipo: 'sin-nombre-olas' | 'sin-fila' | 'ya-escrita' | 'pickers-distintos' | 'fila-sin-dato'
      | 'chocolates-no-calza' | 'sin-fila-libre';
  detalle: string;
}

export interface PlanRegistro {
  escrituras: Escritura[];
  avisos: Aviso[];
  /** Cuántas filas del bloque quedan listas para escribir. */
  filasAEscribir: number;
}

/** Las secciones de la planilla que tienen fila por tienda en la hoja. */
const POR_TIENDA: SeccionPlanilla[] = ['Comida', 'Aseo', 'Hogar'];

/**
 * Las secciones que la hoja tiene y este registro NO llena, normalizadas.
 *
 * Sale de `esqueletoOlas` a propósito: ahí se decide qué filas se CREAN y con qué grafía, y acá
 * qué filas se SALTEAN. Si fueran dos listas, agregar una fila al esqueleto sin acordarse de esta
 * la volvería una «sección desconocida» con aviso falso en cada registro — que es exactamente lo
 * que venía pasando con «Fala full» todos los lunes.
 */
const A_MANO = new Set(SECCIONES_A_MANO.map(normalizar));

/**
 * Qué tienda le corresponde a cada fila del bloque.
 *
 * La hoja pone el código SOLO en la primera fila de cada grupo y deja las siguientes en blanco;
 * la columna U hace lo mismo con su fórmula (`IF(B<>""; …; U_de_arriba)`). Sin arrastrarlo, las
 * filas de Aseo y Hogar no calzarían con ninguna tienda y no se escribiría nada en ellas.
 *
 * Las filas de CHOCOLATES y CONGELADOS no llevan tienda y tampoco heredan: son del día entero.
 * Si heredaran la última tienda vista, el chocolate del día se escribiría como si fuera de esa
 * tienda. La de Falabella Full entra en la misma regla por la misma razón, y por eso el salteo
 * sale de `A_MANO` y no de dos nombres escritos a mano.
 */
export function tiendaDeCadaFila(filas: FilaHoja[]): Map<number, string> {
  const m = new Map<number, string>();
  let actual = '';
  for (const f of filas) {
    if (f.tienda.trim()) actual = f.tienda.trim();
    const sec = normalizar(f.seccion);
    if (sec === 'CHOCOLATES' || A_MANO.has(sec)) continue;
    m.set(f.fila, actual);
  }
  return m;
}

/** El nombre que va en F para una persona, o `null` si esa persona no tiene uno conocido. */
function nombreOlas(persona: string, porPersona: ReadonlyMap<string, string>): string | null {
  if (!persona.trim()) return null;
  const directo = porPersona.get(persona);
  if (directo !== undefined) return directo;
  // Por normalizado: la corrección a mano guarda el display_name tal cual lo eligió el
  // coordinador, y una tilde de diferencia no puede costar una fila sin registrar.
  for (const [k, v] of porPersona) if (normalizar(k) === normalizar(persona)) return v;
  return null;
}

/** Un par con el nombre que le toca en esta planilla, o `null` si esa persona no tiene uno. */
type ParConNombre = Pareja & { nombre: string | null };

/**
 * Si lo que una fila ya tiene escrito corresponde a ese par.
 *
 * Una fila a medio llenar —solo el nombre, o solo la cuenta— corresponde al par que coincide en lo
 * que tiene. A un par sin nombre para la planilla no se le puede comparar el nombre de la hoja:
 * se lo reconoce por la cuenta, o por su nombre del sistema si alguien lo escribió a mano.
 */
function calza(f: FilaHoja, p: ParConNombre): boolean {
  const yaF = f.pistolero.trim(), yaS = f.usuario.trim();
  if (p.nombre === null) {
    return yaS
      ? !!p.cuenta && normalizar(yaS) === normalizar(p.cuenta)
      : normalizar(yaF) === normalizar(p.persona);
  }
  const okF = !yaF || normalizar(yaF) === normalizar(p.nombre);
  const okS = !yaS || !p.cuenta || normalizar(yaS) === normalizar(p.cuenta);
  return okF && okS;
}

/**
 * El plan de escritura para un día.
 *
 * `movimientos` son los de la planilla ya corregidos (los que la pantalla muestra).
 * `filas` es el bloque del día tal como está hoy en la hoja.
 * `nombrePorPersona` es `display_name → nombre_olas`.
 */
export function planRegistro(
  movimientos: MovimientoPlanilla[],
  filas: FilaHoja[],
  nombrePorPersona: ReadonlyMap<string, string>,
): PlanRegistro {
  const escrituras: Escritura[] = [];
  const avisos: Aviso[] = [];
  const porFila = tiendaDeCadaFila(filas);
  const tocadas = new Set<number>();

  /** Escribe lo que le falta a una fila para ese par. Devuelve si escribió algo. */
  const completar = (f: FilaHoja, p: ParConNombre): boolean => {
    if (p.nombre === null) return false;
    let algo = false;
    if (!f.pistolero.trim()) { escrituras.push({ fila: f.fila, columna: 'F', valor: p.nombre }); algo = true; }
    if (!f.usuario.trim() && p.cuenta) { escrituras.push({ fila: f.fila, columna: 'S', valor: p.cuenta }); algo = true; }
    return algo;
  };

  // ── Las filas por tienda: COMIDA, ASEO, HOGAR, celda por celda ──
  //
  // Desde el 21/11/2026 una celda (tienda × sección) puede tener VARIAS filas: el esqueleto arma
  // una por cada par persona-cuenta que la hizo (ver `parejasCelda.ts`). Por eso ya no se recorre
  // fila por fila sino celda por celda: primero se juntan las filas de cada celda, y después sus
  // pares se reparten entre ellas.
  const celdas = new Map<string, { cod: string; seccion: SeccionPlanilla; filas: FilaHoja[] }>();
  for (const f of filas) {
    const sec = normalizar(f.seccion);
    if (sec === 'CHOCOLATES' || A_MANO.has(sec)) continue;
    const seccion = POR_TIENDA.find(s => normalizar(s) === sec);
    if (!seccion) {
      if (sec) avisos.push({ tipo: 'fila-sin-dato', detalle: `Fila ${f.fila}: sección «${f.seccion}» desconocida` });
      continue;
    }
    const cod = porFila.get(f.fila) ?? '';
    if (!cod) {
      avisos.push({ tipo: 'fila-sin-dato', detalle: `Fila ${f.fila}: ninguna tienda antes de esta fila` });
      continue;
    }
    const k = `${normalizar(cod)}|${seccion}`;
    const c = celdas.get(k) ?? { cod, seccion, filas: [] };
    c.filas.push(f);
    celdas.set(k, c);
  }

  for (const { cod, seccion, filas: suyas } of celdas.values()) {
    const parejas = parejasDeCelda(movimientos, cod, seccion);
    if (parejas.length === 0) continue;   // sin carga o sin asignar: se deja vacía, como hoy

    // Más pares que filas. Pasa en un día armado antes del 21/11/2026 —tres filas fijas— o si
    // alguien se sumó a la sección después de armado el bloque. Ahí sigue valiendo la regla de
    // siempre: los pares no caben, y elegir cuál se escribe sería decidir a quién se le abona. Se
    // informa y la celda entera queda a mano.
    if (parejas.length > suyas.length) {
      const quienes = [...new Set(parejas.map(p => p.persona))];
      avisos.push({ tipo: 'pickers-distintos',
        detalle: `${cod} ${seccion}: ${quienes.join(' y ')} en la misma celda, y la hoja tiene ` +
                 `${suyas.length} ${suyas.length === 1 ? 'fila' : 'filas'} para esa sección — se deja a mano` });
      continue;
    }

    const conNombre: ParConNombre[] = parejas.map(p =>
      ({ ...p, nombre: nombreOlas(p.persona, nombrePorPersona) }));
    for (const p of conNombre) {
      if (p.nombre !== null) continue;
      avisos.push({ tipo: 'sin-nombre-olas',
        detalle: `${cod} ${seccion}: «${p.persona}» no tiene nombre para esta planilla` });
    }

    // 1. Las filas que ya tienen algo se reconocen PRIMERO. Así registrar dos veces no mueve a
    //    nadie de fila aunque entre una vez y otra haya cambiado quién hizo más, y una fila que
    //    alguien completó a mano con uno de los pares no se toma como libre.
    const pendientes = [...conNombre];
    const libres: FilaHoja[] = [];
    for (const f of suyas) {
      const yaF = f.pistolero.trim(), yaS = f.usuario.trim();
      if (!yaF && !yaS) { libres.push(f); continue; }
      const i = pendientes.findIndex(p => calza(f, p));
      if (i < 0) {
        avisos.push({ tipo: 'ya-escrita',
          detalle: `Fila ${f.fila} (${cod} ${seccion}): ya dice «${yaF}»/«${yaS}» — no se tocó` });
        continue;
      }
      const [p] = pendientes.splice(i, 1);
      if (completar(f, p)) tocadas.add(f.fila);
    }

    // 2. Los pares que quedan van a las filas libres, del que más trabajó al que menos. Uno sin
    //    nombre para la planilla ya está avisado y no toma fila: la que sobre queda para
    //    completarlo a mano.
    for (const p of pendientes) {
      if (p.nombre === null) continue;
      const f = libres.shift();
      if (!f) {
        // Solo pasa si una fila de la celda ya tenía escrito a otra persona: ese aviso dice qué
        // fila no se tocó, y este dice a quién le faltó lugar.
        avisos.push({ tipo: 'sin-fila-libre',
          detalle: `${cod} ${seccion}: «${p.persona}» queda sin escribir — no hay fila libre` });
        continue;
      }
      if (completar(f, p)) tocadas.add(f.fila);
    }
  }

  // ── Las filas de CHOCOLATES: una por persona, sin tienda, del día entero ──
  const filasChoc = filas.filter(f => normalizar(f.seccion) === 'CHOCOLATES');
  if (filasChoc.length > 0) {
    // Por cantidad de registros, de mayor a menor: así el orden no depende de en qué tienda
    // apareció primero cada uno, que cambia de un día a otro.
    const porPersona = new Map<string, { registros: number; cuenta: string }>();
    for (const m of movimientos) {
      if (m.seccion !== 'Chocolates') continue;
      if (m.estado !== 'done' && m.estado !== 'assigned') continue;
      const p = (m.picker ?? '').trim();
      if (!p) continue;
      const a = porPersona.get(p) ?? { registros: 0, cuenta: (m.cuenta ?? '').trim() };
      a.registros += m.registros;
      porPersona.set(p, a);
    }
    const gente = [...porPersona].sort((a, b) =>
      b[1].registros - a[1].registros || a[0].localeCompare(b[0]));

    if (gente.length > filasChoc.length) {
      avisos.push({ tipo: 'chocolates-no-calza',
        detalle: `${gente.length} personas hicieron chocolates y la hoja tiene ${filasChoc.length} ` +
                 `${filasChoc.length === 1 ? 'fila' : 'filas'}: se escriben las primeras por volumen` });
    }

    gente.slice(0, filasChoc.length).forEach(([persona, dato], i) => {
      const f = filasChoc[i];
      const nombre = nombreOlas(persona, nombrePorPersona);
      if (nombre === null) {
        avisos.push({ tipo: 'sin-nombre-olas',
          detalle: `Chocolates: «${persona}» no tiene nombre para esta planilla` });
        return;
      }
      const yaF = f.pistolero.trim(), yaS = f.usuario.trim();
      if ((yaF && normalizar(yaF) !== normalizar(nombre)) ||
          (yaS && dato.cuenta && normalizar(yaS) !== normalizar(dato.cuenta))) {
        avisos.push({ tipo: 'ya-escrita',
          detalle: `Fila ${f.fila} (Chocolates): ya dice «${yaF}»/«${yaS}» — no se tocó` });
        return;
      }
      if (yaF && yaS) return;
      if (!yaF) escrituras.push({ fila: f.fila, columna: 'F', valor: nombre });
      if (!yaS && dato.cuenta) escrituras.push({ fila: f.fila, columna: 'S', valor: dato.cuenta });
      tocadas.add(f.fila);
    });
  }

  // Las tiendas de la planilla que no tienen su fila en la hoja: el esqueleto se armó antes y
  // quedó corto, y sin avisar nadie notaría que esa tienda no quedó registrada.
  const enHoja = new Set([...porFila.values()].map(normalizar));
  const conTrabajo = new Set(movimientos
    .filter(m => (m.estado === 'done' || m.estado === 'assigned') &&
                 POR_TIENDA.includes(m.seccion) && (m.picker ?? '').trim())
    .map(m => normalizar(m.cod)));
  for (const cod of conTrabajo) {
    if (!enHoja.has(cod)) {
      avisos.push({ tipo: 'sin-fila', detalle: `${cod} tiene trabajo del día y no tiene fila en la hoja` });
    }
  }

  // En orden de fila. Las de una celda salen primero las reconocidas y después las libres, y la
  // vista previa mostraría la fila 12 antes que la 11; para la API el orden da igual.
  escrituras.sort((a, b) => a.fila - b.fila || a.columna.localeCompare(b.columna));

  return { escrituras, avisos, filasAEscribir: tocadas.size };
}

// ── LA FECHA DE LA HOJA ES UN NÚMERO, NO UN TEXTO ─────────────────────────────────────────────
//
// La columna A guarda el serial de Sheets: días desde el 30/12/1899. El 05/11/2026 es 46331.
// Importa por dos motivos:
//
// 1. Es con lo que se ENCUENTRA el bloque del día. Buscar por el texto «05/11/2026» no sirve:
//    la celda no contiene texto.
// 2. `PICKING!T = CONCATENATE(A; S)` concatena ese número, y del otro lado `Tiempo Picking`
//    hace `CONCAT(B; C)` con su propio serial. Si uno de los dos no es el serial correcto, el
//    XLOOKUP no encuentra y las unidades del día no se le abonan a nadie.
//
// Eso último no es hipotético: medido el 06/11/2026, las 85 filas del día traían el serial
// −619871, que es el 06/11 del año **0202** — alguien tipeó «0202» por «2026». Ese bloque no lo
// va a encontrar ni esta función ni el XLOOKUP del bono.

/** Días entre el 30/12/1899 (serial 0 de Sheets) y la época de JavaScript. */
const EPOCA_SHEETS = Date.UTC(1899, 11, 30);
const UN_DIA = 86_400_000;

/** El serial de Sheets para una fecha `YYYY-MM-DD`. UTC a mediodía no hace falta: son días enteros. */
export function serialDeFecha(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, d) - EPOCA_SHEETS) / UN_DIA);
}

/** La fecha `YYYY-MM-DD` de un serial, o `null` si el serial no es una fecha razonable. */
export function fechaDeSerial(n: number): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 80_000) return null;
  return new Date(EPOCA_SHEETS + n * UN_DIA).toISOString().slice(0, 10);
}
