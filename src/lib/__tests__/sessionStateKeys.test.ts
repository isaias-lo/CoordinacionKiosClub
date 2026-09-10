import { describe, it, expect } from 'vitest';
import { claveSesion, parseClaveSesion, TIPO_NOMBRE } from '../sessionStateKeys';

describe('claveSesion', () => {
  // El nombre es el uso original y tiene cientos de filas: su clave no se mueve.
  it('el nombre conserva la clave tal cual', () => {
    expect(claveSesion('39PSB__juan', TIPO_NOMBRE)).toBe('39PSB__juan');
  });

  it('el batch va con sufijo, así deja de competir por la misma fila', () => {
    expect(claveSesion('39PSB__juan', 'batch')).toBe('39PSB__juan::batch');
  });

  it('un tipo nuevo cualquiera también lleva el suyo', () => {
    expect(claveSesion('39PSB__juan', 'peso')).toBe('39PSB__juan::peso');
  });

  it('un tipo vacío se trata como el nombre', () => {
    expect(claveSesion('39PSB__juan', '')).toBe('39PSB__juan');
    expect(claveSesion('39PSB__juan', '  ')).toBe('39PSB__juan');
  });
});

describe('parseClaveSesion', () => {
  it('deshace el sufijo', () => {
    expect(parseClaveSesion({ state_key: '39PSB__juan::batch', tipo: 'batch' }))
      .toEqual({ stateKey: '39PSB__juan', tipo: 'batch' });
  });

  it('el nombre se lee sin tocar', () => {
    expect(parseClaveSesion({ state_key: '39PSB__juan', tipo: 'P' }))
      .toEqual({ stateKey: '39PSB__juan', tipo: 'P' });
  });

  // Las 25 filas que ya se guardaron con la clave pelada tienen que seguir leyéndose,
  // o se perderían los batches cargados hasta hoy.
  it('una fila vieja sin sufijo se sigue entendiendo', () => {
    expect(parseClaveSesion({ state_key: '17MAI__jhon negrete', tipo: 'batch' }))
      .toEqual({ stateKey: '17MAI__jhon negrete', tipo: 'batch' });
  });

  it('sin tipo se asume el nombre', () => {
    expect(parseClaveSesion({ state_key: '39PSB__juan' }).tipo).toBe(TIPO_NOMBRE);
    expect(parseClaveSesion({ state_key: '39PSB__juan', tipo: null }).tipo).toBe(TIPO_NOMBRE);
  });

  // Solo se quita el sufijo del PROPIO tipo: si no, una clave que casualmente termina en
  // "::algo" quedaría mutilada.
  it('no recorta un sufijo que no es el suyo', () => {
    expect(parseClaveSesion({ state_key: '39PSB__juan::peso', tipo: 'batch' }).stateKey)
      .toBe('39PSB__juan::peso');
  });

  it('ida y vuelta para cualquier tipo', () => {
    for (const tipo of [TIPO_NOMBRE, 'batch', 'peso']) {
      const clave = claveSesion('39PSB__juan', tipo);
      expect(parseClaveSesion({ state_key: clave, tipo })).toEqual({ stateKey: '39PSB__juan', tipo });
    }
  });

  // El nombre del encargado viaja dentro del state_key y puede traer cualquier cosa.
  it('un nombre con dos puntos no rompe la ida y vuelta', () => {
    const raro = '39PSB__ana::maria';
    expect(parseClaveSesion({ state_key: claveSesion(raro, 'batch'), tipo: 'batch' }).stateKey).toBe(raro);
  });
});

// El progreso de Odoo también conserva la clave pelada: son miles de filas desde junio.
// Lo que se separa es la marca "Tienda Terminada", que usa el MISMO `state_key = store_cod` y
// competía por la misma fila. Hoy no se nota porque Odoo está desconectado desde el 04/09 y la
// marca nació el 07/09 — nunca convivieron. Se separa antes de que reconecten Odoo.
describe('convivencia con odoo-progress', () => {
  it('el progreso de Odoo conserva su clave', () => {
    expect(claveSesion('39PSB', 'odoo-progress')).toBe('39PSB');
  });

  it('la marca de tienda terminada se separa', () => {
    expect(claveSesion('39PSB', 'tienda-terminada')).toBe('39PSB::tienda-terminada');
  });

  // El punto entero: con la misma tienda y el mismo día, las dos claves tienen que diferir.
  it('para la misma tienda, las dos claves son distintas', () => {
    expect(claveSesion('39PSB', 'odoo-progress')).not.toBe(claveSesion('39PSB', 'tienda-terminada'));
  });

  it('las marcas ya guardadas sin sufijo se siguen leyendo', () => {
    expect(parseClaveSesion({ state_key: '39PSB', tipo: 'tienda-terminada' }).stateKey).toBe('39PSB');
  });
});
