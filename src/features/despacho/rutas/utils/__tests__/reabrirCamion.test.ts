import { describe, it, expect } from 'vitest';
import {
  parseEstadoCierres, serializeEstadoCierres, mergeEstadoCierres, marcarCerradas, marcarReabierta,
  firmaEstadoCierres, parseCerradas,
} from '../cierrePorVehiculo';
import { siguienteCodigoLibre } from '../codigoRuta';
import { pedidoReabrirCamion, avisoNoReabierto } from '../reabrirCamion';

const T1 = '2026-11-16T15:00:00.000Z';
const T2 = '2026-11-16T15:05:00.000Z';
const T3 = '2026-11-16T15:10:00.000Z';
const vacio = { patentes: new Set<string>(), marcas: {} };

describe('estado de cierres con reabrir', () => {
  it('lee el formato viejo (solo patentes) como cerradas', () => {
    expect([...parseEstadoCierres({ patentes: ['tykk42'] }).patentes]).toEqual(['TYKK42']);
  });

  it('reabrir saca la patente y deja la marca', () => {
    const e = marcarReabierta(marcarCerradas(vacio, ['TYKK42'], T1), 'tykk42', T2);
    expect(e.patentes.has('TYKK42')).toBe(false);
    expect(e.marcas.TYKK42).toEqual({ c: T1, r: T2 });
  });

  it('el eco viejo del otro equipo NO vuelve a cerrar lo reabierto', () => {
    const local = marcarReabierta(marcarCerradas(vacio, ['TYKK42'], T1), 'TYKK42', T2);
    const ecoViejo = parseEstadoCierres(serializeEstadoCierres(marcarCerradas(vacio, ['TYKK42'], T1)));
    expect(mergeEstadoCierres(local, ecoViejo).patentes.has('TYKK42')).toBe(false);
    expect(mergeEstadoCierres(ecoViejo, local).patentes.has('TYKK42')).toBe(false);
  });

  it('tampoco el eco de la versión anterior, que no trae marcas', () => {
    const local = marcarReabierta(marcarCerradas(vacio, ['TYKK42'], T1), 'TYKK42', T2);
    const legado = parseEstadoCierres({ patentes: ['TYKK42'] });
    expect(mergeEstadoCierres(local, legado).patentes.has('TYKK42')).toBe(false);
  });

  it('volver a cerrar después de reabrir gana, y viaja así', () => {
    const e = marcarCerradas(marcarReabierta(marcarCerradas(vacio, ['TYKK42'], T1), 'TYKK42', T2), ['TYKK42'], T3);
    expect(e.patentes.has('TYKK42')).toBe(true);
    const otro = marcarReabierta(marcarCerradas(vacio, ['TYKK42'], T1), 'TYKK42', T2);
    expect(mergeEstadoCierres(otro, parseEstadoCierres(serializeEstadoCierres(e))).patentes.has('TYKK42')).toBe(true);
  });

  it('el cierre de OTRO camión sigue siendo unión', () => {
    const a = marcarCerradas(vacio, ['TYKK42'], T1);
    const b = marcarCerradas(vacio, ['VRYL52'], T2);
    expect([...mergeEstadoCierres(a, b).patentes].sort()).toEqual(['TYKK42', 'VRYL52']);
  });

  it('el payload sigue trayendo `patentes` para lo que ya lo leía', () => {
    const e = marcarReabierta(marcarCerradas(vacio, ['TYKK42', 'VRYL52'], T1), 'TYKK42', T2);
    expect([...parseCerradas(serializeEstadoCierres(e))]).toEqual(['VRYL52']);
  });

  it('la firma cambia al reabrir y al volver a cerrar', () => {
    const c = marcarCerradas(vacio, ['TYKK42'], T1);
    const r = marcarReabierta(c, 'TYKK42', T2);
    const c2 = marcarCerradas(r, ['TYKK42'], T3);
    expect(new Set([firmaEstadoCierres(c), firmaEstadoCierres(r), firmaEstadoCierres(c2)]).size).toBe(3);
  });

  it('ignora marcas mal formadas', () => {
    const e = parseEstadoCierres({ patentes: ['TYKK42'], marcas: { TYKK42: 'x', '': { c: T1 }, VRYL52: { c: 5 } } });
    expect([...e.patentes]).toEqual(['TYKK42']);
    expect(e.marcas).toEqual({});
  });
});

describe('siguienteCodigoLibre', () => {
  it('uno más que el mayor, aunque haya huecos', () => {
    // -01 se reabrió y quedó libre; contar daría -03, que ya es de otro camión.
    expect(siguienteCodigoLibre('2026-11-16', ['RUTA-161126-02', 'RUTA-161126-03'])).toBe('RUTA-161126-04');
  });
  it('sin nada guardado, -01', () => {
    expect(siguienteCodigoLibre('2026-11-16', [])).toBe('RUTA-161126-01');
  });
  it('no mezcla otros días ni códigos raros', () => {
    expect(siguienteCodigoLibre('2026-11-16', ['RUTA-151126-09', null, 'RUTA-161126-x', 'RUTA-161126-01'])).toBe('RUTA-161126-02');
  });
});

describe('textos de reabrir', () => {
  it('la pregunta dice qué se anula y con qué botón', () => {
    const p = pedidoReabrirCamion('TYKK42', 3);
    expect(p.titulo).toBe('¿Reabrir TYKK42?');
    expect(p.aceptar).toBe('Reabrir TYKK42');
    expect(p.detalle).toMatch(/3 tiendas/);
    expect(p.detalle).toMatch(/QR/);
    expect(pedidoReabrirCamion('TYKK42', 1).detalle).toMatch(/1 tienda\)/);
  });
  it('el aviso nombra la patente y el motivo', () => {
    expect(avisoNoReabierto('TYKK42', 'El camión ya salió.')).toBe('No se reabrió TYKK42: El camión ya salió.');
  });
});
