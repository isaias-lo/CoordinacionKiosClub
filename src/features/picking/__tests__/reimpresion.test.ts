import { describe, it, expect } from 'vitest';
import { slotsYaImpresos, mensajeReimpresion } from '../reimpresion';

describe('slotsYaImpresos — la foto que decide qué etiquetas son copia', () => {
  it('un pallet con código de barras ya se imprimió; sin código, todavía no', () => {
    // canonical_id se asigna en la PRIMERA impresión y nunca más.
    const s = slotsYaImpresos([
      { id: 12718, canonical_id: 'P151SER11092026P' },
      { id: 12733, canonical_id: null },
      { id: 12734, canonical_id: '' },
    ]);
    expect([...s]).toEqual([12718]);
  });

  it('sin pallets, nada es copia', () => {
    expect(slotsYaImpresos([]).size).toBe(0);
  });
});

describe('mensajeReimpresion — lo que se lee antes de reimprimir', () => {
  it('dice que sale una COPIA con el mismo número', () => {
    const m = mensajeReimpresion({ ids: [12718] });
    expect(m).toContain('COPIA');
    expect(m).toContain('#12718');
  });

  it('dice para qué sirve una copia y qué hacer si es otro pallet', () => {
    // El caso real (51SER, 11/09): se reimprimió la etiqueta de un pallet y se pegó en OTRO. Dos
    // pallets físicos con el mismo #12718, y uno de ellos no existía en el sistema.
    const m = mensajeReimpresion({ ids: [12718] });
    expect(m).toMatch(/perdida o dañada/);
    expect(m).toMatch(/otro pallet/i);
    expect(m).toContain('+');
  });

  it('nombra quién y cuándo imprimió, si se sabe', () => {
    const m = mensajeReimpresion({ ids: [12718], hora: '09:48', por: 'Camila González' });
    expect(m).toContain('09:48');
    expect(m).toContain('Camila González');
  });

  it('sin quién ni cuándo, la frase se sostiene igual', () => {
    const m = mensajeReimpresion({ ids: [12718] });
    expect(m).not.toContain('undefined');
    expect(m).not.toContain('null');
  });

  it('con varios pallets, los enumera hasta tres y después los cuenta', () => {
    expect(mensajeReimpresion({ ids: [1, 2] })).toContain('#1, #2');
    expect(mensajeReimpresion({ ids: [1, 2, 3, 4, 5] })).toContain('5 etiquetas');
  });
});
