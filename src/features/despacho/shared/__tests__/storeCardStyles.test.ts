import { describe, it, expect } from 'vitest';
import { claseTarjetaTienda, claseCodigoTienda, claseEtiquetaTerminada } from '../storeCardStyles';

const estado = (p: Partial<Parameters<typeof claseTarjetaTienda>[0]> = {}) =>
  ({ activa: false, conGuia: false, terminada: false, deHoy: false, ...p });

const VERDE = '#15803D';
const AMBAR = '#B45309';

describe('el bug que motivó esto: terminada tapaba el estado de la guía', () => {
  it('una tienda terminada SIN guía se ve ámbar: le falta la guía', () => {
    expect(claseTarjetaTienda(estado({ terminada: true }))).toContain(AMBAR);
  });

  it('una tienda terminada CON guía se ve verde: la guía manda en el color', () => {
    expect(claseTarjetaTienda(estado({ terminada: true, conGuia: true }))).toContain(VERDE);
  });

  it('y por eso las dos ya NO se ven iguales — que era el problema', () => {
    const soloTerminada = claseTarjetaTienda(estado({ terminada: true }));
    const conGuia       = claseTarjetaTienda(estado({ terminada: true, conGuia: true }));
    expect(soloTerminada).not.toBe(conGuia);
  });

  it('el color contesta "¿tiene guía?" y nada más: con guía es verde, esté o no terminada', () => {
    expect(claseTarjetaTienda(estado({ conGuia: true })))
      .toBe(claseTarjetaTienda(estado({ conGuia: true, terminada: true })));
  });
});

describe('precedencia', () => {
  it('la tienda abierta gana sobre todo', () => {
    const c = claseTarjetaTienda(estado({ activa: true, conGuia: true, terminada: true, deHoy: true }));
    expect(c).toContain('#1E40AF');
    expect(c).not.toContain(VERDE);
  });

  it('con guía gana sobre terminada', () => {
    expect(claseTarjetaTienda(estado({ conGuia: true, terminada: true }))).toContain(VERDE);
  });

  it('terminada gana sobre "es de hoy"', () => {
    expect(claseTarjetaTienda(estado({ terminada: true, deHoy: true }))).toContain(AMBAR);
  });

  it('una tienda de hoy sin nada hecho va en azul tenue', () => {
    expect(claseTarjetaTienda(estado({ deHoy: true }))).toContain('rgba(30,64,175,0.04)');
  });

  it('sin nada, blanca', () => {
    expect(claseTarjetaTienda(estado())).toContain('bg-white');
  });
});

describe('el código de tienda sigue la misma precedencia que la tarjeta', () => {
  it.each([
    [{ activa: true, conGuia: true, terminada: true }, '#1E40AF'],
    [{ conGuia: true, terminada: true },              VERDE],
    [{ terminada: true },                             AMBAR],
    [{},                                              'text-navy'],
  ])('%o → %s', (p, esperado) => {
    expect(claseCodigoTienda(estado(p))).toContain(esperado);
  });
});

describe('la etiqueta ✓ TERMINADA acompaña al color de la tarjeta', () => {
  it('sobre tarjeta ámbar, ámbar', () => {
    expect(claseEtiquetaTerminada(estado({ terminada: true }))).toContain(AMBAR);
  });

  it('sobre tarjeta verde, verde', () => {
    expect(claseEtiquetaTerminada(estado({ terminada: true, conGuia: true }))).toContain(VERDE);
  });
});

describe('contraste: nunca se usan los tonos claros para texto', () => {
  // `success` (#34C759) da ~2:1 y `warn` (#FF9500) ~2.2:1 sobre blanco. No sirven a 11px.
  it.each([
    estado({ conGuia: true }), estado({ terminada: true }), estado({ activa: true }), estado(),
  ])('%o', (e) => {
    const c = claseCodigoTienda(e) + ' ' + claseEtiquetaTerminada(e);
    expect(c).not.toContain('#34C759');
    expect(c).not.toContain('#FF9500');
  });
});
