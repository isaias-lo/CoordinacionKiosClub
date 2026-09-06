import { describe, it, expect } from 'vitest';
import { camposCambiados, resumenCambio, ENTIDADES } from '../bitacora';

const TIENDA = ENTIDADES.tienda.campos;

describe('camposCambiados', () => {
  // Los dos arreglos reales de hoy: 59EGN sin sector y 60PBL con un espacio en la región.
  it('encuentra el campo que cambió y lo nombra como se ve en pantalla', () => {
    const r = camposCambiados({ sector_comuna: '' }, { sector_comuna: 'Corredor Oriente' }, TIENDA);
    expect(r).toEqual([{ campo: 'sector', antes: '∅', despues: 'Corredor Oriente' }]);
  });

  it('un espacio invisible SÍ es un cambio', () => {
    const r = camposCambiados({ region: 'Araucanía ' }, { region: 'Araucanía' }, TIENDA);
    expect(r[0]).toMatchObject({ campo: 'región', antes: 'Araucanía ', despues: 'Araucanía' });
  });

  // null y '' son lo mismo para quien lee: reportarlo sería inventar un cambio que nadie hizo.
  it('null y cadena vacía no cuentan como cambio', () => {
    expect(camposCambiados({ comuna: null }, { comuna: '' }, TIENDA)).toEqual([]);
  });

  // Sin esta lista se mostrarían `updated_at` y ruido interno que nadie pidió.
  it('solo mira los campos declarados', () => {
    const r = camposCambiados({ updated_at: 'a', nombre: 'X' }, { updated_at: 'b', nombre: 'X' }, TIENDA);
    expect(r).toEqual([]);
  });

  it('respeta el orden en que se declararon los campos', () => {
    const r = camposCambiados({ nombre: 'A', region: 'RM' }, { nombre: 'B', region: 'VR' }, TIENDA);
    expect(r.map(c => c.campo)).toEqual(['nombre', 'región']);
  });

  it('los booleanos se leen como sí/no', () => {
    const r = camposCambiados({ activo: true }, { activo: false }, TIENDA);
    expect(r[0]).toMatchObject({ antes: 'sí', despues: 'no' });
  });

  it('las listas se muestran separadas por coma', () => {
    const r = camposCambiados({ empresa: ['A'] }, { empresa: ['A', 'B'] }, { empresa: 'empresa' });
    expect(r[0]).toMatchObject({ antes: 'A', despues: 'A, B' });
  });

  it('crear una tienda: todo lo que viene con valor cuenta como cambio', () => {
    const r = camposCambiados(null, { nombre: 'Plaza Egaña', sector_comuna: 'Corredor Oriente' }, TIENDA);
    expect(r.map(c => c.campo)).toEqual(['nombre', 'sector']);
  });

  it('sin cambios devuelve lista vacía', () => {
    expect(camposCambiados({ nombre: 'X' }, { nombre: 'X' }, TIENDA)).toEqual([]);
  });
});

describe('resumenCambio', () => {
  it('arma la línea que se lee de un vistazo', () => {
    const r = resumenCambio([
      { campo: 'sector', antes: '∅', despues: 'Corredor Oriente' },
      { campo: 'región', antes: 'Araucanía ', despues: 'Araucanía' },
    ]);
    expect(r).toBe('sector: ∅ → Corredor Oriente · región: Araucanía  → Araucanía');
  });

  // Una línea que no cabe en pantalla no se lee; el detalle completo queda en antes/despues.
  it('corta a los primeros y dice cuántos faltan', () => {
    const muchos = Array.from({ length: 7 }, (_, i) => ({ campo: `c${i}`, antes: 'a', despues: 'b' }));
    expect(resumenCambio(muchos, 2)).toBe('c0: a → b · c1: a → b · y 5 campos más');
  });

  it('uno solo de más se dice en singular', () => {
    const tres = Array.from({ length: 3 }, (_, i) => ({ campo: `c${i}`, antes: 'a', despues: 'b' }));
    expect(resumenCambio(tres, 2)).toContain('y 1 campo más');
  });

  it('sin cambios lo dice, no devuelve vacío', () => {
    expect(resumenCambio([])).toBe('Sin cambios');
  });
});
