import { describe, it, expect } from 'vitest';
import {
  porTienda, porCamion, mergeTablero, patentesDelTablero, aplicarRemoto,
  type TableroPorTienda, type TableroPorCamion,
} from '../tableroSync';

const t = (c: string, p = 1, b = 0, ch = 0) => ({ c, p, b, ch });
const en = (patente: string | null, p = 1, b = 0, ch = 0) => ({ patente, p, b, ch });

describe('porTienda / porCamion — ida y vuelta', () => {
  it('indexa por tienda', () => {
    const tab: TableroPorCamion = { 'AB-1': [t('40LIL'), t('26ALC')], 'CD-2': [t('57CAS', 2)] };
    expect(porTienda(tab)).toEqual({
      '40LIL': en('AB-1'), '26ALC': en('AB-1'), '57CAS': en('CD-2', 2),
    });
  });

  it('vuelve al tablero por patente sin perder nada', () => {
    const tab: TableroPorCamion = { 'AB-1': [t('40LIL'), t('26ALC')], 'CD-2': [t('57CAS')] };
    const vuelta = porCamion(porTienda(tab), patentesDelTablero(tab));
    expect(new Set(Object.keys(vuelta))).toEqual(new Set(['AB-1', 'CD-2']));
    expect(vuelta['AB-1'].map(x => x.c).sort()).toEqual(['26ALC', '40LIL']);
  });

  // Un camión vaciado sigue en el tablero: si desapareciera, parecería que alguien lo apagó.
  it('un camión sin tiendas no desaparece del tablero', () => {
    const vuelta = porCamion({ '40LIL': en('AB-1') }, ['AB-1', 'CD-2']);
    expect(vuelta['CD-2']).toEqual([]);
  });

  it('una tienda sacada (patente null) no aparece en ningún camión', () => {
    const vuelta = porCamion({ '40LIL': en(null) }, ['AB-1']);
    expect(vuelta['AB-1']).toEqual([]);
  });

  it('tolera listas vacías y objetos sin código', () => {
    expect(porTienda({ 'AB-1': [] })).toEqual({});
    expect(porTienda({})).toEqual({});
  });
});

describe('mergeTablero — el caso que motivó todo', () => {
  // Dos equipos trabajando a la vez. Antes ganaba el último en escribir y el otro perdía TODO.
  it('los cambios de los dos equipos conviven', () => {
    const base:   TableroPorTienda = {};
    const local:  TableroPorTienda = { '40LIL': en('AB-1') };            // yo asigné 40LIL
    const remoto: TableroPorTienda = { '26ALC': en('CD-2') };            // el otro asignó 26ALC
    expect(mergeTablero(remoto, local, base)).toEqual({
      '40LIL': en('AB-1'),
      '26ALC': en('CD-2'),
    });
  });

  it('una tienda que NO toqué adopta lo que hizo el otro equipo', () => {
    const base   = { '40LIL': en('AB-1') };
    const local  = { '40LIL': en('AB-1') };          // sin tocar
    const remoto = { '40LIL': en('CD-2') };          // el otro la movió
    expect(mergeTablero(remoto, local, base)['40LIL']).toEqual(en('CD-2'));
  });

  it('una tienda que SÍ moví no se me pisa', () => {
    const base   = { '40LIL': en('AB-1') };
    const local  = { '40LIL': en('EF-3') };          // la moví yo
    const remoto = { '40LIL': en('CD-2') };          // el otro también
    expect(mergeTablero(remoto, local, base)['40LIL']).toEqual(en('EF-3'));
  });

  it('si el otro la sacó y yo no la toqué, se saca', () => {
    const base   = { '40LIL': en('AB-1') };
    const local  = { '40LIL': en('AB-1') };
    expect(mergeTablero({}, local, base)['40LIL']).toBeUndefined();
  });

  it('si el otro la sacó pero yo la moví, se queda donde la puse', () => {
    const base   = { '40LIL': en('AB-1') };
    const local  = { '40LIL': en('CD-2') };
    expect(mergeTablero({}, local, base)['40LIL']).toEqual(en('CD-2'));
  });

  it('una tienda nueva del otro equipo entra aunque yo no la conozca', () => {
    expect(mergeTablero({ '57CAS': en('CD-2') }, {}, {})['57CAS']).toEqual(en('CD-2'));
  });

  // Una tienda vive en UN camión. Por eso el merge es por tienda y no por patente.
  it('nunca deja la misma tienda en dos camiones', () => {
    const out = mergeTablero({ '40LIL': en('CD-2') }, { '40LIL': en('AB-1') }, {});
    const camiones = porCamion(out, ['AB-1', 'CD-2']);
    const veces = Object.values(camiones).flat().filter(x => x.c === '40LIL').length;
    expect(veces).toBe(1);
  });

  it('cambiar solo las cantidades también cuenta como "la toqué"', () => {
    const base   = { '40LIL': en('AB-1', 1) };
    const local  = { '40LIL': en('AB-1', 3) };       // Bodega actualizó los pallets acá
    const remoto = { '40LIL': en('CD-2', 1) };
    expect(mergeTablero(remoto, local, base)['40LIL']).toEqual(en('AB-1', 3));
  });
});

describe('mergeTablero — lo cerrado no se toca', () => {
  it('una tienda de un camión cerrado se queda, venga lo que venga', () => {
    const base   = { '40LIL': en('AB-1') };
    const local  = { '40LIL': en('AB-1') };
    const remoto = { '40LIL': en('CD-2') };          // otro equipo intenta moverla
    const out = mergeTablero(remoto, local, base, cod => cod === '40LIL');
    expect(out['40LIL']).toEqual(en('AB-1'));
  });

  it('tampoco la borra un remoto que no la trae', () => {
    const local = { '40LIL': en('AB-1') };
    const out = mergeTablero({}, local, { '40LIL': en('AB-1') }, () => true);
    expect(out['40LIL']).toEqual(en('AB-1'));
  });
});

describe('patentesDelTablero', () => {
  it('junta las patentes de varios tableros sin repetir', () => {
    expect(patentesDelTablero({ 'AB-1': [] }, { 'AB-1': [], 'CD-2': [] }).sort())
      .toEqual(['AB-1', 'CD-2']);
  });
  it('tolera tableros vacíos', () => {
    expect(patentesDelTablero({}, {})).toEqual([]);
  });
});

// ─── aplicarRemoto: el bug del 04/09 ──────────────────────────────────────────
// El coordinador movía una tienda y volvía sola a la patente del sistema. La causa no era el
// merge —que la conservaba bien— sino que el resultado se marcaba como guardado sin guardarse:
// el servidor nunca se enteraba, y el siguiente evento remoto la revertía.
describe('aplicarRemoto', () => {
  // 23PEÑ: el sistema la puso en RGZJ70; el coordinador la movió a TYKK42.
  const SERVIDOR = { RGZJ70: [{ c: '23PEÑ', p: 2, b: 2, ch: 0 }], TYKK42: [] };
  const MOVIDA   = { RGZJ70: [], TYKK42: [{ c: '23PEÑ', p: 2, b: 2, ch: 0 }] };

  it('conserva el movimiento manual y avisa que hay que guardarlo', () => {
    const r = aplicarRemoto(SERVIDOR, MOVIDA, porTienda(SERVIDOR));
    expect(porTienda(r.merged)['23PEÑ'].patente).toBe('TYKK42');
    expect(r.debePushear).toBe(true);        // ← lo que faltaba: el servidor no lo tiene
  });

  it('la base pasa a ser lo REMOTO, no el resultado del merge', () => {
    const r = aplicarRemoto(SERVIDOR, MOVIDA, porTienda(SERVIDOR));
    expect(r.base['23PEÑ'].patente).toBe('RGZJ70');   // lo que el servidor tiene de verdad
  });

  // La regresión: encadenar dos eventos remotos con el servidor sin actualizar.
  it('un segundo evento remoto NO devuelve la tienda a la patente del sistema', () => {
    const uno = aplicarRemoto(SERVIDOR, MOVIDA, porTienda(SERVIDOR));
    const dos = aplicarRemoto(SERVIDOR, uno.merged, uno.base);
    expect(porTienda(dos.merged)['23PEÑ'].patente).toBe('TYKK42');   // antes volvía a RGZJ70
    expect(dos.debePushear).toBe(true);
  });

  it('sin cambios locales no pide guardar: el servidor ya lo tiene', () => {
    const r = aplicarRemoto(SERVIDOR, SERVIDOR, porTienda(SERVIDOR));
    expect(r.debePushear).toBe(false);
  });

  // El orden de patentes y de tiendas no significa nada: compararlo como texto pediría
  // guardar en cada evento aunque no hubiera cambiado nada.
  it('el orden distinto no cuenta como cambio', () => {
    const otroOrden = { TYKK42: [], RGZJ70: [{ c: '23PEÑ', p: 2, b: 2, ch: 0 }] };
    expect(aplicarRemoto(SERVIDOR, otroOrden, porTienda(SERVIDOR)).debePushear).toBe(false);
  });

  it('adopta lo que movió el otro equipo y no pide guardar por eso', () => {
    const remoto = { RGZJ70: [], TYKK42: [{ c: '23PEÑ', p: 2, b: 2, ch: 0 }] };
    const r = aplicarRemoto(remoto, SERVIDOR, porTienda(SERVIDOR));
    expect(porTienda(r.merged)['23PEÑ'].patente).toBe('TYKK42');
    expect(r.debePushear).toBe(false);
  });

  it('un camión cerrado no lo mueve ni lo remoto', () => {
    const remoto = { RGZJ70: [{ c: '23PEÑ', p: 2, b: 2, ch: 0 }] };
    const r = aplicarRemoto(remoto, MOVIDA, porTienda(remoto), cod => cod === '23PEÑ');
    expect(porTienda(r.merged)['23PEÑ'].patente).toBe('TYKK42');
  });
});
