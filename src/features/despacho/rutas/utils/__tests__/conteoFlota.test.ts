import { describe, it, expect } from 'vitest';
import { filasPorTienda } from '../conteoFlota';
import { INCREMENTAL_DEFAULT, type UnidadSalida, type EsperadoTienda } from '../enrutadorIncremental';

const U = (cod: string, tipo: UnidadSalida['tipo'], minuto: number): UnidadSalida => ({ cod, tipo, minuto });
const H = (esperado: number, techoPallets = esperado + 1, extra: Partial<EsperadoTienda> = {}): EsperadoTienda =>
  ({ esperado, techoPallets, ...extra });
const AHORA = 10 * 60; // 10:00, antes del corte por defecto (15:00)

describe('filasPorTienda', () => {
  it('sin unidades no hay filas', () => {
    expect(filasPorTienda([], {}, AHORA)).toEqual([]);
  });

  it('ordena por código y suma pallets/bultos/chocolates reales por tienda', () => {
    const unidades = [
      U('B', 'P', 100), U('A', 'P', 100), U('A', 'B', 110), U('A', 'CH', 120),
    ];
    const filas = filasPorTienda(unidades, {}, AHORA);
    expect(filas.map(f => f.cod)).toEqual(['A', 'B']);
    expect(filas[0]).toMatchObject({ cod: 'A', pallets: 1, bultos: 1, chocolates: 1 });
    expect(filas[1]).toMatchObject({ cod: 'B', pallets: 1, bultos: 0, chocolates: 0 });
  });

  it('los contenedores cuentan como pallet, igual que en planificarIncremental', () => {
    const filas = filasPorTienda([U('A', 'C', 100)], {}, AHORA);
    expect(filas[0].pallets).toBe(1);
  });

  it('estado "completa" cuando ya salió lo esperado y pasó el silencio, con el motivo real (no el corte de hora)', () => {
    const unidades = [U('A', 'P', 100)];
    const historial = { A: H(1, 2) };
    // silencioMin default = 90 → a 100+90=190 ya se puede confirmar completa. 400 sigue < 900 (corte).
    const filas = filasPorTienda(unidades, historial, 400);
    expect(filas[0].estado).toBe('completa');
    expect(filas[0].estimadoAdicional).toBe(0); // completa ⇒ no se espera más, aunque techoPallets sea mayor
    expect(filas[0].detalle).toBe('Sin novedad hace 300 min');
    expect(filas[0].completaPorCorte).toBe(false);
  });

  it('estado "esperando" cuando falta carga, con estimado adicional según el techo histórico', () => {
    const unidades = [U('A', 'P', 100)]; // 1 pallet recibido
    const historial = { A: H(3, 3) };    // se esperan 3 unidades, techo de 3 pallets
    const filas = filasPorTienda(unidades, historial, AHORA);
    expect(filas[0].estado).toBe('esperando');
    expect(filas[0].estimadoAdicional).toBe(2); // 3 (techo) - 1 (ya contado)
  });

  it('sin historial la tienda queda "esperando" (no se puede saber cuánto falta) hasta el corte', () => {
    const filas = filasPorTienda([U('A', 'P', 100)], {}, AHORA);
    expect(filas[0].estado).toBe('esperando');
  });

  it('pasado el corte de cierre, toda tienda con carga queda "completa" pero marcada como completaPorCorte', () => {
    const filas = filasPorTienda([U('A', 'P', 100)], {}, INCREMENTAL_DEFAULT.corteCierre + 1);
    expect(filas[0].estado).toBe('completa');
    expect(filas[0].estimadoAdicional).toBe(0);
    expect(filas[0].completaPorCorte).toBe(true);
    expect(filas[0].detalle).toContain('Corte del día');
  });

  it('el estimado adicional nunca es negativo, aunque la tienda siga "esperando"', () => {
    // Ya llegaron más pallets que el techo histórico, pero todavía faltan bultos por salir
    // (esperado=10 unidades totales, recibido=2) → sigue "esperando", no "completa".
    const unidades = [U('A', 'P', 100), U('A', 'P', 101)];
    const historial = { A: H(10, 1) }; // techo de 1 pallet, pero ya llevan 2
    const filas = filasPorTienda(unidades, historial, AHORA);
    expect(filas[0].estado).toBe('esperando');
    expect(filas[0].pallets).toBe(2);
    expect(filas[0].estimadoAdicional).toBe(0);
  });
});
