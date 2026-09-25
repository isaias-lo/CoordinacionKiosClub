import { describe, it, expect } from 'vitest';
import {
  seleccionInicial, visiblesEnTablero, alternar, esFlotaInterna,
  serializarSeleccion, parseSeleccion,
  mergeSeleccion, mismaSeleccion, firmaSeleccion,
  claveCacheSeleccion, leerCacheSeleccion, guardarCacheSeleccion,
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

// ── Sincronizar la selección entre equipos ───────────────────────────────────────────────────
//
// Reportado: "vehículos que aparecen y desaparecen". El canal reemplazaba la selección entera con
// la del otro equipo, así que dos personas eligiendo camiones se pisaban: ganaba la última en
// escribir y a la otra se le movía la flota debajo de las manos.

const S = (...p: string[]) => new Set(p);

describe('mergeSeleccion — dos personas eligiendo camiones a la vez', () => {
  it('lo que agregó el otro equipo entra', () => {
    // Base y local iguales: yo no toqué nada.
    expect([...mergeSeleccion(S('AA', 'BB'), S('AA'), S('AA'))].sort()).toEqual(['AA', 'BB']);
  });

  it('lo que saqué yo NO vuelve, aunque el remoto lo traiga', () => {
    expect([...mergeSeleccion(S('AA', 'BB'), S('AA'), S('AA', 'BB'))]).toEqual(['AA']);
  });

  it('lo que agregué yo NO se pierde, aunque el remoto no lo tenga', () => {
    expect([...mergeSeleccion(S('AA'), S('AA', 'CC'), S('AA'))].sort()).toEqual(['AA', 'CC']);
  });

  it('el caso del reporte: uno agrega y el otro saca, y quedan los dos cambios', () => {
    // Base compartida: AA y BB. Yo agrego CC; el otro sacó BB y ya lo empujó.
    const out = mergeSeleccion(/* remoto */ S('AA'), /* local */ S('AA', 'BB', 'CC'), /* base */ S('AA', 'BB'));
    expect([...out].sort()).toEqual(['AA', 'CC']);   // BB se fue (él), CC se queda (yo)
  });

  it('sin cambios de nadie, no pasa nada', () => {
    expect([...mergeSeleccion(S('AA', 'BB'), S('AA', 'BB'), S('AA', 'BB'))].sort()).toEqual(['AA', 'BB']);
  });

  it('vaciar la selección en el otro equipo se respeta', () => {
    expect([...mergeSeleccion(S(), S('AA'), S('AA'))]).toEqual([]);
  });
});

describe('mismaSeleccion / firmaSeleccion', () => {
  it('el orden no importa', () => {
    expect(mismaSeleccion(S('BB', 'AA'), S('AA', 'BB'))).toBe(true);
    expect(firmaSeleccion(S('BB', 'AA'))).toBe(firmaSeleccion(S('AA', 'BB')));
  });

  it('distinto tamaño o distinta patente, no', () => {
    expect(mismaSeleccion(S('AA'), S('AA', 'BB'))).toBe(false);
    expect(mismaSeleccion(S('AA'), S('BB'))).toBe(false);
  });

  it('la firma sirve de corta-ecos: el propio push vuelve idéntico', () => {
    expect(firmaSeleccion(S('AA', 'BB'))).toBe('AA,BB');
  });
});

describe('copia local de la selección — contra el parpadeo al abrir', () => {
  /** localStorage de mentira: el test no depende del navegador. */
  const almacen = () => {
    const datos = new Map<string, string>();
    return {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => { datos.set(k, v); },
      _datos: datos,
    };
  };

  it('la clave lleva el día: otro día no hereda la selección', () => {
    expect(claveCacheSeleccion('seco', '2026-09-24')).toBe('flota_sel:seco:2026-09-24');
    expect(claveCacheSeleccion('seco', '2026-09-24'))
      .not.toBe(claveCacheSeleccion('seco', '2026-09-25'));
    expect(claveCacheSeleccion('seco', '2026-09-24'))
      .not.toBe(claveCacheSeleccion('congelados', '2026-09-24'));
  });

  it('guarda y vuelve a leer la misma selección', () => {
    const st = almacen();
    guardarCacheSeleccion('seco', '2026-09-24', S('AA', 'BB'), st);
    expect([...leerCacheSeleccion('seco', '2026-09-24', st)!].sort()).toEqual(['AA', 'BB']);
  });

  it('sin copia devuelve null — ahí manda seleccionInicial, como antes', () => {
    expect(leerCacheSeleccion('seco', '2026-09-25', almacen())).toBeNull();
  });

  it('una copia corrupta no rompe nada: devuelve null', () => {
    const st = almacen();
    st.setItem(claveCacheSeleccion('seco', '2026-09-24'), '{no es json');
    expect(leerCacheSeleccion('seco', '2026-09-24', st)).toBeNull();
  });

  it('sin almacén (SSR, modo privado) tampoco rompe', () => {
    expect(leerCacheSeleccion('seco', '2026-09-24', null)).toBeNull();
    expect(() => guardarCacheSeleccion('seco', '2026-09-24', S('AA'), null)).not.toThrow();
  });

  it('una selección vacía se guarda como vacía, no como "sin dato"', () => {
    // Vaciar la flota de un tablero es una decisión; no puede leerse como "nunca elegí".
    const st = almacen();
    guardarCacheSeleccion('seco', '2026-09-24', S(), st);
    expect(leerCacheSeleccion('seco', '2026-09-24', st)).toEqual(new Set());
  });
});
