import { describe, it, expect } from 'vitest';
import { etiquetaDeUso, partirPorBorrable, type UsoTienda } from '../usoDeTienda';

const limpia:  UsoTienda = { total: 0,   enCalendario: false, puedeEliminar: true  };
const agendada: UsoTienda = { total: 0,   enCalendario: true,  puedeEliminar: false };
const usada:   UsoTienda = { total: 123, enCalendario: true,  puedeEliminar: false };

describe('etiquetaDeUso', () => {
  it('sin dato dice "—" y NO la da por borrable', () => {
    // El modo de falla que evita: si la consulta de uso falla, el mapa queda vacío. Tratar eso como
    // "sin uso" ofrecería borrar tiendas con años de despachos encima.
    for (const v of [undefined, null]) {
      expect(etiquetaDeUso(v)).toEqual({ texto: '—', borrable: false, conocido: false });
    }
  });

  it('el caso de 59EGÑ: sin rastro en ningún lado', () => {
    expect(etiquetaDeUso(limpia)).toEqual({ texto: 'sin uso', borrable: true, conocido: true });
  });

  it('cero filas pero nombrada en el calendario no se ofrece como borrable', () => {
    // Decir "0" invitaría a borrar algo que el día de despacho va a pedir.
    expect(etiquetaDeUso(agendada)).toEqual({ texto: 'en calendario', borrable: false, conocido: true });
  });

  it('con historial muestra el número', () => {
    expect(etiquetaDeUso(usada)).toEqual({ texto: '123', borrable: false, conocido: true });
  });
});

describe('partirPorBorrable', () => {
  const tiendas = [
    { codigo: '59EGÑ' }, { codigo: '04PDG' }, { codigo: 'CAJAS' }, { codigo: '59EGN' },
  ];
  const mapa: Record<string, UsoTienda> = {
    '59EGÑ': limpia,
    '04PDG': usada,
    'CAJAS': limpia,
    '59EGN': usada,
  };

  it('separa las que se pueden borrar de las que no', () => {
    const { borrables, conHistorial } = partirPorBorrable(tiendas, mapa);
    expect(borrables.map(t => t.codigo)).toEqual(['59EGÑ', 'CAJAS']);
    expect(conHistorial.map(t => t.codigo)).toEqual(['04PDG', '59EGN']);
  });

  it('una tienda sin dato de uso cae del lado de "no se puede"', () => {
    const { borrables, conHistorial } = partirPorBorrable([{ codigo: 'XXX' }], {});
    expect(borrables).toEqual([]);
    expect(conHistorial.map(t => t.codigo)).toEqual(['XXX']);
  });

  it('respeta el orden de la tabla', () => {
    const alReves = [{ codigo: 'CAJAS' }, { codigo: '59EGÑ' }];
    expect(partirPorBorrable(alReves, mapa).borrables.map(t => t.codigo)).toEqual(['CAJAS', '59EGÑ']);
  });

  it('sin selección no devuelve nada de ningún lado', () => {
    expect(partirPorBorrable([], mapa)).toEqual({ borrables: [], conHistorial: [] });
  });
});
