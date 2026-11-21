import { describe, it, expect } from 'vitest';
import { faltaParaEnviar, tituloDeSolicitud, posibleDuplicadoAlCrear } from '../formulario';
import type { SolicitudMant } from '../../tipos';

describe('faltaParaEnviar', () => {
  it('completo: no falta nada', () => {
    expect(faltaParaEnviar({ tienda: '26ALC', descripcion: 'No hay luz', fotos: 1 })).toEqual([]);
  });

  it('vacío: falta todo, en el orden del formulario', () => {
    expect(faltaParaEnviar({ tienda: '', descripcion: '  ', fotos: 0 }))
      .toEqual(['elegir la tienda', 'contar qué pasa', 'al menos una foto']);
  });

  it('cinco fotos pasan; seis, no', () => {
    expect(faltaParaEnviar({ tienda: 'a', descripcion: 'b', fotos: 5 })).toEqual([]);
    expect(faltaParaEnviar({ tienda: 'a', descripcion: 'b', fotos: 6 })).toEqual(['quitar fotos (máximo 5)']);
  });
});

describe('tituloDeSolicitud', () => {
  it('toma la primera línea', () => {
    expect(tituloDeSolicitud('Vitrina no enfría\nMarca 12 °C desde la mañana')).toBe('Vitrina no enfría');
  });

  it('corta lo largo con puntos suspensivos', () => {
    const t = tituloDeSolicitud('a'.repeat(100), 10);
    expect(t).toBe(`${'a'.repeat(9)}…`);
    expect(t.length).toBe(10);
  });

  it('vacío da vacío', () => {
    expect(tituloDeSolicitud('')).toBe('');
  });
});

describe('posibleDuplicadoAlCrear', () => {
  const sol = (p: Partial<SolicitudMant>): SolicitudMant => ({
    id: 'x', codigoTienda: '26ALC', nombreTienda: 'Alc', categoria: 'Eléctrico', descripcion: 'd',
    urgencia: null, estado: 'pendiente', origen: 'app', duplicadaDe: null, esperaMaterial: false,
    creadaPorNombre: null, creadaEn: '2026-11-20T10:00:00Z', fotos: [], comentarios: [], ...p,
  });

  it('misma tienda y misma categoría abierta: avisa con la más vieja', () => {
    const vieja = sol({ id: 'v', creadaEn: '2026-11-01T10:00:00Z' });
    const nueva = sol({ id: 'n' });
    expect(posibleDuplicadoAlCrear({ codigoTienda: '26alc', categoria: 'eléctrico' }, [nueva, vieja])?.id).toBe('v');
  });

  it('sin categoría no avisa', () => {
    expect(posibleDuplicadoAlCrear({ codigoTienda: '26ALC', categoria: '' }, [sol({})])).toBeNull();
  });

  it('otra tienda u otra categoría, no', () => {
    expect(posibleDuplicadoAlCrear({ codigoTienda: '31TLC', categoria: 'Eléctrico' }, [sol({})])).toBeNull();
    expect(posibleDuplicadoAlCrear({ codigoTienda: '26ALC', categoria: 'Gasfitería' }, [sol({})])).toBeNull();
  });

  it('una cerrada o descartada ya no cuenta', () => {
    expect(posibleDuplicadoAlCrear({ codigoTienda: '26ALC', categoria: 'Eléctrico' }, [sol({ estado: 'cerrada' })])).toBeNull();
    expect(posibleDuplicadoAlCrear({ codigoTienda: '26ALC', categoria: 'Eléctrico' }, [sol({ estado: 'descartada' })])).toBeNull();
  });
});
