import { describe, it, expect } from 'vitest';
import { movimientosDesdeOdoo, type MovimientoOdoo } from '../desdeOdoo';

const NOMBRES = { 'Pickers 15': 'Cristobal Labra', 'Pickers 1': 'Maria Camila' };
const HOY = '2026-11-03';

function crudo(p: Partial<MovimientoOdoo>): MovimientoOdoo {
  return {
    ref: '99REC/DT/146059', origin: 'Abastecimiento Comida 27MCH 03/11/2026',
    estado: 'done', registros: 134, responsable: 'Pickers 1',
    asignadoEn: '2026-11-03 11:51:12', validadoEn: '2026-11-03 13:52:10', dia: HOY,
    toLocation: '', partner: '', ...p,
  };
}
/** Todas las tiendas piden hoy, salvo las que se pasen distinto. */
function dias(extra: Record<string, string> = {}): Map<string, string> {
  const m = new Map<string, string>();
  for (const cod of ['27MCH', '23PEÑ', '34SMB', '56PZA', '01TPS']) m.set(cod, HOY);
  for (const [cod, d] of Object.entries(extra)) m.set(cod, d);
  return m;
}

describe('movimientosDesdeOdoo', () => {
  it('saca el código, la sección y el nombre traducido', () => {
    const [m] = movimientosDesdeOdoo([crudo({})], NOMBRES, dias());
    expect(m.cod).toBe('27MCH');
    expect(m.seccion).toBe('Comida');
    expect(m.picker).toBe('Maria Camila');
    expect(m.registros).toBe(134);
    expect(m.estado).toBe('done');
  });

  it('un código con Ñ se reconoce', () => {
    const [m] = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Aseo 23PEÑ 03/11/2026', responsable: 'Pickers 15' })],
      NOMBRES, dias());
    expect(m.cod).toBe('23PEÑ');
    expect(m.picker).toBe('Cristobal Labra');
  });

  it('la grafía ASCII de la Ñ se canoniza: 23PEN cae en la tienda 23PEÑ', () => {
    // ESTE es el caso que obliga a usar `resolveStoreCode` y no `extractStoreCode`. El test de
    // arriba pasa el código ya con Ñ, así que pasaría igual sin canonizar: no prueba nada.
    // Odoo escribe a veces «23PEN», y sin canonizar el movimiento no calzaría con ninguna tienda
    // del día: caería en `fueraDelCalendario` y 23PEÑ saldría «sin carga» teniéndola.
    // Comprobado: `canonicalStoreCode('23PEN')` devuelve `'23PEÑ'`.
    const desdeDestino = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Aseo 03/11/2026', toLocation: '23PEN' })], NOMBRES, dias());
    expect(desdeDestino[0].cod).toBe('23PEÑ');

    const desdeOrigin = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Aseo 23PEN 03/11/2026' })], NOMBRES, dias());
    expect(desdeOrigin[0].cod).toBe('23PEÑ');
  });

  it('Congelados no es de esta planilla y se deja fuera', () => {
    expect(movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Congelados 01TPS 03/11/2026' })], NOMBRES, dias()),
    ).toHaveLength(0);
  });

  it('un origin sin sección ni código se descarta en vez de inventar', () => {
    expect(movimientosDesdeOdoo(
      [crudo({ origin: 'Merma Abastecimiento 14PF/INT/02745' })], NOMBRES, dias()),
    ).toHaveLength(0);
  });

  it('una cuenta sin persona en el catálogo sale con su nombre crudo, no vacía', () => {
    // 34SMB usa la cuenta genérica «Abastecimiento»; 04PDG, un usuario llamado «06MQH».
    const [m] = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Hogar 34SMB 03/11/2026', responsable: 'Abastecimiento' })],
      NOMBRES, dias());
    expect(m.picker).toBe('Abastecimiento');
  });

  it('sin responsable el picker queda vacío', () => {
    const [m] = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Comida 56PZA 03/11/2026', responsable: '' })],
      NOMBRES, dias());
    expect(m.picker).toBe('');
  });
});

describe('movimientosDesdeOdoo: cada tienda solo toma los movimientos de SU día', () => {
  it('una apertura toma los de su día y no los de hoy', () => {
    // 62PLD abre: sus movimientos están fechados el 30/10 aunque la planilla sea del 03/11.
    const d = dias({ '62PLD': '2026-10-30' });
    const out = movimientosDesdeOdoo([
      crudo({ origin: 'Abastecimiento Apertura Hogar 1 - 62PLD 30/10/2026',
              registros: 60, responsable: '', dia: '2026-10-30' }),
    ], NOMBRES, d);
    expect(out).toHaveLength(1);
    expect(out[0].cod).toBe('62PLD');
    expect(out[0].seccion).toBe('Hogar');   // «Abastecimiento Apertura Hogar» también se reconoce
  });

  it('un movimiento del día de la apertura NO se le cuenta a una tienda normal', () => {
    // Al traer el 30/10 por 62PLD también vienen los movimientos de 27MCH de ese día: no van.
    const d = dias({ '62PLD': '2026-10-30' });
    const out = movimientosDesdeOdoo([
      crudo({ dia: '2026-10-30' }),   // 27MCH, pero del 30/10
    ], NOMBRES, d);
    expect(out).toHaveLength(0);
  });

  it('un movimiento de hoy NO se le cuenta a la tienda de apertura', () => {
    const d = dias({ '62PLD': '2026-10-30' });
    const out = movimientosDesdeOdoo([
      crudo({ origin: 'Abastecimiento Hogar 62PLD 03/11/2026', dia: HOY }),
    ], NOMBRES, d);
    expect(out).toHaveLength(0);
  });

  it('una tienda que no está en el mapa de días se descarta', () => {
    const out = movimientosDesdeOdoo(
      [crudo({ origin: 'Abastecimiento Comida 99XXX 03/11/2026' })], NOMBRES, dias());
    expect(out).toHaveLength(0);
  });
});

describe('movimientosDesdeOdoo: los backorders', () => {
  // El caso real medido el 05/11/2026: al validar, Odoo cerró 148618 con 4 registros y mandó el
  // resto —1 registro— a 148785, con backorder_id apuntando al primero.
  const ORIGINAL = crudo({ ref: '99REC/DT/148618', estado: 'done', registros: 4 });
  const RESTO = crudo({
    ref: '99REC/DT/148785', estado: 'assigned', registros: 1, responsable: '',
    validadoEn: null, backorderDe: '99REC/DT/148618',
  });

  it('lo que no es backorder no trae el campo', () => {
    const [m] = movimientosDesdeOdoo([ORIGINAL], NOMBRES, dias());
    expect(m.backorderDe).toBeUndefined();
  });

  it('el resto dice de qué movimiento quedó y con cuántos registros', () => {
    const out = movimientosDesdeOdoo([ORIGINAL, RESTO], NOMBRES, dias());
    expect(out).toHaveLength(2);
    expect(out[1].backorderDe).toEqual({ ref: '99REC/DT/148618', registros: 4 });
  });

  it('el índice se arma antes de descartar: un original ANULADO igual da su número', () => {
    // El original suele estar `done`, pero puede estar `cancel` y entonces no llega a la hoja.
    // Si el índice se armara después del descarte, la etiqueta quedaría sin número justo ahí.
    const out = movimientosDesdeOdoo(
      [{ ...ORIGINAL, estado: 'cancel' }, RESTO], NOMBRES, dias());
    expect(out.find(m => m.ref === '99REC/DT/148785')?.backorderDe)
      .toEqual({ ref: '99REC/DT/148618', registros: 4 });
  });

  it('si el original no vino, sigue marcado como resto pero sin número', () => {
    const [m] = movimientosDesdeOdoo([RESTO], NOMBRES, dias());
    expect(m.backorderDe).toEqual({ ref: '99REC/DT/148618', registros: null });
  });

  it('el original de OTRA tienda no se usa para resolver', () => {
    // El índice es por referencia, que es única en Odoo; esto fija que no se resuelva por
    // tienda o por sección, que sí se repiten.
    const out = movimientosDesdeOdoo([
      crudo({ ref: '99REC/DT/148618', origin: 'Abastecimiento Comida 34SMB 03/11/2026', registros: 4 }),
      { ...RESTO, origin: 'Abastecimiento Comida 27MCH 03/11/2026' },
    ], NOMBRES, dias());
    const resto = out.find(m => m.ref === '99REC/DT/148785');
    expect(resto?.cod).toBe('27MCH');
    expect(resto?.backorderDe).toEqual({ ref: '99REC/DT/148618', registros: 4 });
  });
});
