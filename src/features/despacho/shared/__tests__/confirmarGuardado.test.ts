import { describe, it, expect } from 'vitest';
import { pedidoCambioGuardado, pedidoQuitarSinGuardar, textoEliminarVarios } from '../confirmarGuardado';
import { avisoDeUnidad, avisoEnTerminada } from '../avisoUnidadEscaneada';

describe('lo guardado pide confirmar antes de cambiar', () => {
  it('editar nombra la unidad en la pregunta y en el botón', () => {
    expect(pedidoCambioGuardado('editar', 'P3')).toEqual({
      titulo: '¿Editar P3?', detalle: 'P3 ya está guardado.', aceptar: 'Editar P3',
    });
  });

  it('eliminar va en rojo y el botón dice qué borra', () => {
    const p = pedidoCambioGuardado('eliminar', 'CH2');
    expect(p.aceptar).toBe('Eliminar CH2');
    expect(p.tono).toBe('peligro');
  });

  it('quitar una tarjeta sin guardar avisa que se borra de Picking', () => {
    const p = pedidoQuitarSinGuardar('P3');
    expect(p.aceptar).toBe('Quitar P3');
    expect(p.detalle).toContain('Se borra también de Picking');
    expect(p.tono).toBe('peligro');
  });

  it('eliminar varios dice cuántos', () => {
    expect(textoEliminarVarios(1)).toBe('¿Seguro que quieres eliminar el seleccionado?');
    expect(textoEliminarVarios(4)).toBe('¿Seguro que quieres eliminar los 4 seleccionados?');
  });
});

describe('escanear en una tienda terminada', () => {
  it('advierte siempre y dice cómo salir, aunque la unidad no esté pesada', () => {
    const a = avisoEnTerminada(avisoDeUnidad(null));
    expect(a.advertir).toBe(true);
    expect(a.texto).toMatch(/terminada/i);
    expect(a.estado).toBe('sin-cargar');
  });
});
