import { describe, it, expect } from 'vitest';
import { validarCorreccion, textoConfirmacion, type PedidoCorreccion } from '../correccionPicker';

function pedido(p: Partial<PedidoCorreccion> = {}): PedidoCorreccion {
  return {
    ref: '99REC/DT/146059', fecha: '2026-11-04', cod: '38SP2', seccion: 'Hogar',
    pickerActual: 'Marcelo Vergara', pickerNuevo: 'Cristobal Labra', ...p,
  };
}

describe('validarCorreccion', () => {
  it('acepta un cambio de persona', () => {
    expect(validarCorreccion(pedido())).toEqual({ ok: true });
  });

  it('rechaza guardar el mismo nombre que ya tiene', () => {
    // Si no, la celda quedaría marcada como corregida sin que nada cambie, y el conteo mentiría.
    const v = validarCorreccion(pedido({ pickerNuevo: 'Marcelo Vergara' }));
    expect(v).toEqual({ ok: false, motivo: 'Ese ya es el picker de este movimiento.' });
  });

  it('ignora los espacios de más al comparar', () => {
    expect(validarCorreccion(pedido({ pickerNuevo: '  Marcelo Vergara  ' })).ok).toBe(false);
  });

  it('rechaza un picker vacío', () => {
    expect(validarCorreccion(pedido({ pickerNuevo: '   ' })).ok).toBe(false);
  });

  it('acepta corregir una celda que estaba sin asignar', () => {
    expect(validarCorreccion(pedido({ pickerActual: '' })).ok).toBe(true);
  });

  it('rechaza una fecha mal formada', () => {
    expect(validarCorreccion(pedido({ fecha: '04-11-2026' })).ok).toBe(false);
    expect(validarCorreccion(pedido({ fecha: '2026-13-45' })).ok).toBe(true);  // el formato, no el día
  });

  it('rechaza un movimiento sin referencia de Odoo', () => {
    expect(validarCorreccion(pedido({ ref: '' })).ok).toBe(false);
  });

  it('rechaza si falta la tienda', () => {
    expect(validarCorreccion(pedido({ cod: '' })).ok).toBe(false);
  });
});

describe('textoConfirmacion: qué se le muestra antes de guardar', () => {
  it('dice de quién sale y a quién va, con la tienda y la sección', () => {
    const t = textoConfirmacion(pedido());
    expect(t.lineas).toEqual([
      '38SP2 · Hogar',
      'Ahora dice: Marcelo Vergara',
      'Va a decir: Cristobal Labra',
    ]);
  });

  it('una celda sin asignar se dice con palabras, no en blanco', () => {
    const t = textoConfirmacion(pedido({ pickerActual: '' }));
    expect(t.lineas[1]).toBe('Ahora dice: sin asignar');
  });

  it('avisa la consecuencia que no es obvia: las métricas se mueven', () => {
    const t = textoConfirmacion(pedido());
    expect(t.aviso).toContain('métricas');
    expect(t.titulo).toContain('¿Cambiar');
  });
});
