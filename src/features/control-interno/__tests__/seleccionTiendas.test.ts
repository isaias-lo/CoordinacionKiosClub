import { describe, it, expect } from 'vitest';
import { todasMarcadas, alternarTodas, alternarUna, textoSeleccion, marcadasOcultas } from '../seleccionTiendas';

const visibles = ['59EGÑ', 'CAJAS', 'GD'];

describe('todasMarcadas', () => {
  it('true solo cuando están todas las visibles', () => {
    expect(todasMarcadas(['59EGÑ', 'CAJAS', 'GD'], visibles)).toBe(true);
    expect(todasMarcadas(['59EGÑ', 'CAJAS'], visibles)).toBe(false);
  });

  it('lo marcado fuera del filtro no alcanza para darla por llena', () => {
    expect(todasMarcadas(['04PDG', '59EGÑ'], visibles)).toBe(false);
  });

  it('sin filas visibles es false: no hay nada que marcar', () => {
    // Si devolviera true, la casilla del encabezado saldría marcada sobre una tabla vacía.
    expect(todasMarcadas(['04PDG'], [])).toBe(false);
    expect(todasMarcadas([], [])).toBe(false);
  });
});

describe('alternarTodas', () => {
  it('marca todas las visibles cuando faltan', () => {
    expect(alternarTodas(['59EGÑ'], visibles)).toEqual(['59EGÑ', 'CAJAS', 'GD']);
  });

  it('las desmarca cuando ya estaban todas', () => {
    expect(alternarTodas(visibles, visibles)).toEqual([]);
  });

  it('CONSERVA lo marcado que el filtro esconde, al marcar', () => {
    // El modo de falla que evita: marcar 04PDG, buscar "eg", apretar "todas" y perder 04PDG sin
    // haberlo visto nunca en pantalla.
    expect(alternarTodas(['04PDG'], visibles)).toEqual(['04PDG', '59EGÑ', 'CAJAS', 'GD']);
  });

  it('CONSERVA lo marcado que el filtro esconde, al desmarcar', () => {
    expect(alternarTodas(['04PDG', ...visibles], visibles)).toEqual(['04PDG']);
  });

  it('no duplica lo que ya estaba marcado', () => {
    expect(alternarTodas(['CAJAS'], visibles)).toEqual(['CAJAS', '59EGÑ', 'GD']);
  });
});

describe('alternarUna', () => {
  it('marca y desmarca', () => {
    expect(alternarUna(['59EGÑ'], 'CAJAS')).toEqual(['59EGÑ', 'CAJAS']);
    expect(alternarUna(['59EGÑ', 'CAJAS'], '59EGÑ')).toEqual(['CAJAS']);
  });

  it('la Ñ no se confunde con la N: son dos tiendas distintas', () => {
    // 59EGÑ y 59EGN existen las dos en la base. Tratarlas como una sola sería el peor error posible
    // en una pantalla que borra.
    expect(alternarUna(['59EGN'], '59EGÑ')).toEqual(['59EGN', '59EGÑ']);
    expect(alternarUna(['59EGN', '59EGÑ'], '59EGN')).toEqual(['59EGÑ']);
  });
});

describe('textoSeleccion', () => {
  it('concuerda en singular y plural', () => {
    expect(textoSeleccion(1)).toBe('1 tienda seleccionada');
    expect(textoSeleccion(3)).toBe('3 tiendas seleccionadas');
  });
});

describe('marcadasOcultas', () => {
  it('cuenta las marcadas que el filtro no muestra', () => {
    expect(marcadasOcultas(['04PDG', '59EGÑ'], visibles)).toBe(1);
    expect(marcadasOcultas(visibles, visibles)).toBe(0);
    expect(marcadasOcultas([], visibles)).toBe(0);
  });
});
