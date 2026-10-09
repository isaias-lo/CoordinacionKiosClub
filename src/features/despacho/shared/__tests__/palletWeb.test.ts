import { describe, it, expect } from 'vitest';
import { esSinPesar, esPalletWeb } from '../sinPesar';
import { etiquetaDeUnidad } from '../adquisicion';
import { avisoDeUnidad } from '../avisoUnidadEscaneada';
import { fusionarConPrevio, esReingreso } from '../itemPorUnidad';

// «Pallet web» (Isaias, 9 oct 2026): un pallet del día que sale sin pesar, a propósito.
describe('pallet web', () => {
  const web = { peso: 0, tipo: 'Pallet', pkg: 'pallet', palletWeb: true };

  it('no queda marcado «sin pesar»: nadie lo va a pesar', () => {
    expect(esPalletWeb(web)).toBe(true);
    expect(esSinPesar(web)).toBe(false);
    // un pallet común con peso 0 sí está esperando la balanza
    expect(esSinPesar({ peso: 0, tipo: 'Pallet' })).toBe(true);
  });

  it('la tarjeta dice «Pallet web», no «0 kg»', () => {
    expect(etiquetaDeUnidad(web)).toBe('Pallet web');
    expect(etiquetaDeUnidad({ tipo: 'Pallet', pkg: 'pallet' })).toBeNull();
  });

  it('escanearlo no avisa «ya pesado · 0 kg»', () => {
    const a = avisoDeUnidad(web);
    expect(a.advertir).toBe(false);
    expect(a.texto).toBe('Pallet web, sin peso');
  });

  it('pesarlo después lo convierte en un pallet común, sin contarlo como reingreso', () => {
    const previo = { id: 'x', orden: 'pallet2', pickingSlotId: 7, peso: 0, palletWeb: true };
    const nuevo: { id: string; orden: string; pickingSlotId: number; peso: number; palletWeb?: boolean } =
      { id: 'y', orden: 'pallet9', pickingSlotId: 7, peso: 310 };
    const out = fusionarConPrevio(previo, nuevo);
    expect(out.palletWeb).toBeUndefined();
    expect(out.peso).toBe(310);
    expect(out.orden).toBe('pallet2');
    expect(esReingreso(previo)).toBe(false);
  });
});
