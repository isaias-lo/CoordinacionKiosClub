import { describe, it, expect } from 'vitest';
import {
  buscarProducto, camposAPedir, camposDesdeProducto, camposMedidaDe, camposNumericosConValor, llaveBarcode, normalizarCodigo, pesoParaCampo, pesoPorCantidad,
  productoDesdeOdoo, validarProducto, MAX_CANTIDAD,
} from '../productosBodega';

const LISTA = [
  { codigo: 'ABC123', barcode: '7801234567890' },
  { codigo: 'SINBAR', barcode: null },
  { codigo: 'UPC1', barcode: '012345678905' },
];

describe('normalizarCodigo', () => {
  it('saca corchetes y espacios y pasa a mayúsculas', () => {
    expect(normalizarCodigo(' [abc123] ')).toBe('ABC123');
  });
});

describe('llaveBarcode', () => {
  it('ignora ceros a la izquierda solo en códigos numéricos', () => {
    expect(llaveBarcode('0012345')).toBe('12345');
    expect(llaveBarcode('0AB')).toBe('0AB');
    expect(llaveBarcode('000')).toBe('0');
  });
});

describe('buscarProducto', () => {
  it('encuentra por código de barras', () => {
    expect(buscarProducto(LISTA, '7801234567890')?.codigo).toBe('ABC123');
  });
  it('un UPC-A de 12 dígitos calza con el EAN-13 con 0 delante, y al revés', () => {
    expect(buscarProducto(LISTA, '0012345678905')?.codigo).toBe('UPC1');
    expect(buscarProducto([{ codigo: 'X', barcode: '0012345678905' }], '012345678905')?.codigo).toBe('X');
  });
  it('si no hay código de barras, busca por código de Odoo', () => {
    expect(buscarProducto(LISTA, 'sinbar')?.codigo).toBe('SINBAR');
  });
  it('devuelve null si no está o si la lectura viene vacía', () => {
    expect(buscarProducto(LISTA, '999')).toBeNull();
    expect(buscarProducto(LISTA, '   ')).toBeNull();
  });
});

describe('pesoPorCantidad', () => {
  it('multiplica y redondea a dos decimales', () => {
    expect(pesoPorCantidad(0.355, '12')).toBe(4.26);
    expect(pesoPorCantidad(1.2, '3')).toBe(3.6);
  });
  it('rechaza cantidades que no son enteros positivos', () => {
    for (const c of ['', '0', '-2', '1.5', 'abc', ' ']) expect(pesoPorCantidad(1, c)).toBeNull();
  });
  it('rechaza más de MAX_CANTIDAD: es un código de barras escrito en Cantidad', () => {
    expect(pesoPorCantidad(1, String(MAX_CANTIDAD))).toBe(MAX_CANTIDAD);
    expect(pesoPorCantidad(1, '7801234567890')).toBeNull();
  });
  it('sin peso unitario no hay cálculo', () => {
    expect(pesoPorCantidad(null, '3')).toBeNull();
    expect(pesoPorCantidad(0, '3')).toBeNull();
  });
});

describe('camposDesdeProducto', () => {
  const SILLA = { peso_kg: 3.98, alto_cm: 82, ancho_cm: 51, largo_cm: 41 };
  it('trae el peso por la cantidad y las medidas guardadas', () => {
    expect(camposDesdeProducto(SILLA, '2')).toEqual({ peso: '7,96', alto: '82', ancho: '51', largo: '41' });
  });
  it('las medidas con decimales van con punto (campos numéricos)', () => {
    expect(camposDesdeProducto({ ...SILLA, ancho_cm: 68.5 }, '1')?.ancho).toBe('68.5');
  });
  it('sin medidas guardadas, solo el peso', () => {
    expect(camposDesdeProducto({ peso_kg: 9, alto_cm: null, ancho_cm: 0, largo_cm: null }, '1')).toEqual({ peso: '9' });
  });
  it('sin peso o con una cantidad inválida, nada', () => {
    expect(camposDesdeProducto({ ...SILLA, peso_kg: null }, '1')).toBeNull();
    expect(camposDesdeProducto(SILLA, '')).toBeNull();
  });
});

describe('pesoParaCampo', () => {
  it('usa coma decimal, como se teclea en Peso', () => {
    expect(pesoParaCampo(4.26)).toBe('4,26');
    expect(pesoParaCampo(12)).toBe('12');
  });
});

const F = { type: 'float' } as const;
const BASE = { id: { type: 'integer' }, name: { type: 'char' }, default_code: { type: 'char' }, barcode: { type: 'char' }, weight: F };

describe('camposMedidaDe', () => {
  it('reconoce los nombres técnicos conocidos', () => {
    expect(camposMedidaDe({ ...BASE, product_length: F, product_width: F, product_height: F }))
      .toEqual({ alto: 'product_height', ancho: 'product_width', largo: 'product_length' });
  });
  it('si no, reconoce por la etiqueta de un campo numérico', () => {
    expect(camposMedidaDe({ ...BASE,
      x_studio_float_1: { type: 'float', string: 'Alto (cm)' },
      x_studio_float_2: { type: 'float', string: 'Ancho' },
      x_studio_float_3: { type: 'float', string: 'Largo' },
    })).toEqual({ alto: 'x_studio_float_1', ancho: 'x_studio_float_2', largo: 'x_studio_float_3' });
  });
  it('no toma campos de texto, de unidad ni de embalaje', () => {
    expect(camposMedidaDe({ ...BASE,
      x_alto_texto: { type: 'char', string: 'Alto' },
      length_uom_id: { type: 'integer', string: 'Unidad de largo' },
      packaging_length: { type: 'float', string: 'Largo' },
    })).toEqual({});
  });
});

describe('camposAPedir', () => {
  it('pide lo básico y las medidas que encontró', () => {
    expect(camposAPedir({ ...BASE, product_length: F, width: F }))
      .toEqual(['id', 'default_code', 'name', 'barcode', 'weight', 'width', 'product_length']);
  });
  it('sin medidas, solo lo básico', () => {
    expect(camposAPedir({ ...BASE, weight_uom_name: { type: 'char' } }))
      .toEqual(['id', 'default_code', 'name', 'barcode', 'weight', 'weight_uom_name']);
  });
});

describe('camposNumericosConValor', () => {
  it('lista números con valor y textos con nombre de medida, sin ids', () => {
    const def = { id: { type: 'integer' }, volume: F, list_price: F, categ_id: { type: 'integer' },
      x_medidas: { type: 'char', string: 'Medidas' }, description: { type: 'char', string: 'Descripción' } };
    const r = { id: 3, volume: 0.05, list_price: 0, categ_id: 2, x_medidas: '150x68x52', description: 'algo' };
    expect(camposNumericosConValor(r, def)).toEqual([
      { campo: 'volume', etiqueta: 'volume', valor: 0.05 },
      { campo: 'x_medidas', etiqueta: 'Medidas', valor: '150x68x52' },
    ]);
  });
});

describe('productoDesdeOdoo', () => {
  it('pasa false a null y normaliza el código', () => {
    const p = productoDesdeOdoo({ id: 7, default_code: 'abc1', name: 'Galleta', barcode: false, weight: false }, 'ABC1');
    expect(p).toMatchObject({ codigo: 'ABC1', odoo_id: 7, barcode: null, nombre: 'Galleta', peso_kg: null,
      alto_cm: null, ancho_cm: null, largo_cm: null, medidasSinConvertir: false });
  });
  it('convierte el peso a kg y las medidas a cm según la unidad de Odoo', () => {
    const p = productoDesdeOdoo({ id: 1, default_code: 'X', name: 'X', barcode: '78', weight: 500, weight_uom_name: 'g',
      product_height: 0.25, product_width: 0.1, product_length: 0.3, dimensional_uom_id: [5, 'm'] }, 'X',
    { alto: 'product_height', ancho: 'product_width', largo: 'product_length' });
    expect(p).toMatchObject({ peso_kg: 0.5, alto_cm: 25, ancho_cm: 10, largo_cm: 30, unidadMedidas: 'm', medidasSinConvertir: false });
  });
  it('medidas sin unidad declarada quedan como vienen y se marcan', () => {
    const p = productoDesdeOdoo({ id: 1, default_code: 'X', name: 'X', weight: 2, x_alto: 12 }, 'X', { alto: 'x_alto' });
    expect(p.alto_cm).toBe(12);
    expect(p.medidasSinConvertir).toBe(true);
  });
  it('sin default_code usa el código buscado', () => {
    expect(productoDesdeOdoo({ id: 1, default_code: false, name: 'X' }, ' [y9] ').codigo).toBe('Y9');
  });
});

describe('validarProducto', () => {
  it('acepta un producto completo y normaliza números con coma', () => {
    const v = validarProducto({ codigo: ' abc ', nombre: ' Galleta ', barcode: ' 78 ', odoo_id: 3, peso_kg: '0,355', alto_cm: '', ancho_cm: 10 });
    expect(v).toEqual({ ok: true, fila: { codigo: 'ABC', odoo_id: 3, barcode: '78', nombre: 'Galleta',
      peso_kg: 0.355, alto_cm: null, ancho_cm: 10, largo_cm: null } });
  });
  it('rechaza sin código, sin nombre, o con números negativos o basura', () => {
    expect(validarProducto(null).ok).toBe(false);
    expect(validarProducto({ nombre: 'X' }).ok).toBe(false);
    expect(validarProducto({ codigo: 'X' }).ok).toBe(false);
    expect(validarProducto({ codigo: 'X', nombre: 'X', peso_kg: -1 }).ok).toBe(false);
    expect(validarProducto({ codigo: 'X', nombre: 'X', alto_cm: 'abc' }).ok).toBe(false);
  });
  it('un odoo_id que no es entero queda null', () => {
    const v = validarProducto({ codigo: 'X', nombre: 'X', odoo_id: '5' });
    expect(v.ok && v.fila.odoo_id).toBeNull();
  });
});
