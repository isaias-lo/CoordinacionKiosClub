import { describe, it, expect } from 'vitest';
import { tiendasDelPool, POOLS, poolDeGrupo } from '../poolsSeparados';

// ── LAS DOS TIENDAS INVISIBLES DEL 12/10/2026 ─────────────────────────────────────────────────
//
// La pestaña de 2ª VUELTA nunca recibió `pool` ni `onPool`. Sin `onPool` el selector no se dibuja,
// y `poolScope` tenía un valor POR DEFECTO —'rm-costa'—, así que la vista filtraba a RM/Costa y
// escondía el resto sin forma de llegar.
//
// 39PSB y 51SER —las dos de La Serena, grupo `fal`— estaban pendientes desde el viernes 9 y eran
// INALCANZABLES: en pantalla decía «2 pendientes en el otro», y no había otro al que ir.

const GRUPOS: Record<string, string> = {
  '39PSB': 'fal', '51SER': 'fal',      // Regiones
  '01TPS': 'rm',  '08RNC': 'costa',    // RM / Costa
  '99XXX': '',                          // sin grupo definido
};
const grupoDe = (c: string) => GRUPOS[c];
const tiendas = Object.keys(GRUPOS).map(c => ({ c }));

describe('tiendasDelPool', () => {
  it('EL CASO: sin scope se muestra TODO, no se filtra a un default', () => {
    // Es el lado seguro. Una vista a la que se le olvide el selector enseña de más —que se ve y
    // se corrige— en vez de esconder, que no se ve.
    expect(tiendasDelPool(tiendas, grupoDe).map(t => t.c)).toEqual(Object.keys(GRUPOS));
  });

  it('con scope REGIONES salen las dos de La Serena', () => {
    expect(tiendasDelPool(tiendas, grupoDe, 'regiones').map(t => t.c)).toEqual(['39PSB', '51SER']);
  });

  it('con scope RM/COSTA salen las de Santiago y Costa', () => {
    expect(tiendasDelPool(tiendas, grupoDe, 'rm-costa').map(t => t.c)).toEqual(['01TPS', '08RNC', '99XXX']);
  });

  it('NINGUNA TIENDA QUEDA FUERA DE TODOS LOS POOLS', () => {
    // La propiedad que de verdad importa: recorriendo los pools se llega a todas. Si alguna no
    // apareciera en ninguno, sería invisible igual que 39PSB y 51SER.
    const vistas = new Set(POOLS.flatMap(p => tiendasDelPool(tiendas, grupoDe, p.id).map(t => t.c)));
    expect(vistas).toEqual(new Set(Object.keys(GRUPOS)));
  });

  it('y ninguna aparece en DOS pools a la vez', () => {
    const cuenta = new Map<string, number>();
    for (const p of POOLS) for (const t of tiendasDelPool(tiendas, grupoDe, p.id)) {
      cuenta.set(t.c, (cuenta.get(t.c) ?? 0) + 1);
    }
    expect([...cuenta.values()].every(n => n === 1)).toBe(true);
  });

  it('una sin grupo cae en RM/Costa, que es donde el registro la escribe', () => {
    expect(poolDeGrupo('')).toBe('rm-costa');
    expect(poolDeGrupo(undefined)).toBe('rm-costa');
  });

  it('sin tiendas no rompe', () => {
    expect(tiendasDelPool([], grupoDe)).toEqual([]);
    expect(tiendasDelPool([], grupoDe, 'regiones')).toEqual([]);
  });
});
