import { describe, it, expect } from 'vitest';
import { tabsPermitidos } from '../tabsPermitidos';

const SECO = [
  { label: 'Nacional',   href: '/despacho/regiones'  },
  { label: 'RM / Costa', href: '/despacho/santiago'  },
  { label: 'Actividad',  href: '/despacho/actividad' },
];

const CONGELADOS = [
  { label: 'Nacional',   href: '/despacho/congelados'          },
  { label: 'RM / Costa', href: '/despacho/congelados/santiago' },
];

/** Los permisos REALES de los cuatro usuarios con rol `supervisor-picking` (leídos el 24/09). */
const SUPERVISOR_PICKING = ['/picking', '/perfil', '/despacho/regiones', '/despacho/congelados'];

const etiquetas = (t: { label: string }[]) => t.map(x => x.label);

describe('tabsPermitidos — no dibujar una puerta cerrada', () => {
  it('el supervisor de Picking solo ve Nacional en el seco', () => {
    // Era el bug: veía las tres, tocaba "RM / Costa" y el middleware lo sacaba a /picking.
    expect(etiquetas(tabsPermitidos(SECO, SUPERVISOR_PICKING))).toEqual(['Nacional']);
  });

  it('a ese rol "Actividad" también lo expulsaba, y tampoco se dibuja', () => {
    expect(etiquetas(tabsPermitidos(SECO, SUPERVISOR_PICKING))).not.toContain('Actividad');
  });

  it('en congelados ve Nacional pero no RM / Costa', () => {
    expect(etiquetas(tabsPermitidos(CONGELADOS, SUPERVISOR_PICKING))).toEqual(['Nacional']);
  });

  it('quien tiene las dos rutas sigue viendo las dos', () => {
    const asistente = ['/despacho', '/despacho/regiones', '/despacho/santiago', '/perfil'];
    expect(etiquetas(tabsPermitidos(SECO, asistente))).toEqual(['Nacional', 'RM / Costa', 'Actividad']);
    // 'Actividad' entra por el prefijo de '/despacho', que este rol sí tiene.
  });

  it('el admin (comodín) ve todo', () => {
    expect(tabsPermitidos(SECO, ['*'])).toHaveLength(3);
    expect(tabsPermitidos(CONGELADOS, ['*'])).toHaveLength(2);
  });

  it('mientras el perfil no cargó se muestran todas: la falta de dato no esconde pantallas', () => {
    expect(tabsPermitidos(SECO, undefined)).toHaveLength(3);
    expect(tabsPermitidos(SECO, null)).toHaveLength(3);
    expect(tabsPermitidos(SECO, [])).toHaveLength(3);
  });

  it('devuelve una copia: no se muta la constante del módulo', () => {
    expect(tabsPermitidos(SECO, undefined)).not.toBe(SECO);
  });
});
