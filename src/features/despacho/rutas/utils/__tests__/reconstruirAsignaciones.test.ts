import { describe, it, expect } from 'vitest';
import { reconstruirAsignaciones } from '../reconstruirAsignaciones';

describe('reconstruirAsignaciones', () => {
  it('reconstruye patente → tiendas desde los manifiestos guardados', () => {
    const out = reconstruirAsignaciones([
      { patente: 'TYKK42', ruta_tiendas: [
        { store_cod: '16PQA', pallets: 3, bultos: 1, contenedores: 0 },
        { store_cod: '10TRQ', pallets: 2, bultos: 0 },
      ] },
      { patente: 'RZBL80', ruta_tiendas: [{ store_cod: '29CFL', pallets: 2, bultos: 0 }] },
    ]);
    expect(out).toEqual({
      TYKK42: [{ c: '16PQA', p: 3, b: 1, ch: 0 }, { c: '10TRQ', p: 2, b: 0, ch: 0 }],
      RZBL80: [{ c: '29CFL', p: 2, b: 0, ch: 0 }],
    });
  });

  it('acumula y deduplica por cod cuando la patente aparece en varios manifiestos', () => {
    const out = reconstruirAsignaciones([
      { patente: 'RGZJ70', ruta_tiendas: [{ store_cod: '20CTC', pallets: 1, bultos: 0 }] },
      { patente: 'RGZJ70', ruta_tiendas: [
        { store_cod: '20CTC', pallets: 2, bultos: 0 }, // re-guardado con nuevo valor → gana
        { store_cod: '52MUT', pallets: 1, bultos: 0 },
      ] },
    ]);
    expect(out.RGZJ70).toEqual([{ c: '20CTC', p: 2, b: 0, ch: 0 }, { c: '52MUT', p: 1, b: 0, ch: 0 }]);
  });

  it('ignora manifiestos sin patente o sin tiendas, y tolera null', () => {
    expect(reconstruirAsignaciones(null)).toEqual({});
    expect(reconstruirAsignaciones([{ patente: '', ruta_tiendas: [{ store_cod: 'X', pallets: 1 }] }])).toEqual({});
    expect(reconstruirAsignaciones([{ patente: 'AA11', ruta_tiendas: [] }])).toEqual({});
    expect(reconstruirAsignaciones([{ patente: 'AA11', ruta_tiendas: null }])).toEqual({});
  });
});
