import { describe, it, expect } from 'vitest';
import {
  subtipoDeCaja, etiquetaSubtipo, tieneMedidasFijas, medidasDeCaja,
  MEDIDAS_CAJA_NEGRA, SUBTIPOS_CAJA, claveUnidad, partirClave, pesoNetoDeCaja, pesoParaGuardar, pesoParaMostrar,
  TARA_CAJA_NEGRA, TARA_CAJA_CARTON, taraDeCaja,
} from '../subtipoCaja';
import { CHOCOLATE_DIMS } from '../chocolate';

describe('leer el subtipo guardado', () => {
  it('reconoce los dos', () => {
    expect(subtipoDeCaja('negra')).toBe('negra');
    expect(subtipoDeCaja('carton')).toBe('carton');
  });

  it('acepta "cartón" con tilde, que es como se escribe en pantalla', () => {
    expect(subtipoDeCaja('cartón')).toBe('carton');
    expect(subtipoDeCaja('  CARTÓN ')).toBe('carton');
  });

  it('lo anterior al cambio se lee como NEGRA', () => {
    // Todos los chocolates viejos recibieron 42 × 80 × 56: eso es una caja negra.
    expect(subtipoDeCaja(null)).toBe('negra');
    expect(subtipoDeCaja(undefined)).toBe('negra');
    expect(subtipoDeCaja('')).toBe('negra');
  });

  it('un valor corrupto no inventa un tercer subtipo', () => {
    expect(SUBTIPOS_CAJA).toContain(subtipoDeCaja('cualquier cosa'));
    expect(subtipoDeCaja(42)).toBe('negra');
  });
});

describe('las medidas: la diferencia entera entre las dos cajas', () => {
  it('la negra tiene medidas fijas', () => {
    expect(tieneMedidasFijas('negra')).toBe(true);
    expect(medidasDeCaja('negra')).toEqual({ alto: 42, largo: 80, ancho: 56 });
  });

  it('la de cartón NO: su tamaño varía, así que no se le piden', () => {
    expect(tieneMedidasFijas('carton')).toBe(false);
    expect(medidasDeCaja('carton')).toBeNull();
  });

  it('las medidas de la negra son las que el sistema ya usaba para el chocolate', () => {
    // Si alguien cambia una de las dos constantes, esto lo atrapa antes que la operación.
    expect(MEDIDAS_CAJA_NEGRA).toEqual({
      alto: CHOCOLATE_DIMS.alto, largo: CHOCOLATE_DIMS.largo, ancho: CHOCOLATE_DIMS.ancho,
    });
  });

  it('devuelve una copia: nadie puede mutar la constante compartida', () => {
    const m = medidasDeCaja('negra')!;
    m.alto = 999;
    expect(MEDIDAS_CAJA_NEGRA.alto).toBe(42);
  });
});

describe('cómo se llaman en pantalla', () => {
  it('con tilde donde corresponde', () => {
    expect(etiquetaSubtipo('negra')).toBe('Caja Negra');
    expect(etiquetaSubtipo('carton')).toBe('Caja Cartón');
  });
});

describe('la clave de conteo: dos botones, un solo tipo en la base', () => {
  it('el chocolate lleva la caja en la clave', () => {
    expect(claveUnidad('CH', 'negra')).toBe('CH:negra');
    expect(claveUnidad('CH', 'carton')).toBe('CH:carton');
  });

  it('un chocolate viejo (sin subtipo) cuenta como negra', () => {
    expect(claveUnidad('CH', null)).toBe('CH:negra');
  });

  it('los demás tipos no se enteran: la clave es el tipo pelado', () => {
    expect(claveUnidad('P')).toBe('P');
    expect(claveUnidad('B', 'carton')).toBe('B');   // el subtipo solo aplica al chocolate
    expect(claveUnidad('C')).toBe('C');
  });

  it('ida y vuelta: la clave se parte en lo que entiende la base', () => {
    expect(partirClave('CH:carton')).toEqual({ tipo: 'CH', subtipo: 'carton' });
    expect(partirClave('CH:negra')).toEqual({ tipo: 'CH', subtipo: 'negra' });
    expect(partirClave('P')).toEqual({ tipo: 'P', subtipo: null });
  });

  it('una clave CH sin caja se parte como negra', () => {
    expect(partirClave('CH')).toEqual({ tipo: 'CH', subtipo: 'negra' });
  });

  it('cada clave sobrevive la ida y la vuelta', () => {
    for (const c of ['P', 'B', 'C', 'CH:negra', 'CH:carton']) {
      const { tipo, subtipo } = partirClave(c);
      expect(claveUnidad(tipo, subtipo)).toBe(c);
    }
  });
});

describe('la tara: se resta lo que la caja pesa vacía', () => {
  it('LAS DOS CAJAS TIENEN TARA (14/10/2026): negra 3,3 · cartón 0,4', () => {
    expect(TARA_CAJA_NEGRA).toBe(3.3);
    expect(TARA_CAJA_CARTON).toBe(0.4);
    expect(taraDeCaja('negra')).toBe(3.3);
    expect(taraDeCaja('carton')).toBe(0.4);
  });

  it('la negra: 20,5 en la balanza quedan 17,2', () => {
    expect(pesoNetoDeCaja(20.5, 'negra')).toEqual({ ok: true, neto: 17.2, bruto: 20.5, tara: 3.3 });
  });

  it('el cartón: 13,25 en la balanza quedan 12,85 → 12,9', () => {
    expect(pesoNetoDeCaja(13.25, 'carton')).toMatchObject({ ok: true, neto: 12.9, tara: 0.4 });
    expect(pesoNetoDeCaja(5, 'carton')).toMatchObject({ ok: true, neto: 4.6 });
  });

  it('acepta coma decimal, que es lo que escribe un teclado en español', () => {
    expect(pesoNetoDeCaja('20,5', 'negra')).toMatchObject({ ok: true, neto: 17.2 });
    expect(pesoNetoDeCaja('20.5', 'negra')).toMatchObject({ ok: true, neto: 17.2 });
  });

  it('no arrastra coma flotante', () => {
    // 20.6 - 3.3 da 17.299999999999997 en coma flotante; 5.1 - 0.4 da 4.699999999999999.
    expect(pesoNetoDeCaja(20.6, 'negra')).toMatchObject({ neto: 17.3 });
    expect(pesoNetoDeCaja(5.1, 'carton')).toMatchObject({ neto: 4.7 });
  });

  it('un peso alto se acepta: el tope de 25 kg ya no existe', () => {
    expect(pesoNetoDeCaja(48, 'negra')).toMatchObject({ ok: true, neto: 44.7 });
  });
});

describe('la tara rechaza, no recorta', () => {
  it('menos que la caja vacía se rechaza con un aviso, no se guarda 0', () => {
    const r = pesoNetoDeCaja(2, 'negra');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('3,3');
  });

  it('el aviso nombra LA CAJA que es, no siempre la negra', () => {
    const r = pesoNetoDeCaja(0.2, 'carton');
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.toLowerCase()).toContain('cartón'); expect(r.error).toContain('0,4'); }
  });

  it('exactamente la tara también se rechaza: una caja vacía no se despacha', () => {
    expect(pesoNetoDeCaja(3.3, 'negra').ok).toBe(false);
    expect(pesoNetoDeCaja(0.4, 'carton').ok).toBe(false);
  });

  it('cero, vacío y basura se rechazan pidiendo el peso', () => {
    for (const v of [0, '', '  ', 'abc', null, undefined, NaN]) {
      expect(pesoNetoDeCaja(v, 'negra').ok).toBe(false);
      expect(pesoNetoDeCaja(v, 'carton').ok).toBe(false);
    }
  });

  it('un negativo no pasa', () => {
    expect(pesoNetoDeCaja(-5, 'negra').ok).toBe(false);
  });

  it('justo por encima de la tara pasa', () => {
    expect(pesoNetoDeCaja(3.4, 'negra')).toMatchObject({ ok: true, neto: 0.1 });
    expect(pesoNetoDeCaja(0.5, 'carton')).toMatchObject({ ok: true, neto: 0.1 });
  });
});

describe('ida y vuelta: la resta ocurre UNA sola vez', () => {
  it('guardar resta la tara; reconstruir la devuelve', () => {
    expect(pesoParaGuardar(20.5, 'negra')).toBe(17.2);
    expect(pesoParaMostrar(17.2, 'negra')).toBe(20.5);
    expect(pesoParaGuardar(13.3, 'carton')).toBe(12.9);
    expect(pesoParaMostrar(12.9, 'carton')).toBe(13.3);
  });

  it('el ciclo completo no corre el peso, por más veces que se repita', () => {
    // Entrar a la tienda, guardar, salir, entrar, guardar… sin esto sería 17,2 → 13,9 → 10,6.
    for (const [caja, bruto, neto] of [['negra', 20.5, 17.2], ['carton', 13.3, 12.9]] as const) {
      let enFormulario: number = bruto;
      for (let i = 0; i < 5; i++) {
        const guardado = pesoParaGuardar(enFormulario, caja);
        expect(guardado).toBe(neto);
        enFormulario = pesoParaMostrar(guardado, caja);
        expect(enFormulario).toBe(bruto);
      }
    }
  });

  it('no arrastra coma flotante en ninguna de las dos', () => {
    expect(pesoParaGuardar(20.6, 'negra')).toBe(17.3);
    expect(pesoParaMostrar(17.3, 'negra')).toBe(20.6);
    expect(pesoParaGuardar(5.1, 'carton')).toBe(4.7);
    expect(pesoParaMostrar(4.7, 'carton')).toBe(5.1);
  });
});
