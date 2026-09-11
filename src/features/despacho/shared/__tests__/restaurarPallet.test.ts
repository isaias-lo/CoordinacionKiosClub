import { describe, it, expect } from 'vitest';
import { filaParaRestaurar, puedeRestaurar, avisoRestaurar } from '../restaurarPallet';

// Una fila tal como la guarda el trigger (to_jsonb(OLD)).
const copia = {
  id: 12345, date: '2026-09-09', store_cod: '16PQA', state_key: '16PQA__diego', picker_label: 'Diego',
  tipo: 'CH', created_at: '2026-09-09T12:00:00Z', contenido: 'chocolate', refs: 'G-1001', seq: 3,
  canonical_id: 'CH316PQA09092026CH', peso_kg: 18.5, alto: 42, largo: 80, ancho: 56, peso_v: 31,
  estado: null, conductor: null, patente: null, ruta: null, supervisor: null,
  is_active: true, combined_into: 777, combined_at: '2026-09-09T15:00:00Z',
  client_op_id: '4b1d…', section: 'chocolates',
};

describe('filaParaRestaurar', () => {
  it('vuelve con su MISMO id, número, código, peso y medidas', () => {
    const f = filaParaRestaurar(copia, '2026-09-11')!;
    expect(f).toMatchObject({
      id: 12345, seq: 3, canonical_id: 'CH316PQA09092026CH', peso_kg: 18.5, alto: 42, largo: 80, ancho: 56,
      tipo: 'CH', contenido: 'chocolate', section: 'chocolates', refs: 'G-1001', picker_label: 'Diego',
    });
  });

  it('entra a la carga de HOY, activo y suelto — igual que reclamar un preexistente', () => {
    const f = filaParaRestaurar(copia, '2026-09-11')!;
    expect(f.date).toBe('2026-09-11');
    expect(f.is_active).toBe(true);
    // Si se había sumado a un pallet, vuelve SUELTO: no queda "absorbido" por uno que ya no lo tiene.
    expect(f.combined_into).toBeNull();
    expect(f.combined_at).toBeNull();
  });

  it('NO restaura el token de idempotencia de la cola offline: era de la creación original', () => {
    expect(filaParaRestaurar(copia, '2026-09-11')).not.toHaveProperty('client_op_id');
  });

  it('ignora columnas que ya no existen en la tabla — la copia puede ser vieja', () => {
    const conBasura = { ...copia, columna_que_ya_no_existe: 'x' };
    expect(filaParaRestaurar(conBasura, '2026-09-11')).not.toHaveProperty('columna_que_ya_no_existe');
  });

  it('sin id, tienda o tipo no hay fila que restaurar', () => {
    expect(filaParaRestaurar({ ...copia, id: undefined }, '2026-09-11')).toBeNull();
    expect(filaParaRestaurar({ ...copia, store_cod: '' }, '2026-09-11')).toBeNull();
    expect(filaParaRestaurar({ ...copia, tipo: null }, '2026-09-11')).toBeNull();
    expect(filaParaRestaurar(null, '2026-09-11')).toBeNull();
  });
});

describe('puedeRestaurar', () => {
  it('con copia y de esta tienda, se puede', () => {
    expect(puedeRestaurar(copia, '16PQA')).toEqual({ ok: true });
  });

  it('un borrado ANTERIOR a guardar copias no se puede restaurar — no hay qué devolver', () => {
    expect(puedeRestaurar(null, '16PQA')).toEqual({ ok: false, motivo: 'sin_copia' });
  });

  it('de otra tienda no se restaura acá', () => {
    expect(puedeRestaurar(copia, '22LGN')).toEqual({ ok: false, motivo: 'otra_tienda' });
  });

  it('la tienda se compara sin importar mayúsculas ni espacios', () => {
    expect(puedeRestaurar(copia, ' 16pqa ')).toEqual({ ok: true });
  });
});

describe('avisoRestaurar', () => {
  it('dice qué vuelve y con qué número', () => {
    expect(avisoRestaurar(copia)).toContain('CH3');
    expect(avisoRestaurar(copia)).toContain('18,5 kg');
  });

  it('si se había sumado a un pallet, avisa que ese pallet todavía tiene su peso', () => {
    // Sumar un bulto le pasa su peso al pallet y borra el bulto. Restaurar el bulto NO se lo quita
    // al pallet: el sistema no guarda a cuál se sumó, así que hay que decirlo.
    expect(avisoRestaurar(copia)).toMatch(/sumado a un pallet/i);
  });

  it('sin peso no inventa "0 kg"', () => {
    expect(avisoRestaurar({ ...copia, peso_kg: null })).not.toMatch(/0 kg/);
  });

  it('sin número impreso todavía, lo nombra por su tipo', () => {
    expect(avisoRestaurar({ ...copia, seq: null, canonical_id: null })).toContain('chocolate');
  });
});
