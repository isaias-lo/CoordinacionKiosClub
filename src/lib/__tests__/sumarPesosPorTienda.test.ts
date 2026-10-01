import { describe, it, expect } from 'vitest';
import { sumarPesosPorTienda, type FilaDePeso } from '../crucePesosDia';

// ── LOS 12.622,8 KG DE MÁS DEL 30/09/2026 ──────────────────────────────────────────────────────
//
// Cada unidad de RM terminó con DOS filas pesadas: una con el sello del armado y otra con el del
// despacho, con el MISMO peso y apuntando al MISMO slot. Normalmente la del armado va sin peso.
//
// 71 filas en 19 tiendas. La hoja todavía mostraba los valores buenos porque se había escrito
// antes, pero la siguiente carga habría puesto el doble —05LP en 2.309,4 en vez de 1.154,7— en la
// planilla que mira Jefatura.

const f = (cod: string, peso: number, slot?: number | null, tipo = 'Pallet'): FilaDePeso =>
  ({ cod, peso_kg: peso, tipo, picking_slot_id: slot ?? null });

describe('sumarPesosPorTienda — cada unidad se cuenta UNA vez', () => {
  it('EL CASO: la misma unidad con el mismo peso, dos veces', () => {
    const m = sumarPesosPorTienda([f('05LP', 342.5, 485), f('05LP', 342.5, 485)]);
    expect(m.get('05LP')).toBe(342.5);   // NO 685
  });

  it('el día entero de 05LP: 9 unidades duplicadas dan 1.154,7, no 2.309,4', () => {
    const unidades: [number, number][] = [
      [342.5, 485], [118.5, 492], [131.5, 493], [480, 595],
      [27, 486], [15, 494], [11.1, 537], [14.7, 538], [14.4, 539],
    ];
    const filas = [...unidades, ...unidades].map(([kg, slot]) => f('05LP', kg, slot));
    expect(m2(sumarPesosPorTienda(filas))).toBe(1154.7);
  });

  it('dos unidades DISTINTAS con el mismo peso sí suman las dos', () => {
    // Es lo normal: dos bultos de 27 kg son 54 kg. La llave incluye el slot justamente por esto.
    expect(sumarPesosPorTienda([f('05LP', 27, 486), f('05LP', 27, 494)]).get('05LP')).toBe(54);
  });

  it('el mismo slot con pesos DISTINTOS se sigue sumando dos veces', () => {
    // A propósito: ahí no hay forma de saber cuál vale sin mirar la balanza, y quedarse con una en
    // silencio sería decidir por el coordinador. Que el número salga alto se ve; que el sistema
    // elija mal y no lo diga, no.
    expect(sumarPesosPorTienda([f('39PSB', 495, 552), f('39PSB', 147, 552)]).get('39PSB')).toBe(642);
  });

  it('sin slot NO se deduplica: perder carga real sería peor que contar de más', () => {
    expect(sumarPesosPorTienda([f('05LP', 100, null), f('05LP', 100, null)]).get('05LP')).toBe(200);
  });

  it('la deduplicación es por unidad, no por tienda', () => {
    const m = sumarPesosPorTienda([f('05LP', 50, 1), f('05LP', 50, 1), f('07CCR', 50, 2)]);
    expect(m.get('05LP')).toBe(50);
    expect(m.get('07CCR')).toBe(50);
  });

  it('los agregados siguen afuera, duplicados o no', () => {
    // Una adquisición no existe del lado de Odoo: sumarla inflaría el lado de Bodega.
    const m = sumarPesosPorTienda([f('05LP', 30, 9, 'Adquisicion'), f('05LP', 30, 9, 'Adquisicion')]);
    expect(m.has('05LP')).toBe(false);
  });

  it('una tienda sin filas queda FUERA del mapa, no en cero', () => {
    // El que no esté es lo que hace que la celda salga vacía en vez de decir «−100%».
    expect(sumarPesosPorTienda([]).has('05LP')).toBe(false);
  });

  it('el código se normaliza y las filas sin código se descartan', () => {
    const m = sumarPesosPorTienda([f(' 05lp ', 10, 1), f('', 99, 2)]);
    expect(m.get('05LP')).toBe(10);
    expect(m.size).toBe(1);
  });
});

/** Redondeo a un decimal, que es como se compara contra la planilla. */
function m2(m: Map<string, number>): number {
  return Math.round((m.get('05LP') ?? 0) * 10) / 10;
}
