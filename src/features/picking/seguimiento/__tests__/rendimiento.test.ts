import { describe, it, expect } from 'vitest';
import { rendimientoPorPicker, type OperacionCruda } from '../rendimiento';

function op(p: Partial<OperacionCruda> = {}): OperacionCruda {
  return {
    userId: 1, userName: 'Pickers 15',
    asignadoEn: '2026-11-03 11:00:00', validadoEn: '2026-11-03 12:00:00',
    units: 100, lines: 10, ...p,
  };
}

describe('rendimientoPorPicker: de dónde sale la duración', () => {
  it('mide desde que se le asignó, no desde la fecha planificada', () => {
    // 11:00 → 12:00 UTC es una hora. El campo planificado no entra en la cuenta.
    const { filas } = rendimientoPorPicker([op()]);
    expect(filas[0].totalMinutes).toBe(60);
    expect(filas[0].avgMinutesPerOp).toBe(60);
  });

  it('una operación sin hora de asignación no se mide, pero SÍ se cuenta y se informa', () => {
    // Antes desaparecía en silencio y además inflaba el divisor del promedio.
    const { filas, sinMedir } = rendimientoPorPicker([
      op(),
      op({ asignadoEn: null }),
    ]);
    expect(filas[0].ops).toBe(2);          // las dos son trabajo de esa persona
    expect(filas[0].opsMedidas).toBe(1);   // solo una tiene duración
    expect(filas[0].avgMinutesPerOp).toBe(60);  // 60 / 1, no 60 / 2
    expect(sinMedir).toBe(1);
  });

  it('Odoo manda `false` cuando el campo está vacío, no null', () => {
    const { filas, sinMedir } = rendimientoPorPicker([op({ asignadoEn: false })]);
    expect(filas[0].opsMedidas).toBe(0);
    expect(filas[0].avgMinutesPerOp).toBe(0);
    expect(sinMedir).toBe(1);
  });

  it('una validación anterior a la asignación no se mide', () => {
    // Dato corrupto o movimiento reasignado: un negativo arruinaría el promedio de todos.
    const { filas, sinMedir } = rendimientoPorPicker([
      op({ asignadoEn: '2026-11-03 14:00:00', validadoEn: '2026-11-03 11:00:00' }),
    ]);
    expect(filas[0].opsMedidas).toBe(0);
    expect(sinMedir).toBe(1);
  });

  it('NO descarta las operaciones largas', () => {
    // El cálculo viejo tiraba todo lo que pasara de 8 h: 126 de 885 operaciones en una semana.
    // Una jornada larga es un dato, no un error.
    const { filas, sinMedir } = rendimientoPorPicker([
      op({ asignadoEn: '2026-11-03 08:00:00', validadoEn: '2026-11-03 22:00:00' }),
    ]);
    expect(filas[0].totalMinutes).toBe(840);   // 14 horas, contadas
    expect(filas[0].opsMedidas).toBe(1);
    expect(sinMedir).toBe(0);
  });
});

describe('rendimientoPorPicker: los ritmos se calculan sobre lo medido', () => {
  it('el tiempo por SKU usa las líneas de las operaciones medidas, no de todas', () => {
    // Un ritmo con numerador de un subconjunto y denominador de otro no significa nada.
    const { filas } = rendimientoPorPicker([
      op({ lines: 10, units: 100 }),                      // 60 min, 10 líneas
      op({ lines: 90, units: 900, asignadoEn: null }),     // sin medir
    ]);
    expect(filas[0].lineCount).toBe(100);           // el TOTAL sigue sumando las 100 líneas
    expect(filas[0].units).toBe(1000);              // y las 1000 unidades
    expect(filas[0].avgSecondsPerLine).toBe(360);   // 60 min × 60 / 10 líneas medidas
    expect(filas[0].cph).toBe(100);                 // 100 unidades medidas en 1 h
  });

  it('sin ninguna operación medida, los ritmos son 0 y no NaN ni Infinity', () => {
    const { filas } = rendimientoPorPicker([op({ asignadoEn: null })]);
    expect(filas[0].avgMinutesPerOp).toBe(0);
    expect(filas[0].avgSecondsPerLine).toBe(0);
    expect(filas[0].cph).toBe(0);
  });
});

describe('rendimientoPorPicker: agrupación', () => {
  it('junta por persona y ordena por nombre', () => {
    const { filas } = rendimientoPorPicker([
      op({ userId: 2, userName: 'Pickers 7' }),
      op({ userId: 1, userName: 'Pickers 15' }),
      op({ userId: 1, userName: 'Pickers 15' }),
    ]);
    expect(filas.map(f => f.name)).toEqual(['Pickers 15', 'Pickers 7']);
    expect(filas[0].ops).toBe(2);
    expect(filas[1].ops).toBe(1);
  });

  it('una operación sin responsable no se le cuenta a nadie', () => {
    const { filas, sinResponsable } = rendimientoPorPicker([
      op(),
      op({ userId: 0, userName: '' }),
    ]);
    expect(filas).toHaveLength(1);
    expect(sinResponsable).toBe(1);
  });
});

describe('rendimientoPorPicker: una persona, una fila', () => {
  // En Odoo el responsable es la CUENTA de la pistola. Una persona que usó dos pistolas en el
  // período salía en dos filas con el mismo nombre en pantalla, porque la traducción pasaba
  // recién al dibujar. Dos filas de la misma persona no se comparan con nada.
  const CANON = { 'Pickers 15': 'Cristobal Labra', 'Inventario': 'Cristobal Labra',
                  'Pickers 7': 'Marcelo Vergara' };

  it('junta las dos cuentas de la misma persona en una sola fila', () => {
    const { filas } = rendimientoPorPicker([
      op({ userId: 1, userName: 'Pickers 15', units: 100, lines: 10 }),
      op({ userId: 2, userName: 'Inventario', units: 300, lines: 30 }),
    ], CANON);
    expect(filas).toHaveLength(1);
    expect(filas[0].name).toBe('Cristobal Labra');
    expect(filas[0].ops).toBe(2);
    expect(filas[0].units).toBe(400);
    expect(filas[0].lineCount).toBe(40);
  });

  it('la fila dice de qué cuentas salió', () => {
    const { filas } = rendimientoPorPicker([
      op({ userId: 2, userName: 'Inventario' }),
      op({ userId: 1, userName: 'Pickers 15' }),
    ], CANON);
    expect(filas[0].cuentas).toEqual(['Inventario', 'Pickers 15']);
  });

  it('el ritmo se calcula sobre la suma, no promediando dos promedios', () => {
    // 100 unidades en 60 min y 300 en 60 min. Lo correcto es 400/120 = 200/h.
    // Promediar los dos CPH (100 y 300) daría 200 por casualidad; con tiempos distintos no.
    const { filas } = rendimientoPorPicker([
      op({ userId: 1, userName: 'Pickers 15', units: 100,
           asignadoEn: '2026-11-03 10:00:00', validadoEn: '2026-11-03 11:00:00' }),
      op({ userId: 2, userName: 'Inventario', units: 300,
           asignadoEn: '2026-11-03 11:00:00', validadoEn: '2026-11-03 14:00:00' }),
    ], CANON);
    // 400 unidades en 240 minutos = 100 por hora. El promedio de 100 y 100 sería 100 también,
    // así que se afina: 100 en 1 h y 300 en 3 h → 400/4 h = 100/h.
    expect(filas[0].cph).toBe(100);
    expect(filas[0].totalMinutes).toBe(240);
  });

  it('sin tabla de nombres agrupa por cuenta, como antes', () => {
    const { filas } = rendimientoPorPicker([
      op({ userId: 1, userName: 'Pickers 15' }),
      op({ userId: 2, userName: 'Inventario' }),
    ]);
    expect(filas.map(f => f.name).sort()).toEqual(['Inventario', 'Pickers 15']);
  });

  it('una cuenta que no está en la tabla conserva su nombre crudo', () => {
    // Así se ve cuál falta configurar, en vez de que desaparezca.
    const { filas } = rendimientoPorPicker([op({ userName: 'Pickers 99' })], CANON);
    expect(filas[0].name).toBe('Pickers 99');
  });

  it('dos personas distintas siguen siendo dos filas', () => {
    const { filas } = rendimientoPorPicker([
      op({ userId: 1, userName: 'Pickers 15' }),
      op({ userId: 3, userName: 'Pickers 7' }),
    ], CANON);
    expect(filas.map(f => f.name)).toEqual(['Cristobal Labra', 'Marcelo Vergara']);
  });
});
