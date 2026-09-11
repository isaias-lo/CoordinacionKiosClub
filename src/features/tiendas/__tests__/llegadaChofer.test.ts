import { describe, it, expect } from 'vitest';
import { rutaDeTienda, eventoLlegada, eventoSalida } from '../llegadaChofer';

const rutas = [
  { id: 10, estado: 'pendiente', ruta_tiendas: [{ store_cod: '16PQA' }, { store_cod: '20CTC' }] },
  { id: 11, estado: 'en_camino', ruta_tiendas: [{ store_cod: '13PIE' }, { store_cod: '16PQA' }] },
];

describe('rutaDeTienda — a qué ruta del chofer pertenece la tienda escaneada', () => {
  it('encuentra la ruta que incluye esa tienda', () => {
    expect(rutaDeTienda(rutas, '20CTC')).toBe(10);
  });

  it('si la tienda está en dos rutas, prefiere la que está en camino', () => {
    // Un camión que hace dos vueltas: la llegada es de la vuelta que salió.
    expect(rutaDeTienda(rutas, '16PQA')).toBe(11);
  });

  it('compara el código sin importar mayúsculas ni espacios', () => {
    expect(rutaDeTienda(rutas, ' 13pie ')).toBe(11);
  });

  it('si la tienda no está en ninguna ruta del chofer, no inventa una', () => {
    expect(rutaDeTienda(rutas, '99ZZZ')).toBeNull();
    expect(rutaDeTienda([], '16PQA')).toBeNull();
  });
});

describe('eventoLlegada', () => {
  it('guarda la hora de la FOTO del sello, no la del escaneo', () => {
    // La foto se saca al llegar; el escaneo viene segundos después.
    const e = eventoLlegada({ rutaId: 11, storeCod: '16PQA', horaISO: '2026-09-11T12:31:05.000Z', patente: 'ABCD12' });
    expect(e).toEqual({
      ruta_id: 11, tipo: 'llegada',
      datos: { store_cod: '16PQA', hora: '2026-09-11T12:31:05.000Z', patente: 'ABCD12', fuente: 'sello_llegada' },
    });
  });

  it('sin ruta encontrada igual se guarda (con la tienda y la patente): la hora vale igual', () => {
    const e = eventoLlegada({ rutaId: null, storeCod: '99ZZZ', horaISO: '2026-09-11T12:00:00.000Z', patente: 'ABCD12' });
    expect(e.ruta_id).toBeNull();
    expect(e.datos.store_cod).toBe('99ZZZ');
  });
});

describe('eventoSalida', () => {
  it('guarda la hora real de salida del CD', () => {
    expect(eventoSalida({ rutaId: 11, horaISO: '2026-09-11T11:58:00.000Z', patente: 'ABCD12' })).toEqual({
      ruta_id: 11, tipo: 'salida', datos: { hora: '2026-09-11T11:58:00.000Z', patente: 'ABCD12', fuente: 'confirmar_salida' },
    });
  });
});
