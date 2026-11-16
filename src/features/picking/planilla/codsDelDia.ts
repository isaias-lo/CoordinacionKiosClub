// Las tiendas de un día, en el orden en que van en la hoja de olas. Puro y testeable.
//
// ── PARA QUÉ ──────────────────────────────────────────────────────────────────────────────────
//
// La planilla de Picking trabajaba solo con HOY: su lista de tiendas llega como prop desde
// `PickingScreen`, que la arma del calendario de hoy. Cuando un día no se registra —el viernes
// 13/11/2026 quedó sin registrar, con 135 movimientos y 31 tiendas— no había cómo volver a él:
// la pantalla tenía la fecha clavada y la lista era la de hoy.
//
// Esto arma la lista de CUALQUIER día a partir del calendario semanal, que es una plantilla por
// día de la semana (LU, MA, MI, JU, VI, SA, DO) y por eso sirve igual para el pasado.
//
// ── EL ORDEN IMPORTA, Y NO ES ALFABÉTICO ──────────────────────────────────────────────────────
//
// Es `fal` (Regiones), después `costa`, después `rm` — el mismo que usa `PickingScreen` para hoy
// y el mismo que tiene la hoja impresa. Si el bloque se creara en otro orden, la hoja de olas
// dejaría de poder compararse a ojo con la planilla, que es para lo que existe.
//
// ── POR QUÉ SE AGREGAN LAS TIENDAS CON CARGA QUE NO ESTÁN EN EL CALENDARIO ────────────────────
//
// Porque existen y trabajaron. Un día cualquiera tiene tiendas de ADELANTO —extras que se suman
// a mano y no están en la plantilla semanal—, y el viernes 13 tuvo 31 tiendas con movimientos
// contra las 27 que el calendario trae para un viernes. Si no se agregaran, su trabajo no
// tendría dónde escribirse y se perdería sin aviso, que es exactamente lo que esto viene a
// arreglar. Van al final para no correr el orden de las que sí estaban planificadas.

/** El calendario semanal tal como lo guarda `calendario_central`: por día, tres grupos. */
export type CalendarioSemanal = Record<string, { rm?: string[]; costa?: string[]; fal?: string[] } | undefined>;

/** Lo mínimo que se necesita de un movimiento para saber qué tienda trabajó. */
export interface ConTienda { cod: string }

/**
 * El código de día del calendario para una fecha ISO. El domingo se pliega al lunes, igual que
 * `getDia` en el Enrutador: el calendario no tiene columna de domingo.
 */
export function diaCalendario(fechaISO: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((fechaISO ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Un «2026-02-30» pasa el formato y `Date.UTC` lo rueda a marzo sin avisar. Ver `diaDeSemana`.
  if (d.toISOString().slice(0, 10) !== m[0]) return null;
  return ['LU', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'][d.getUTCDay()];
}

const limpio = (c: unknown): string => String(c ?? '').trim().toUpperCase();

/**
 * Las tiendas del día: primero las del calendario en su orden, después las que tienen carga y no
 * estaban. Sin repetidos.
 *
 * Con `cal` nulo o un día que el calendario no tiene, devuelve solo las que tienen carga: es
 * preferible un bloque con las tiendas que trabajaron a no poder registrar el día.
 */
export function codsDelDia(
  cal: CalendarioSemanal | null | undefined,
  fechaISO: string,
  movimientos: readonly ConTienda[] = [],
): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  const sumar = (c: unknown) => {
    const cod = limpio(c);
    if (!cod || vistos.has(cod)) return;
    vistos.add(cod);
    out.push(cod);
  };

  const dia = diaCalendario(fechaISO);
  const d = dia ? cal?.[dia] : undefined;
  if (d) {
    for (const c of d.fal   ?? []) sumar(c);
    for (const c of d.costa ?? []) sumar(c);
    for (const c of d.rm    ?? []) sumar(c);
  }

  // Las de adelanto y cualquier otra que haya trabajado, al final y en orden alfabético para que
  // el bloque sea el mismo si la consulta a Odoo devuelve las filas en otro orden.
  const extra = [...new Set(movimientos.map(m => limpio(m.cod)).filter(Boolean))]
    .filter(c => !vistos.has(c))
    .sort((a, b) => a.localeCompare(b));
  for (const c of extra) sumar(c);

  return out;
}
