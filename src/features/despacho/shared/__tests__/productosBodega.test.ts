import { describe, it, expect } from 'vitest';
import {
  buscarProducto, camposAPedir, llaveBarcode, normalizarCodigo, pesoParaCampo, pesoPorCantidad,
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

describe('pesoParaCampo', () => {
  it('usa coma decimal, como se teclea en Peso', () => {
    expect(pesoParaCampo(4.26)).toBe('4,26');
    expect(pesoParaCampo(12)).toBe('12');
  });
});

describe('camposAPedir', () => {
  it('pide solo las medidas que existen en Odoo', () => {
    const c = camposAPedir(['id', 'name', 'default_code', 'barcode', 'weight', 'product_length', 'width']);
    expect(c).toEqual(['id', 'default_code', 'name', 'barcode', 'weight', 'width', 'product_length']);
  });
  it('sin módulo de medidas, solo lo básico', () => {
    expect(camposAPedir(['id', 'name', 'default_code', 'barcode', 'weight', 'weight_uom_name']))
      .toEqual(['id', 'default_code', 'name', 'barcode', 'weight', 'weight_uom_name']);
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
      product_height: 0.25, product_width: 0.1, product_length: 0.3, dimensional_uom_id: [5, 'm'] }, 'X');
    expect(p).toMatchObject({ peso_kg: 0.5, alto_cm: 25, ancho_cm: 10, largo_cm: 30, unidadMedidas: 'm', medidasSinConvertir: false });
  });
  it('medidas sin unidad declarada quedan como vienen y se marcan', () => {
    const p = productoDesdeOdoo({ id: 1, default_code: 'X', name: 'X', weight: 2, height: 12 }, 'X');
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
