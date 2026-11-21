import { describe, it, expect } from 'vitest';
import { ordenarPorPrioridad, puntajePrioridad, PESOS_POR_DEFECTO } from '../prioridad';

const t = (urgentes: number, sinProgramar: number, diasMasAntigua: number) =>
  ({ urgentes, sinProgramar, diasMasAntigua });

describe('puntajePrioridad', () => {
  it('el ejemplo del plan: 7 sin programar, 1 urgente y 12 días dan 18', () => {
    // 5×1 + 7 + 12/2 = 5 + 7 + 6
    expect(puntajePrioridad(t(1, 7, 12))).toBe(18);
  });

  it('una tienda sin nada pendiente da cero y queda al fondo', () => {
    expect(puntajePrioridad(t(0, 0, 0))).toBe(0);
  });

  it('cada término suma por su cuenta', () => {
    expect(puntajePrioridad(t(2, 0, 0))).toBe(10);
    expect(puntajePrioridad(t(0, 3, 0))).toBe(3);
    expect(puntajePrioridad(t(0, 0, 7))).toBe(3.5);
  });

  it('los pesos salen de la configuración, no del código', () => {
    expect(puntajePrioridad(t(1, 7, 12), { pesoUrgente: 10, diasPorSolicitud: 4 }))
      .toBe(20);   // 10 + 7 + 3
  });

  it('dias_por_solicitud en cero no convierte el tablero en Infinity', () => {
    // Es un campo que se edita a mano en una pantalla. Un cero ahí daría Infinity en TODAS las
    // tiendas: un tablero sin orden y sin ningún error visible.
    const r = puntajePrioridad(t(0, 0, 10), { pesoUrgente: 5, diasPorSolicitud: 0 });
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBe(5);   // usa el 2 por defecto
  });

  it('números negativos o basura se tratan como cero', () => {
    expect(puntajePrioridad(t(-3, 0, 0))).toBe(0);
    expect(puntajePrioridad({ urgentes: NaN, sinProgramar: 2, diasMasAntigua: 0 })).toBe(2);
  });

  it('redondea a dos decimales', () => {
    expect(puntajePrioridad(t(0, 0, 1), { pesoUrgente: 5, diasPorSolicitud: 3 })).toBe(0.33);
  });
});

describe('ordenarPorPrioridad', () => {
  it('de mayor a menor, con el puntaje agregado', () => {
    const r = ordenarPorPrioridad([
      { codigoTienda: '09LEO', ...t(0, 2, 0) },
      { codigoTienda: '53VAL', ...t(1, 7, 12) },
      { codigoTienda: '76PAN', ...t(0, 0, 0) },
    ]);
    expect(r.map(x => x.codigoTienda)).toEqual(['53VAL', '09LEO', '76PAN']);
    expect(r[0].puntaje).toBe(18);
  });

  it('el empate se rompe por código, para que el tablero no se reacomode solo', () => {
    const r = ordenarPorPrioridad([
      { codigoTienda: '76PAN', ...t(0, 3, 0) },
      { codigoTienda: '09LEO', ...t(0, 3, 0) },
    ]);
    expect(r.map(x => x.codigoTienda)).toEqual(['09LEO', '76PAN']);
  });

  it('no modifica el arreglo que recibe', () => {
    const filas = [{ codigoTienda: '09LEO', ...t(0, 1, 0) }, { codigoTienda: '53VAL', ...t(0, 9, 0) }];
    const copia = [...filas];
    ordenarPorPrioridad(filas);
    expect(filas).toEqual(copia);
  });

  it('sin tiendas devuelve una lista vacía', () => {
    expect(ordenarPorPrioridad([], PESOS_POR_DEFECTO)).toEqual([]);
  });
});
