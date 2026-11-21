import { describe, it, expect } from 'vitest';
import {
  esAbierta, estadoParaTienda, comentariosParaTienda, preguntasSinResponder, haceCuanto,
  historialParaTienda,
} from '../conversacion';
import type { ComentarioMant, TipoComentario } from '../../tipos';

let n = 0;
function c(solicitudId: string, tipo: TipoComentario, creadoEn: string, texto: string = tipo): ComentarioMant {
  return { id: ++n, solicitudId, tipo, texto, autorNombre: null, creadoEn };
}

describe('esAbierta', () => {
  it('cerrada y descartada terminan; el resto sigue abierto', () => {
    expect(esAbierta('cerrada')).toBe(false);
    expect(esAbierta('descartada')).toBe(false);
    expect(esAbierta('pendiente')).toBe(true);
    expect(esAbierta('programada')).toBe(true);
    expect(esAbierta('no_resuelta')).toBe(true); // se vuelve a programar
  });
});

describe('estadoParaTienda', () => {
  it('traduce cada estado', () => {
    expect(estadoParaTienda('pendiente').texto).toBe('Pendiente');
    expect(estadoParaTienda('en_ejecucion').texto).toBe('En ejecución');
    expect(estadoParaTienda('cerrada')).toEqual({ texto: 'Cerrada', tono: 'verde' });
  });

  it('«Por enviar» le gana a cualquier estado', () => {
    expect(estadoParaTienda('pendiente', { porEnviar: true })).toEqual({ texto: 'Por enviar', tono: 'ambar' });
  });
});

describe('comentariosParaTienda', () => {
  it('saca las notas para el técnico', () => {
    const lista = [c('a', 'pregunta', '1'), c('a', 'nota_mantencion', '2'), c('a', 'respuesta', '3')];
    expect(comentariosParaTienda(lista).map(x => x.tipo)).toEqual(['pregunta', 'respuesta']);
  });
});

describe('preguntasSinResponder', () => {
  it('una pregunta sin respuesta posterior está pendiente', () => {
    const p = c('a', 'pregunta', '2026-11-20T10:00:00Z');
    expect(preguntasSinResponder([p])).toEqual([p]);
  });

  it('una respuesta posterior la responde', () => {
    expect(preguntasSinResponder([
      c('a', 'pregunta', '2026-11-20T10:00:00Z'),
      c('a', 'respuesta', '2026-11-20T11:00:00Z'),
    ])).toEqual([]);
  });

  it('una respuesta ANTERIOR no responde una pregunta nueva', () => {
    const nueva = c('a', 'pregunta', '2026-11-20T12:00:00Z');
    expect(preguntasSinResponder([
      c('a', 'pregunta', '2026-11-20T10:00:00Z'),
      c('a', 'respuesta', '2026-11-20T11:00:00Z'),
      nueva,
    ])).toEqual([nueva]);
  });

  it('la respuesta de otra solicitud no cuenta', () => {
    const p = c('a', 'pregunta', '2026-11-20T10:00:00Z');
    expect(preguntasSinResponder([p, c('b', 'respuesta', '2026-11-20T11:00:00Z')])).toEqual([p]);
  });

  it('una nota de Mantención no responde nada', () => {
    const p = c('a', 'pregunta', '2026-11-20T10:00:00Z');
    expect(preguntasSinResponder([p, c('a', 'nota_mantencion', '2026-11-20T11:00:00Z')])).toEqual([p]);
  });

  it('vienen de la más vieja a la más nueva', () => {
    const p2 = c('b', 'pregunta', '2026-11-21T10:00:00Z');
    const p1 = c('a', 'pregunta', '2026-11-20T10:00:00Z');
    expect(preguntasSinResponder([p2, p1])).toEqual([p1, p2]);
  });
});

describe('haceCuanto', () => {
  const ahora = new Date('2026-11-21T15:00:00Z'); // 12:00 en Chile

  it('cuenta días de Chile, no horas', () => {
    expect(haceCuanto('2026-11-21T04:00:00Z', ahora)).toBe('hoy');   // 01:00 Chile del 21
    expect(haceCuanto('2026-11-21T02:00:00Z', ahora)).toBe('ayer');  // 23:00 Chile del 20
    expect(haceCuanto('2026-11-18T15:00:00Z', ahora)).toBe('hace 3 días');
  });

  it('una fecha inválida no inventa nada', () => {
    expect(haceCuanto('no', ahora)).toBe('');
  });
});

describe('historialParaTienda', () => {
  const ahora = new Date('2026-11-21T15:00:00Z');
  const sol = { creadaEn: '2026-11-19T15:00:00Z', estado: 'pendiente' as const, urgencia: null };

  it('sin clasificar: Mantención la está revisando', () => {
    expect(historialParaTienda(sol, [], ahora)).toEqual([
      'Ingresada por la tienda · hace 2 días',
      'Mantención la está revisando para asignarle urgencia',
    ]);
  });

  it('clasificada y pendiente: espera que la programen', () => {
    expect(historialParaTienda({ ...sol, urgencia: 'media' }, [], ahora).at(-1))
      .toBe('En espera de que Mantención la programe');
  });

  it('con una pregunta abierta, lo último es que esperan su respuesta', () => {
    const h = historialParaTienda(sol, [c('a', 'pregunta', '2026-11-20T10:00:00Z', '¿Desde cuándo?')], ahora);
    expect(h).toEqual([
      'Ingresada por la tienda · hace 2 días',
      'Mantención pregunta: ¿Desde cuándo?',
      'Mantención espera tu respuesta',
    ]);
  });

  it('no muestra las notas para el técnico', () => {
    const h = historialParaTienda(sol, [c('a', 'nota_mantencion', '2026-11-20T10:00:00Z', 'llevar escalera')], ahora);
    expect(h.join(' ')).not.toMatch(/escalera/);
  });
});

describe('solicitud unida a otra', () => {
  it('la tienda la ve «Unida a otra», no «Descartada»', () => {
    expect(estadoParaTienda('descartada', { unida: true })).toEqual({ texto: 'Unida a otra', tono: 'gris' });
  });

  it('el historial explica que se resuelve junto con la otra', () => {
    const h = historialParaTienda(
      { creadaEn: '2026-11-21T13:00:00Z', estado: 'descartada', urgencia: null, duplicadaDe: 'x' }, [],
      new Date('2026-11-21T15:00:00Z'));
    expect(h.at(-1)).toMatch(/unió a otra solicitud/);
  });
});
