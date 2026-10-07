import { describe, it, expect } from 'vitest';
import { semanaCalendario, textoGrupoVacio, notaDiasVacios } from '../semanaCalendario';

describe('semanaCalendario', () => {
  it('cuenta por grupo y día, de lunes a sábado', () => {
    const s = semanaCalendario({ MA: { rm: ['A', 'B'], costa: [], fal: ['C'] } });
    expect(s.map(d => d.dia)).toEqual(['LU', 'MA', 'MI', 'JU', 'VI', 'SA']);
    expect(s[1]).toMatchObject({ nombre: 'Martes', rm: 2, costa: 0, fal: 1, total: 3 });
    expect(s[0].total).toBe(0);
  });
  it('agrega el domingo solo si tiene tiendas', () => {
    expect(semanaCalendario({ DO: { rm: ['A'] } }).map(d => d.dia)).toContain('DO');
  });
  it('sin calendario devuelve la semana en cero', () => {
    expect(semanaCalendario(null).every(d => d.total === 0)).toBe(true);
  });
});

describe('textoGrupoVacio', () => {
  it('nombra el grupo y el día en plural', () => {
    expect(textoGrupoVacio('costa', 'MA')).toBe('Ninguna tienda de costa recibe los martes');
    expect(textoGrupoVacio('fal', 'SA')).toBe('Ninguna tienda de regiones recibe los sábados');
    expect(textoGrupoVacio('rm', 'LU')).toBe('Ninguna tienda de RM recibe los lunes');
  });
});

describe('notaDiasVacios', () => {
  it('null si todos reciben', () => {
    expect(notaDiasVacios([{ dia: 'LU', nombre: 'Lunes', rm: 1, costa: 0, fal: 0, total: 1 }])).toBeNull();
  });
  it('uno o varios días vacíos', () => {
    const v = (dia: string, nombre: string) => ({ dia, nombre, rm: 0, costa: 0, fal: 0, total: 0 });
    expect(notaDiasVacios([v('SA', 'Sábado')])).toBe('El sábado no recibe ninguna tienda.');
    expect(notaDiasVacios([v('MI', 'Miércoles'), v('SA', 'Sábado')])).toBe('Miércoles y sábado no reciben ninguna tienda.');
  });
});
