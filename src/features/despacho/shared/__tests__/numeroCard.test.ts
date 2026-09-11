import { describe, it, expect } from 'vitest';
import { numeroVisibleCard, ordenDeItem, renumerarOrden, renumerarOrdenNacional, claseNacional, etiquetaCard } from '../numeroCard';

describe('numeroVisibleCard', () => {
  it('un CH muestra su seq, no su posición — es el número impreso en la caja', () => {
    // El caso reportado: quedan CH3 y CH5 después de sumar los otros a un pallet.
    // Por posición serían 1 y 2; deben seguir siendo 3 y 5.
    expect(numeroVisibleCard({ esChocolate: true, posicion: 1, seq: 3 })).toBe(3);
    expect(numeroVisibleCard({ esChocolate: true, posicion: 2, seq: 5 })).toBe(5);
  });

  it('borrar un CH no corre a los que quedan', () => {
    // CH1 CH2 CH3 CH4 → se van el 1, el 2 y el 4. El 3 conserva su número.
    const quedan = [{ seq: 3 }];
    const nums = quedan.map((s, i) => numeroVisibleCard({ esChocolate: true, posicion: i + 1, seq: s.seq }));
    expect(nums).toEqual([3]);
  });

  it('un CH que todavía no se imprimió cae a la posición', () => {
    // seq se asigna recién al imprimir: antes de eso no hay número físico con el que coincidir.
    expect(numeroVisibleCard({ esChocolate: true, posicion: 2, seq: null })).toBe(2);
    expect(numeroVisibleCard({ esChocolate: true, posicion: 2, seq: undefined })).toBe(2);
  });

  it('solo los CH — el resto sigue numerando por posición', () => {
    // Pedido explícito: "ojo esto solo con los CH". Pallets y bultos no cambian de comportamiento.
    expect(numeroVisibleCard({ esChocolate: false, posicion: 1, seq: 7 })).toBe(1);
    expect(numeroVisibleCard({ esChocolate: false, posicion: 4, seq: 9 })).toBe(4);
  });

  it('un seq corrupto no rompe la card: cae a la posición', () => {
    // Nunca debe salir "CH0", "CH-2" ni "CHNaN" en pantalla.
    expect(numeroVisibleCard({ esChocolate: true, posicion: 2, seq: 0 })).toBe(2);
    expect(numeroVisibleCard({ esChocolate: true, posicion: 2, seq: -1 })).toBe(2);
    expect(numeroVisibleCard({ esChocolate: true, posicion: 2, seq: NaN })).toBe(2);
    expect(numeroVisibleCard({ esChocolate: true, posicion: 2, seq: 1.5 })).toBe(2);
  });

  it('dos CH pueden quedar con números no consecutivos, y está bien', () => {
    // Es el punto entero: el hueco que deja el que se fue es información, no un error.
    const nums = [{ seq: 2 }, { seq: 5 }].map((s, i) =>
      numeroVisibleCard({ esChocolate: true, posicion: i + 1, seq: s.seq }));
    expect(nums).toEqual([2, 5]);
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
