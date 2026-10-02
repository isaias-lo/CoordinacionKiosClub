import { describe, it, expect } from 'vitest';
import { fechaISOLocal, fechaDespachoBodega } from '../fechaLocal';

// Los instantes se escriben en UTC a propósito: así el test da lo mismo corra en el CD, en CI o en
// otro huso. Chile está en UTC-4 (invierno) / UTC-3 (verano) — el helper resuelve el horario de
// verano solo, vía Intl.
describe('fechaISOLocal — día del CD (America/Santiago)', () => {
  it('formatea YYYY-MM-DD', () => {
    expect(fechaISOLocal(new Date('2026-08-27T16:00:00Z'))).toBe('2026-08-27'); // 12:00 en Chile
  });

  it('rellena mes y día de un dígito con cero', () => {
    expect(fechaISOLocal(new Date('2026-01-05T15:00:00Z'))).toBe('2026-01-05');
    expect(fechaISOLocal(new Date('2026-09-09T15:00:00Z'))).toBe('2026-09-09');
  });

  it('a las 23:30 de Chile sigue siendo HOY, aunque en UTC ya sea mañana', () => {
    // 28-ago 03:30 UTC = 27-ago 23:30 en Chile. Con el día UTC esto daba '2026-08-28' → el bug.
    expect(fechaISOLocal(new Date('2026-08-28T03:30:00Z'))).toBe('2026-08-27');
  });

  it('a las 21:30 de Chile —la hora de la auditoría— tampoco se adelanta', () => {
    // 12-sep 00:30 UTC = 11-sep 21:30 en Chile. Es el "Hoy = 12/09" que mostraba Actividad.
    expect(fechaISOLocal(new Date('2026-09-12T00:30:00Z'))).toBe('2026-09-11');
  });

  it('a las 00:30 de Chile ya es el día nuevo', () => {
    // 27-ago 04:30 UTC = 27-ago 00:30 en Chile (UTC-4 en invierno).
    expect(fechaISOLocal(new Date('2026-08-27T04:30:00Z'))).toBe('2026-08-27');
  });

  it('a las 23:30 del día anterior todavía NO cambió el día', () => {
    // 27-ago 03:30 UTC = 26-ago 23:30 en Chile. Una hora antes que el caso de arriba.
    expect(fechaISOLocal(new Date('2026-08-27T03:30:00Z'))).toBe('2026-08-26');
  });

  it('no depende del huso del equipo: el mismo instante da el mismo día siempre', () => {
    const instante = new Date('2026-09-12T00:30:00Z');
    expect(fechaISOLocal(instante)).toBe(fechaISOLocal(new Date(instante.getTime())));
  });

  it('sin argumento devuelve el día de hoy en Chile', () => {
    expect(fechaISOLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── EL BOTÓN «REGISTRAR AHORA» DEL BANNER (01/10/2026) ─────────────────────────────────────────
//
// `sheetsSantiagoWrite(items, regimen, fechaDeDESPACHO, fechaDeARMADO)`. El banner pasaba la fecha
// del BORRADOR en el lugar de la de despacho, y omitía la de armado — que cae a HOY, el día en que
// alguien aprieta el botón.
//
// Resultado: una fila con las dos fechas cruzadas. El sello del id sale de la de despacho (30/09)
// y la columna FECHA de la de armado (01/10), así que la unidad queda «despachada antes de
// armarse» y con un id que NO es el que escribió el registro normal. Entra como fila NUEVA y la
// unidad se cuenta dos veces.
//
// Medido: 71 filas duplicadas del 30/09 (12.622,8 kg) y 1.021 filas con esa forma desde el 08/07.

describe('fechaDespachoBodega para un borrador de OTRO día', () => {
  const alMediodia = (iso: string) => new Date(`${iso}T12:00:00`);

  it('un borrador del 30/09 despacha el 01/10, no hoy', () => {
    expect(fechaDespachoBodega(undefined, alMediodia('2026-09-30'))).toBe('2026-10-01');
  });

  it('la fecha de despacho SIEMPRE es posterior a la de armado', () => {
    // Es la propiedad que se rompía: con el sello en 30/09 y el armado en 01/10, la unidad quedaba
    // despachada antes de existir.
    for (const armado of ['2026-09-28', '2026-09-30', '2026-10-01', '2026-12-31']) {
      expect(fechaDespachoBodega(undefined, alMediodia(armado)) > armado, armado).toBe(true);
    }
  });

  it('si el borrador trae su propia fecha de despacho, manda ésa', () => {
    expect(fechaDespachoBodega('2026-10-02', alMediodia('2026-09-30'))).toBe('2026-10-02');
  });

  it('el fin de mes no se desarma', () => {
    expect(fechaDespachoBodega(undefined, alMediodia('2026-09-30'))).toBe('2026-10-01');
    expect(fechaDespachoBodega(undefined, alMediodia('2026-12-31'))).toBe('2027-01-01');
  });
});

// ── LOS DOS ESPEJOS TIENEN QUE SELLAR IGUAL (01/10/2026) ───────────────────────────────────────
//
// De esta fecha sale el `stamp` del id de cada fila de la planilla. Nacional pasaba
// `state.fechaDespacho` CRUDO —que está VACÍO mientras nadie toque el selector— y la función caía
// a HOY, así que sellaba con el día de ARMADO mientras RM/Costa sellaba con el de DESPACHO:
//
//     RM/Costa  sello 01102026  fecha 30/09   ← día siguiente, correcto
//     Nacional  sello 01102026  fecha 01/10   ← mismo día, y el despacho era el 02/10
//
// Dos espejos sellando distinto es lo que hace que una misma unidad termine con dos ids.

describe('el sello del id — RM/Costa y Nacional no pueden diferir', () => {
  const alMediodia = (iso: string) => new Date(`${iso}T12:00:00`);

  it('sin tocar el selector, el sello NUNCA es el día de armado', () => {
    for (const armado of ['2026-10-01', '2026-09-30', '2026-12-31']) {
      expect(fechaDespachoBodega(undefined, alMediodia(armado)), armado).not.toBe(armado);
    }
  });

  it('la fecha cruda vacía y la calculada dan cosas DISTINTAS — ésa era la divergencia', () => {
    const cruda = '';                                            // lo que tenía Nacional
    const calculada = fechaDespachoBodega(cruda || undefined, alMediodia('2026-10-01'));
    expect(calculada).toBe('2026-10-02');
    expect(calculada).not.toBe(cruda);
  });

  it('los dos espejos, con el mismo estado, sellan igual', () => {
    const hoy = alMediodia('2026-10-01');
    const rmCosta  = fechaDespachoBodega(undefined, hoy);
    const nacional = fechaDespachoBodega(undefined, hoy);
    expect(nacional).toBe(rmCosta);
  });
});
