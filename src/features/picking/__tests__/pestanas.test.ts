import { describe, it, expect } from 'vitest';
import { PESTANAS, GRUPOS, pestana, fechaCorta, textoConexion, textoConexionCorto } from '../marco/pestanas';

describe('pestañas de Picking', () => {
  it('mantiene las siete claves guardadas', () => {
    expect(PESTANAS.map(p => p.key).sort()).toEqual(
      ['actividad', 'calendario', 'configuracion', 'congelados', 'estadisticas', 'historial', 'monitoreo']);
  });
  it('agrupa como el diseño', () => {
    const por = (g: string) => PESTANAS.filter(p => p.grupo === g).map(p => p.label);
    expect(GRUPOS).toEqual(['Operación', 'Seguimiento', 'Ajustes']);
    expect(por('Operación')).toEqual(['Seco', 'Congelados']);
    expect(por('Seguimiento')).toEqual(['Actividad', 'Historial', 'Estadísticas']);
    expect(por('Ajustes')).toEqual(['Calendario', 'Configuración']);
  });
  it('Seco es la pestaña monitoreo', () => {
    expect(pestana('monitoreo')).toMatchObject({ label: 'Seco', grupo: 'Operación' });
  });
});

describe('fechaCorta', () => {
  it('día con mayúscula, número y mes corto sin punto', () => {
    expect(fechaCorta(new Date(2026, 9, 8))).toBe('Jueves 8 oct');
  });
});

describe('textoConexion', () => {
  it('con señal y cola vacía', () => expect(textoConexion(true, 0)).toBe('En línea · todo guardado'));
  it('con señal y cola por enviar', () => expect(textoConexion(true, 2)).toBe('En línea · 2 pendientes por enviar'));
  it('sin señal', () => {
    expect(textoConexion(false, 0)).toBe('Sin conexión');
    expect(textoConexion(false, 1)).toBe('Sin conexión · 1 pendiente');
  });
});

describe('textoConexionCorto', () => {
  it('cabe en la franja del teléfono', () => {
    expect(textoConexionCorto(true, 0)).toBe('En línea');
    expect(textoConexionCorto(true, 3)).toBe('3 por enviar');
    expect(textoConexionCorto(false, 2)).toBe('Sin conexión · 2');
  });
});
