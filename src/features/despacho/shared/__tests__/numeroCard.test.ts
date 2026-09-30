import { describe, it, expect } from 'vitest';
import { repartirNumeros, numeroParaUnidadNueva, ordenDeItem, renumerarOrden, renumerarOrdenNacional, claseNacional, etiquetaCard, renumerarSoloSinOrden } from '../numeroCard';

describe('repartirNumeros — EL NÚMERO ES EL QUE ESTÁ IMPRESO', () => {
  it('cada unidad se queda con su seq, sin importar el orden de la lista', () => {
    // El caso reportado en 16PQA el 30/09: el backfill agrega la tarjeta que faltaba AL FINAL,
    // así que el pallet impreso P1 llegaba después del P2. Por posición, el P2 pasaba a llamarse
    // P1 y parecía que habían borrado un pallet. No habían borrado nada.
    expect(repartirNumeros([2, 1])).toEqual([2, 1]);
  });

  it('borrar a un vecino no corre a los que quedan', () => {
    // P1 P2 P3 P4 → se van el 1, el 2 y el 4. El 3 conserva su número.
    expect(repartirNumeros([3])).toEqual([3]);
  });

  it('los huecos son información, no algo que compactar', () => {
    expect(repartirNumeros([2, 5])).toEqual([2, 5]);
  });

  it('LA COLISIÓN QUE ESTO TAPA: la unidad sin seq no puede llevarse un número ya tomado', () => {
    // Con la regla vieja la tercera caía en su POSICIÓN (3) y salía P3 — el mismo id de fila que
    // la segunda (`${orden}${cod}${stamp}${prefijo}`), y en la planilla una pisaba a la otra sin
    // avisar. Ahora toma el menor hueco libre: el 2.
    expect(repartirNumeros([1, 3, null])).toEqual([1, 3, 2]);
  });

  it('varias sin seq toman huecos distintos, en orden', () => {
    expect(repartirNumeros([3, null, null, null])).toEqual([3, 1, 2, 4]);
  });

  it('sin ningún seq se numera 1, 2, 3 — el comportamiento de siempre', () => {
    expect(repartirNumeros([null, undefined, null])).toEqual([1, 2, 3]);
  });

  it('un seq corrupto no rompe la card: se trata como si no tuviera', () => {
    // Nunca debe salir "P0", "P-2" ni "PNaN" en pantalla.
    expect(repartirNumeros([0, -1, NaN, 1.5])).toEqual([1, 2, 3, 4]);
  });

  it('lista vacía', () => {
    expect(repartirNumeros([])).toEqual([]);
  });
});

describe('numeroParaUnidadNueva — al guardar, el número se fija UNA vez', () => {
  it('la unidad nueva se queda con su seq impreso', () => {
    expect(numeroParaUnidadNueva([1, 2], 7)).toBe(7);
  });

  it('sin seq toma el menor hueco, no la posición siguiente', () => {
    // Con hermanas 1 y 3, la posición siguiente sería 3 — el número de la segunda.
    expect(numeroParaUnidadNueva([1, 3], null)).toBe(2);
  });

  it('la primera de su clase, sin seq, es la 1', () => {
    expect(numeroParaUnidadNueva([], undefined)).toBe(1);
  });

  it('las hermanas sin seq también ocupan lugar', () => {
    expect(numeroParaUnidadNueva([null, null], null)).toBe(3);
  });
});

describe('ordenDeItem', () => {
  it('el bulto lleva el número ADELANTE; los demás atrás', () => {
    // Formato histórico que se escribe a Sheets: 3B, pero P3 / C3 / CH3.
    expect(ordenDeItem('Pallet', 3)).toBe('P3');
    expect(ordenDeItem('Contenedor', 3)).toBe('C3');
    expect(ordenDeItem('Chocolate', 3)).toBe('CH3');
    expect(ordenDeItem('Bulto', 3)).toBe('3B');
  });

  it('un tipo desconocido se trata como bulto, igual que antes', () => {
    expect(ordenDeItem('Otro', 1)).toBe('1B');
  });
});

describe('renumerarOrden', () => {
  const it_ = (tipo: string, seq?: number | null) => ({ tipo, seq });
  const seqDe = (i: { seq?: number | null }) => i.seq;

  it('pallets y bultos se renumeran por posición, como siempre', () => {
    const out = renumerarOrden([it_('Pallet'), it_('Pallet'), it_('Bulto')], seqDe);
    expect(out.map(o => o.orden)).toEqual(['P1', 'P2', '1B']);
  });

  it('los CH conservan su seq aunque cambie su posición en la lista', () => {
    const out = renumerarOrden([it_('Chocolate', 3), it_('Chocolate', 7)], seqDe);
    expect(out.map(o => o.orden)).toEqual(['CH3', 'CH7']);
  });

  it('sacar un CH del medio no renumera a los otros', () => {
    // Este es el caso reportado, a nivel de lo que se escribe a Sheets.
    const antes   = renumerarOrden([it_('Chocolate', 1), it_('Chocolate', 2), it_('Chocolate', 3)], seqDe);
    const despues = renumerarOrden([it_('Chocolate', 3)], seqDe);
    expect(antes.map(o => o.orden)).toEqual(['CH1', 'CH2', 'CH3']);
    expect(despues.map(o => o.orden)).toEqual(['CH3']);   // antes daba ['CH1']
  });

  it('cada tipo lleva su propio contador', () => {
    const out = renumerarOrden([it_('Pallet'), it_('Bulto'), it_('Pallet'), it_('Contenedor')], seqDe);
    expect(out.map(o => o.orden)).toEqual(['P1', '1B', 'P2', 'C1']);
  });

  it('UN PALLET CON seq CONSERVA SU NÚMERO, venga en el orden que venga', () => {
    // 16PQA, 30/09: el backfill agregó el P1 impreso DESPUÉS del P2 en la lista. Por posición el
    // P2 pasaba a llamarse P1 y parecía que faltaba un pallet.
    const out = renumerarOrden([it_('Pallet', 2), it_('Pallet', 1)], seqDe);
    expect(out.map(o => o.orden)).toEqual(['P2', 'P1']);
  });

  it('un bulto con seq también — el pedido fue para los dos', () => {
    const out = renumerarOrden([it_('Bulto', 4), it_('Bulto', 2)], seqDe);
    expect(out.map(o => o.orden)).toEqual(['4B', '2B']);
  });

  it('EL ID DE LA PLANILLA Y EL DEL SLOT DICEN LO MISMO', () => {
    // Es el daño de fondo que esto arregla. El id de la fila se arma `${orden}${cod}${stamp}${p}`
    // y el `canonical_id` del slot se arma con el seq. Con 55ITA el 28/09 el slot P1 guardaba
    // 9.357,5 kg y la fila P2 de la planilla guardaba 335,7: la misma unidad con dos nombres.
    const cod = '55ITA', stamp = '28092026';
    const out = renumerarOrden([it_('Pallet', 2), it_('Pallet', 1)], seqDe);
    const idsPlanilla  = out.map(o => `${o.orden}${cod}${stamp}P`);
    const canonicalIds = [2, 1].map(seq => `P${seq}${cod}${stamp}P`);
    expect(idsPlanilla).toEqual(canonicalIds);
  });

  it('un pallet sin seq no se lleva el número de uno que sí lo tiene', () => {
    const out = renumerarOrden([it_('Pallet', 1), it_('Pallet', 3), it_('Pallet', null)], seqDe);
    expect(out.map(o => o.orden)).toEqual(['P1', 'P3', 'P2']);
  });

  it('un CH sin seq cae a su posición ENTRE CH, no a la del arreglo', () => {
    const out = renumerarOrden([it_('Pallet'), it_('Chocolate', null), it_('Chocolate', null)], seqDe);
    expect(out.map(o => o.orden)).toEqual(['P1', 'CH1', 'CH2']);
  });

  it('no muta la lista que recibe', () => {
    const entrada = [it_('Chocolate', 4)];
    const copia = JSON.parse(JSON.stringify(entrada));
    renumerarOrden(entrada, seqDe);
    expect(entrada).toEqual(copia);
  });

  it('conserva el resto de los campos del item', () => {
    const out = renumerarOrden([{ tipo: 'Chocolate', seq: 2, peso: 18, id: 'x' }], seqDe);
    expect(out[0]).toMatchObject({ peso: 18, id: 'x', orden: 'CH2' });
  });
});

describe('etiquetaCard vs ordenDeItem', () => {
  it('el bulto se ve como B3 pero se guarda como 3B — no son el mismo string', () => {
    // Confundirlos cambiaría el ID de las filas de Sheets sin que se note en pantalla.
    expect(etiquetaCard('Bulto', 3)).toBe('B3');
    expect(ordenDeItem('Bulto', 3)).toBe('3B');
  });

  it('para el resto de los tipos coinciden', () => {
    for (const t of ['Pallet', 'Contenedor', 'Chocolate']) {
      expect(etiquetaCard(t, 2)).toBe(ordenDeItem(t, 2));
    }
  });
});

describe('renumerarOrdenNacional', () => {
  const n_ = (pkg: string, seq?: number | null) => ({ pkg, seq });
  const seqDe = (i: { seq?: number | null }) => i.seq;

  it('usa el vocabulario de Nacional, no el de Santiago', () => {
    const out = renumerarOrdenNacional([n_('pallet'), n_('box'), n_('chocolate', 4)], seqDe);
    expect(out.map(o => o.orden)).toEqual(['pallet1', 'bulto1', 'chocolate4']);
  });

  it('el pallet y el bulto también conservan su seq en Nacional', () => {
    // El cambio va en los DOS espejos o queda arreglado en un camino y roto en el otro.
    const out = renumerarOrdenNacional([n_('pallet', 2), n_('pallet', 1), n_('box', 5)], seqDe);
    expect(out.map(o => o.orden)).toEqual(['pallet2', 'pallet1', 'bulto5']);
  });

  it('sacar un CH del medio no renumera a los que quedan', () => {
    const despues = renumerarOrdenNacional([n_('chocolate', 3)], seqDe);
    expect(despues[0].orden).toBe('chocolate3');   // antes daba 'chocolate1'
  });

  it("'box' es bulto — el nombre del paquete en Nacional no coincide con la etiqueta", () => {
    expect(claseNacional('box')).toBe('bulto');
    expect(renumerarOrdenNacional([n_('box')], seqDe)[0].orden).toBe('bulto1');
  });

  it('el número sobrevive el viaje a canonicalId: chocolate3 → CH3', () => {
    // sheetsRegiones.ordenSeq extrae los dígitos finales y arma CH{seq}{cod}{stamp}CH.
    const orden = renumerarOrdenNacional([n_('chocolate', 3)], seqDe)[0].orden;
    expect(orden.match(/(\d+)$/)![1]).toBe('3');
  });
});

describe('renumerarSoloSinOrden — el renumerado del reducer de Nacional', () => {
  const P = (orden: string) => ({ pkg: 'pallet', orden });
  const B = (orden: string) => ({ pkg: 'box', orden });
  const C = (orden: string) => ({ pkg: 'contenedor', orden });
  const CH = (orden: string) => ({ pkg: 'chocolate', orden });

  it('el bug que esto evita: renumerar por posición hacía que el CH3 volviera a llamarse CH1', () => {
    const r = renumerarSoloSinOrden([CH('chocolate3'), CH('chocolate5')]);
    expect(r.map(i => i.orden)).toEqual(['chocolate3', 'chocolate5']);
  });

  it('AHORA TAMPOCO toca pallets, bultos ni contenedores', () => {
    // Desde que el pallet usa su `seq`, renumerarlo acá desharía en la acción siguiente lo que
    // `numerarPorClase` acaba de calcular bien — el mismo bug del CH3, con el P3.
    const r = renumerarSoloSinOrden([P('pallet7'), B('bulto9'), P('pallet2'), C('contenedor4')]);
    expect(r.map(i => i.orden)).toEqual(['pallet7', 'bulto9', 'pallet2', 'contenedor4']);
  });

  it('mezclados: nadie se mueve', () => {
    const r = renumerarSoloSinOrden([P('pallet5'), CH('chocolate3'), B('bulto8'), CH('chocolate5')]);
    expect(r.map(i => i.orden)).toEqual(['pallet5', 'chocolate3', 'bulto8', 'chocolate5']);
  });

  it('lo que NO tiene orden todavía sí lo recibe, por posición', () => {
    // Es provisorio: dura hasta el próximo renumerado con el `seq` a la vista.
    const sinOrden: { pkg: string; orden?: string } = { pkg: 'chocolate' };
    const r = renumerarSoloSinOrden([CH('chocolate3'), sinOrden]);
    expect(r.map(i => i.orden)).toEqual(['chocolate3', 'chocolate2']);
  });

  it('cada clase cuenta su propia posición para lo que no tiene orden', () => {
    const pSin: { pkg: string; orden?: string } = { pkg: 'pallet' };
    const bSin: { pkg: string; orden?: string } = { pkg: 'box' };
    const r = renumerarSoloSinOrden([pSin, bSin]);
    expect(r.map(i => i.orden)).toEqual(['pallet1', 'bulto1']);
  });

  it('al que conserva su número lo devuelve SIN copiarlo', () => {
    const ch = CH('chocolate3');
    expect(renumerarSoloSinOrden([ch])[0]).toBe(ch);
  });

  it('borrar un pallet ya no mueve a los que quedan', () => {
    const antes = [P('pallet1'), P('pallet2'), CH('chocolate4'), P('pallet3')];
    const despues = renumerarSoloSinOrden(antes.filter(i => i.orden !== 'pallet2'));
    expect(despues.map(i => i.orden)).toEqual(['pallet1', 'chocolate4', 'pallet3']);
  });

  it('lista vacía', () => {
    expect(renumerarSoloSinOrden([])).toEqual([]);
  });
});
