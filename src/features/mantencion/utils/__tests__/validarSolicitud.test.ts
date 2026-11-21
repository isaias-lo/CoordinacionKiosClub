import { describe, it, expect } from 'vitest';
import { MAX_FOTOS, tiendaPermitida, validarSolicitud } from '../validarSolicitud';

const MIAS = ['53VAL', '09LEO'];
const base = {
  codigoTienda: '53VAL',
  categoria: 'Eléctrico',
  descripcion: 'Se quemó la ampolleta del pasillo de cajas',
  fotos: ['2026/11/53VAL/abc/1.jpg'],
  origen: 'app' as const,
};

describe('validarSolicitud · lo que pasa', () => {
  it('una solicitud completa es válida', () => {
    const r = validarSolicitud(base, MIAS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.codigoTienda).toBe('53VAL');
  });

  it('la categoría es opcional', () => {
    expect(validarSolicitud({ ...base, categoria: undefined }, MIAS).ok).toBe(true);
    expect(validarSolicitud({ ...base, categoria: '' }, MIAS).ok).toBe(true);
  });

  it('una categoría escrita a mano también entra: la lista es sugerida', () => {
    expect(validarSolicitud({ ...base, categoria: 'Portón del estacionamiento' }, MIAS).ok)
      .toBe(true);
  });

  it('cinco fotos entran', () => {
    const fotos = Array.from({ length: MAX_FOTOS }, (_, i) => `2026/11/53VAL/abc/${i}.jpg`);
    expect(validarSolicitud({ ...base, fotos }, MIAS).ok).toBe(true);
  });

  it('`origen` se asume «app» cuando no viene', () => {
    const r = validarSolicitud({ ...base, origen: undefined }, MIAS);
    expect(r.ok && r.datos.origen).toBe('app');
  });
});

describe('validarSolicitud · lo que no pasa', () => {
  const errores = (e: unknown) => {
    const r = validarSolicitud(e, MIAS);
    return r.ok ? [] : r.errores;
  };

  it('sin descripción no se puede', () => {
    expect(errores({ ...base, descripcion: '   ' })).toContain('Contá qué pasa');
  });

  it('sin fotos no se puede', () => {
    expect(errores({ ...base, fotos: [] })).toContain('Agregá al menos una foto');
  });

  it('más de cinco fotos no se puede', () => {
    const fotos = Array.from({ length: MAX_FOTOS + 1 }, (_, i) => `f${i}.jpg`);
    expect(errores({ ...base, fotos })).toContain(`Máximo ${MAX_FOTOS} fotos`);
  });

  it('una tienda que no es suya no se puede', () => {
    expect(errores({ ...base, codigoTienda: '76PAN' }))
      .toEqual(['Esa tienda no está entre las tuyas']);
  });

  it('devuelve TODOS los problemas, no el primero', () => {
    const e = errores({ ...base, descripcion: '', fotos: [] });
    expect(e).toContain('Contá qué pasa');
    expect(e).toContain('Agregá al menos una foto');
  });

  it('una urgencia enviada por el supervisor no entra al schema', () => {
    // La regla de negocio: la urgencia la define Mantención. El campo no existe acá, así que
    // mandarlo no hace nada — no se cuela a la base.
    const r = validarSolicitud({ ...base, urgencia: 'urgente' }, MIAS);
    expect(r.ok).toBe(true);
    expect(r.ok && 'urgencia' in r.datos).toBe(false);
  });

  it('basura no explota, devuelve errores', () => {
    expect(validarSolicitud(null, MIAS).ok).toBe(false);
    expect(validarSolicitud({}, MIAS).ok).toBe(false);
  });
});

describe('tiendaPermitida', () => {
  it('compara sin mayúsculas ni espacios', () => {
    expect(tiendaPermitida(' 53val ', MIAS)).toBe(true);
  });

  it('un supervisor sin tiendas no puede crear nada', () => {
    expect(tiendaPermitida('53VAL', [])).toBe(false);
  });

  it('código vacío es no', () => {
    expect(tiendaPermitida('', MIAS)).toBe(false);
  });
});
