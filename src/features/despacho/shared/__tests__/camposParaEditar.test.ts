import { describe, it, expect } from 'vitest';
import { camposParaEditar } from '../camposParaEditar';
import { DIMS_SIN_PESAR } from '../sinPesar';

const fila = { ancho: '100', largo: '120' };

describe('camposParaEditar — «Editar» abre con lo que la tarjeta muestra', () => {
  it('un pallet pesado abre con su peso y sus medidas', () => {
    expect(camposParaEditar({ pkg: 'pallet', peso: 237, alto: 180, ancho: 100, largo: 120 }, null, fila))
      .toEqual({ peso: '237', pesoPallet: '', alto: '180', ancho: '100', largo: '120' });
  });

  it('06MQH: un pallet «sin pesar» abre en blanco, no con los números de otro', () => {
    // La fila podía traer escritos los 237/180 del P1: no se usan.
    const c = camposParaEditar({ pkg: 'pallet', ...DIMS_SIN_PESAR }, null, { ancho: '100', largo: '120' });
    expect(c.peso).toBe('');
    expect(c.alto).toBe('');
    expect(c).toEqual({ peso: '', pesoPallet: '', alto: '', ancho: '100', largo: '120' });
  });

  it('con tara de pallet, el peso vuelve en bruto y la tara en su casillero', () => {
    const c = camposParaEditar({ pkg: 'pallet', peso: 278, taraPallet: 22, alto: 150, ancho: 100, largo: 120 }, null, fila);
    expect(c.peso).toBe('300');
    expect(c.pesoPallet).toBe('22');
  });

  it('el chocolate vuelve con el peso de la balanza (neto + caja)', () => {
    const c = camposParaEditar({ pkg: 'chocolate', peso: 10, alto: 30, ancho: 40, largo: 60 }, 'negra', fila);
    expect(c.peso).toBe('13.3');
  });

  it('un pallet web no es «sin pesar»: abre con lo que tiene', () => {
    const c = camposParaEditar({ pkg: 'pallet', palletWeb: true, peso: 0, alto: 0, ancho: 100, largo: 120 }, null, fila);
    expect(c.alto).toBe('0');
  });

  it('medida que falta en el ítem: queda la de la fila', () => {
    const c = camposParaEditar({ pkg: 'box', peso: 12, alto: 40 }, null, { ancho: '30', largo: '50' });
    expect(c).toMatchObject({ ancho: '30', largo: '50' });
  });
});
