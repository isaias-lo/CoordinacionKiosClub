import { describe, it, expect } from 'vitest';
import {
  seleccionInicial, visiblesEnTablero, alternar, esFlotaInterna,
  serializarSeleccion, parseSeleccion,
} from '../flotaPorTablero';
import type { Vehiculo } from '../../data/flota';

// La flota real (flota_vehiculos, activo = true) al momento del reporte.
const v = (p: string, empresa: string, on: boolean): Vehiculo =>
  ({ p, empresa, on, c: 10, ch: '', t: '' } as unknown as Vehiculo);

const FLOTA: Vehiculo[] = [
  v('TYKK42', 'Luis Fica', true),  v('VRYL52', 'Luis Fica', true),
  v('VSDR91', 'Luis Fica', true),  v('VXSX43', 'Luis Fica', true),
  v('VYJL23', 'Luis Fica', true),  v('PTFZ21', 'Luis Fica', false),
  v('PKZW16', 'Kios Club', true),  v('RGZJ70', 'Kios Club', true),
  v('RDGK43', 'Kios Club', false), v('RWVD46', 'Kios Club', false),
  v('DPFP98', 'Falabella', true),
];

describe('esFlotaInterna', () => {
  it('Kios Club es la flota propia', () => {
    expect(esFlotaInterna('Kios Club')).toBe(true);
    expect(esFlotaInterna('  kios club ')).toBe(true);
  });
  it('las externas no', () => {
    for (const e of ['Luis Fica', 'Falabella', 'Ortiz', '', null]) expect(esFlotaInterna(e)).toBe(false);
  });
});

describe('seleccionInicial', () => {
  it('congelados arranca con la flota interna', () => {
    expect(seleccionInicial(FLOTA, 'congelados').sort()).toEqual(['PKZW16', 'RGZJ70']);
  });

  it('el seco arranca con las externas', () => {
    expect(seleccionInicial(FLOTA, 'seco').sort())
      .toEqual(['DPFP98', 'TYKK42', 'VRYL52', 'VSDR91', 'VXSX43', 'VYJL23']);
  });

  it('la semilla son los que YA estaban activos: el primer día no cambia lo que estaba a la vista', () => {
    expect(seleccionInicial(FLOTA, 'seco')).not.toContain('PTFZ21');      // no estaba activo
    expect(seleccionInicial(FLOTA, 'congelados')).not.toContain('RDGK43'); // idem
  });

  it('los dos tableros no se pisan: ningún camión queda en ambos por defecto', () => {
    const a = new Set(seleccionInicial(FLOTA, 'seco'));
    expect(seleccionInicial(FLOTA, 'congelados').some(p => a.has(p))).toBe(false);
  });
});

describe('visiblesEnTablero — el bug reportado', () => {
  it('apagar los 5 de Luis Fica en CONGELADOS no los saca de DESPACHO', () => {
    const seco = new Set(seleccionInicial(FLOTA, 'seco'));
    let cong  = new Set(seleccionInicial(FLOTA, 'congelados'));
    // En congelados se agregan los de Luis Fica y después se sacan.
    for (const p of ['TYKK42', 'VRYL52', 'VSDR91', 'VXSX43', 'VYJL23']) cong = alternar(cong, p);
    for (const p of ['TYKK42', 'VRYL52', 'VSDR91', 'VXSX43', 'VYJL23']) cong = alternar(cong, p);
    // Despacho intacto.
    expect(visiblesEnTablero(FLOTA, seco).map(x => x.p)).toContain('TYKK42');
    expect(visiblesEnTablero(FLOTA, cong).map(x => x.p)).toEqual(['PKZW16', 'RGZJ70']);
  });

  it('la selección MANDA: un camión que no estaba activo se puede usar acá sin desbloquear nada', () => {
    // Antes `on` hacía de candado y RWVD46 quedaba tachado e intocable en los dos tableros. Pero
    // `on` nunca significó "operativo" — significa "lo estoy usando", que es esto mismo.
    const sel = new Set(['PTFZ21', 'TYKK42']);
    expect(visiblesEnTablero(FLOTA, sel).map(x => x.p).sort()).toEqual(['PTFZ21', 'TYKK42']);
  });

  it('el caso RWVD46: elegirlo en congelados alcanza para que aparezca', () => {
    const cong = alternar(new Set(seleccionInicial(FLOTA, 'congelados')), 'RWVD46');
    expect(visiblesEnTablero(FLOTA, cong).map(x => x.p)).toContain('RWVD46');
  });

  it('y elegirlo en congelados NO lo mete en despacho', () => {
    const cong = alternar(new Set(seleccionInicial(FLOTA, 'congelados')), 'RWVD46');
    const seco = new Set(seleccionInicial(FLOTA, 'seco'));
    expect(visiblesEnTablero(FLOTA, cong).map(x => x.p)).toContain('RWVD46');
    expect(visiblesEnTablero(FLOTA, seco).map(x => x.p)).not.toContain('RWVD46');
  });

  it('sin selección se cae al comportamiento de antes: los activos', () => {
    // Que la falta de dato esconda camiones sería peor que el bug que se arregla.
    expect(visiblesEnTablero(FLOTA, undefined)).toHaveLength(8);
  });

  it('con la selección vacía no se ve ninguno: es una elección, no un dato faltante', () => {
    expect(visiblesEnTablero(FLOTA, new Set())).toEqual([]);
  });
});

describe('alternar', () => {
  it('agrega y saca', () => {
    expect([...alternar(new Set(['A']), 'B')].sort()).toEqual(['A', 'B']);
    expect([...alternar(new Set(['A', 'B']), 'A')]).toEqual(['B']);
  });
  it('no muta el set original', () => {
    const s = new Set(['A']);
    alternar(s, 'B');
    expect([...s]).toEqual(['A']);
  });
});

describe('guardar y leer', () => {
  it('el orden es estable: reordenar no genera un cambio falso', () => {
    expect(serializarSeleccion(new Set(['B', 'A']))).toEqual({ patentes: ['A', 'B'] });
  });

  it('vuelve tal cual', () => {
    expect(parseSeleccion({ patentes: ['A', 'B'] })).toEqual(new Set(['A', 'B']));
  });

  it('null cuando nunca se guardó: ahí manda la preselección', () => {
    for (const x of [null, undefined, {}, { patentes: 'no-es-array' }]) expect(parseSeleccion(x)).toBeNull();
  });

  it('una selección vacía guardada NO es lo mismo que no haber guardado', () => {
    expect(parseSeleccion({ patentes: [] })).toEqual(new Set());
  });

  it('descarta basura dentro del array', () => {
    expect(parseSeleccion({ patentes: ['A', '', null, 7, 'B'] })).toEqual(new Set(['A', 'B']));
  });
});
