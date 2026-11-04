import { describe, it, expect } from 'vitest';
import { conCorrecciones, type FilaGuardada } from '../conCorrecciones';
import type { MovimientoPlanilla } from '../armarPlanilla';

function vivo(p: Partial<MovimientoPlanilla> & { ref?: string } = {}): MovimientoPlanilla & { ref: string } {
  return {
    ref: '99REC/DT/146059', cod: '38SP2', seccion: 'Hogar', registros: 63,
    picker: 'Marcelo Vergara', asignadoEn: '2026-11-03 11:00:00',
    validadoEn: null, estado: 'assigned', ...p,
  } as MovimientoPlanilla & { ref: string };
}

function guardada(p: Partial<FilaGuardada> = {}): FilaGuardada {
  return {
    id: 1, ref: '99REC/DT/146059', cod: '38SP2', seccion: 'Hogar',
    registrosOdoo: 63, pickerOdoo: 'Pickers 7', asignadoEn: '2026-11-03 11:00:00',
    registros: null, picker: null, ...p,
  };
}

describe('conCorrecciones: de dónde sale cada número', () => {
  it('sin nada guardado, manda lo que dice Odoo ahora', () => {
    const [m] = conCorrecciones([vivo()], []);
    expect(m.registros).toBe(63);
    expect(m.origen).toBe('vivo');
  });

  it('con foto, manda la foto aunque Odoo ya diga menos', () => {
    // Es el caso real: 253 al asignar, 251 después de validar. La hoja tiene que decir 253.
    const [m] = conCorrecciones(
      [vivo({ registros: 251, estado: 'done' })],
      [guardada({ registrosOdoo: 253 })],
    );
    expect(m.registros).toBe(253);
    expect(m.origen).toBe('foto');
  });

  it('con corrección a mano, manda la corrección sobre la foto', () => {
    const [m] = conCorrecciones(
      [vivo({ registros: 251 })],
      [guardada({ registrosOdoo: 253, registros: 250 })],
    );
    expect(m.registros).toBe(250);
    expect(m.origen).toBe('corregido');
  });

  it('corregir el picker no cambia el número, ni al revés', () => {
    const [m] = conCorrecciones(
      [vivo({ registros: 63, picker: 'Marcelo Vergara' })],
      [guardada({ registrosOdoo: 63, picker: 'Juliette Mendoza' })],
    );
    expect(m.picker).toBe('Juliette Mendoza');
    expect(m.registros).toBe(63);
    expect(m.origen).toBe('corregido');
  });

  it('un cero corregido es un cero, no «sin corregir»', () => {
    // Con `||` en vez de `??` un 0 se perdería y volvería al número de Odoo.
    const [m] = conCorrecciones([vivo({ registros: 63 })], [guardada({ registros: 0 })]);
    expect(m.registros).toBe(0);
    expect(m.origen).toBe('corregido');
  });

  it('cada movimiento lleva el id de su fila, para poder editarlo', () => {
    const [m] = conCorrecciones([vivo()], [guardada({ id: 77 })]);
    expect(m.id).toBe(77);
  });
});

describe('conCorrecciones: qué existe y qué no', () => {
  it('una fila guardada cuyo movimiento ya no está en Odoo NO revive', () => {
    // Si se anuló después de fotografiarlo, dejó de ser trabajo. Odoo decide qué existe;
    // lo guardado decide con qué número.
    expect(conCorrecciones([], [guardada()])).toHaveLength(0);
  });

  it('una línea agregada a mano SÍ aparece, aunque Odoo no la tenga', () => {
    const out = conCorrecciones([], [
      { id: 9, ref: null, cod: '38SP2', seccion: 'Comida', registrosOdoo: null,
        pickerOdoo: null, asignadoEn: null, registros: 40, picker: 'Josue Suazo' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].registros).toBe(40);
    expect(out[0].picker).toBe('Josue Suazo');
    expect(out[0].origen).toBe('manual');
    // Una línea a mano cuenta como trabajo real: si no, `armarPlanilla` la descartaría.
    expect(out[0].estado).toBe('assigned');
  });

  it('las líneas a mano van después de las de Odoo de la misma celda', () => {
    const out = conCorrecciones([vivo({ registros: 63 })], [
      guardada(),
      { id: 9, ref: null, cod: '38SP2', seccion: 'Hogar', registrosOdoo: null,
        pickerOdoo: null, asignadoEn: null, registros: 46, picker: 'Marcelo Vergara' },
    ]);
    expect(out.map(m => m.registros)).toEqual([63, 46]);
  });

  it('una fila guardada de OTRA tienda no se mezcla', () => {
    const [m] = conCorrecciones(
      [vivo({ cod: '38SP2' })],
      [guardada({ ref: '99REC/DT/999999', cod: '27MCH', registros: 999 })],
    );
    expect(m.cod).toBe('38SP2');
    expect(m.registros).toBe(63);
  });
});
