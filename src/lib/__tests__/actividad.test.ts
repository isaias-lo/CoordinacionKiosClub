import { describe, it, expect } from 'vitest';
import { buildActividadMensaje, ordenToLabel, ACCIONES_ACTIVIDAD } from '../actividad';

describe('ordenToLabel', () => {
  it('convierte orden interno a etiqueta', () => {
    expect(ordenToLabel('pallet1')).toBe('P1');
    expect(ordenToLabel('bulto2')).toBe('B2');
    expect(ordenToLabel('contenedor1')).toBe('C1');
    expect(ordenToLabel('chocolate3')).toBe('CH3');
  });
  it('deja P1 tal cual si ya viene con letra', () => {
    expect(ordenToLabel('P1')).toBe('P1');
    expect(ordenToLabel('1B')).toBe('1B'); // no matchea el patrón letra+número
  });
});

describe('buildActividadMensaje', () => {
  it('registrar_item con peso y tienda', () => {
    expect(buildActividadMensaje('registrar_item', {
      fuente: 'rmcosta', tiendaCod: '33CON', tiendaNombre: 'Concón', label: 'P1', peso: 150,
    })).toBe('Ingresó P1 · 150kg en 33CON Concón');
  });

  it('registrar_item sin peso', () => {
    expect(buildActividadMensaje('registrar_item', {
      fuente: 'nacional', tiendaCod: '43CUR', label: 'B2',
    })).toBe('Ingresó B2 en 43CUR');
  });

  it('unificar arma "P3 con P1"', () => {
    expect(buildActividadMensaje('unificar', {
      fuente: 'rmcosta', tiendaCod: '33CON', tiendaNombre: 'Concón', sourceLabel: 'P3', label: 'P1',
    })).toBe('Unificó P3 con P1 en 33CON Concón');
  });

  it('sumar con delta de peso', () => {
    expect(buildActividadMensaje('sumar', {
      fuente: 'nacional', tiendaCod: '43CUR', sourceLabel: 'bulto', label: 'P1', peso: 20,
    })).toBe('Sumó bulto a P1 en 43CUR (+20kg)');
  });

  it('eliminar_item', () => {
    expect(buildActividadMensaje('eliminar_item', {
      fuente: 'rmcosta', tiendaCod: '33CON', label: 'P2',
    })).toBe('Eliminó P2 en 33CON');
  });

  it('registrar_dia con resumen', () => {
    expect(buildActividadMensaje('registrar_dia', {
      fuente: 'nacional', tiendas: 5, pallets: 12, bultos: 3,
    })).toBe('Registró el despacho NACIONAL — 5 tiendas · 12 pallets · 3 bultos');
  });

  it('registrar_dia RM/Costa sin resumen', () => {
    expect(buildActividadMensaje('registrar_dia', { fuente: 'rmcosta' }))
      .toBe('Registró el despacho RM/Costa');
  });

  it('sin tienda no agrega " en ..."', () => {
    expect(buildActividadMensaje('editar_item', { fuente: 'rmcosta', label: 'P1' }))
      .toBe('Editó P1');
  });
});

describe('buildActividadMensaje · revertir', () => {
  const base = { fuente: 'rmcosta' as const, tiendaCod: '16PQA' };

  it('una suma revertida dice qué se separó de qué', () => {
    expect(buildActividadMensaje('revertir', { ...base, revierte: 'suma', sourceLabel: 'CH3', label: 'P1' }))
      .toBe('Revirtió la suma de CH3 a P1 en 16PQA');
  });

  it('un borrado revertido nombra lo que volvió', () => {
    expect(buildActividadMensaje('revertir', { ...base, revierte: 'borrado', label: 'CH3' }))
      .toBe('Revirtió el borrado de CH3 en 16PQA');
  });

  it('una unificación revertida nombra a los dos pallets', () => {
    expect(buildActividadMensaje('revertir', { ...base, revierte: 'unificacion', sourceLabel: 'P3', label: 'P1' }))
      .toBe('Revirtió la unificación de P3 con P1 en 16PQA');
  });

  it('sin saber qué se revirtió, no inventa: lo trata como borrado genérico', () => {
    expect(buildActividadMensaje('revertir', { fuente: 'nacional' })).toBe('Revirtió el borrado de ítem');
  });
});

describe('ACCIONES_ACTIVIDAD', () => {
  it('toda acción de la lista tiene su frase — ninguna cae al vacío', () => {
    for (const a of ACCIONES_ACTIVIDAD) {
      expect(buildActividadMensaje(a, { fuente: 'rmcosta' })).toBeTruthy();
    }
  });

  it('incluye revertir, que la API tiene que aceptar', () => {
    expect(ACCIONES_ACTIVIDAD).toContain('revertir');
  });
});
