import { describe, it, expect } from 'vitest';
import { validarPeticion, llavesDelProducto, quienPidio, buscarProducto, MAX_CODIGO_PETICION } from '../productosBodega';

describe('validarPeticion', () => {
  it('limpia lo leído y saca la llave como la compara Bodega', () => {
    expect(validarPeticion({ codigo: ' 07801234567890 ' })).toEqual({ ok: true, codigo: '07801234567890', llave: '7801234567890' });
    expect(validarPeticion({ codigo: 'sil-tor-bk' })).toEqual({ ok: true, codigo: 'sil-tor-bk', llave: 'SIL-TOR-BK' });
  });
  it('rechaza vacío, basura y lecturas pegadas', () => {
    expect(validarPeticion(null).ok).toBe(false);
    expect(validarPeticion({}).ok).toBe(false);
    expect(validarPeticion({ codigo: '   ' }).ok).toBe(false);
    expect(validarPeticion({ codigo: 123 }).ok).toBe(false);
    expect(validarPeticion({ codigo: '780 123' }).ok).toBe(false);
    expect(validarPeticion({ codigo: '780\u0007123' }).ok).toBe(false);
    expect(validarPeticion({ codigo: '9'.repeat(MAX_CODIGO_PETICION + 1) }).ok).toBe(false);
  });
});

describe('llavesDelProducto', () => {
  it('el código de barras y el de Odoo cierran sus pedidos', () => {
    expect(llavesDelProducto({ codigo: 'SIL-01', barcode: '0780123' })).toEqual(['780123', 'SIL-01']);
    expect(llavesDelProducto({ codigo: 'SIL-01', barcode: null })).toEqual(['SIL-01']);
  });
  it('la llave de un pedido calza con la del producto guardado después', () => {
    const pedido = validarPeticion({ codigo: '0780123' });
    expect(pedido.ok && llavesDelProducto({ codigo: 'X', barcode: '780123' }).includes(pedido.llave)).toBe(true);
    // Y Bodega lo encuentra con lo mismo que leyó.
    expect(buscarProducto([{ codigo: 'X', barcode: '780123' }], '0780123')?.codigo).toBe('X');
  });
});

describe('quienPidio', () => {
  it('una vez', () => {
    expect(quienPidio({ pedido_por: 'Kamila', ultimo_pedido_por: null, veces: 1 })).toBe('Lo pidió Kamila');
  });
  it('varias veces, con la última persona si es otra', () => {
    expect(quienPidio({ pedido_por: 'Kamila', ultimo_pedido_por: 'Steven', veces: 3 })).toBe('Lo pidieron 3 veces · primero Kamila · último: Steven');
    expect(quienPidio({ pedido_por: 'Kamila', ultimo_pedido_por: 'Kamila', veces: 2 })).toBe('Lo pidieron 2 veces · primero Kamila');
  });
});
