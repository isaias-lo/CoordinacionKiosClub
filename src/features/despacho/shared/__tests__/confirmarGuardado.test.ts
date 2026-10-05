import { describe, it, expect } from 'vitest';
import { textoConfirmacion, textoEliminarVarios } from '../confirmarGuardado';
import { avisoDeUnidad, avisoEnTerminada } from '../avisoUnidadEscaneada';

describe('lo guardado pide confirmar antes de cambiar', () => {
  it('editar nombra la unidad y pregunta', () => {
    expect(textoConfirmacion('editar', 'P3')).toBe('P3 ya está guardado.\n\n¿Seguro que quieres editarlo?');
  });

  it('eliminar nombra la unidad y pregunta', () => {
    expect(textoConfirmacion('eliminar', 'CH2')).toContain('eliminarlo');
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
