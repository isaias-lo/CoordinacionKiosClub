import { describe, it, expect } from 'vitest';
import { planRuteoCongelados } from '../ruteoControlCong';

const HDR = ['Fecha Armado','Fecha Despacho','Día','Tienda','Cajas CC','Cajas CN','Total Cajas','Patente','Cód. normalizado','Región'];
// Lo que dejó Bodega al registrar el 11/09 para despacho del 14/09: sin patente.
const HOJA = [
  HDR,
  ['11/09/2026','14/09/2026','Lunes','22LGN',12,1,13,'','22LGN','RM'],
  ['11/09/2026','14/09/2026','Lunes','16PQA', 3,1, 4,'','16PQA','RM'],
  ['11/09/2026','14/09/2026','Lunes','02SCL', 1,1, 2,'','02SCL','RM'],
];
/** Lo que manda el cierre: conoce el total pero NO el desglose CC/CN. */
const ruteo = (cod: string, patente: string, total: number) =>
  ['11/09/2026','14/09/2026','Lunes',cod,0,total,total,patente,cod,'RM'];

describe('planRuteoCongelados', () => {
  it('apunta a la fila que ya dejó Bodega, no crea una nueva', () => {
    const p = planRuteoCongelados(HOJA, [ruteo('22LGN','PKZW16',13)]);
    expect(p.updates).toEqual([{ fila: 2, patente: 'PKZW16' }]);
    expect(p.sinFila).toEqual([]);
  });

  it('el camión completo del 11/09 cae en sus tres filas', () => {
    const p = planRuteoCongelados(HOJA, [
      ruteo('02SCL','PKZW16',2), ruteo('16PQA','PKZW16',4), ruteo('22LGN','PKZW16',13),
    ]);
    expect(p.updates).toEqual([
      { fila: 4, patente: 'PKZW16' },
      { fila: 3, patente: 'PKZW16' },
      { fila: 2, patente: 'PKZW16' },
    ]);
  });

  it('NO devuelve cajas: el desglose CC/CN es de Bodega y el cierre no lo sabe', () => {
    const p = planRuteoCongelados(HOJA, [ruteo('22LGN','PKZW16',13)]);
    // Si esto devolviera la fila entera, 22LGN pasaría de CC 12 · CN 1 a CC 0 · CN 13.
    expect(Object.keys(p.updates[0])).toEqual(['fila', 'patente']);
  });

  it('una tienda ruteada sin registrar se reporta en vez de inventarle una fila', () => {
    const p = planRuteoCongelados(HOJA, [ruteo('31TLC','PKZW16',5)]);
    expect(p.updates).toEqual([]);
    expect(p.sinFila).toEqual(['31TLC']);
  });

  it('una fila de OTRO día de despacho no se toca', () => {
    const p = planRuteoCongelados(HOJA, [
      ['10/09/2026','11/09/2026','Viernes','22LGN',0,13,13,'PKZW16','22LGN','RM'],
    ]);
    expect(p.updates).toEqual([]);
    expect(p.sinFila).toEqual(['22LGN']);
  });

  it('sin patente no hay nada que rutear', () => {
    expect(planRuteoCongelados(HOJA, [ruteo('22LGN','',13)]).updates).toEqual([]);
  });

  it('normaliza espacios y minúsculas al cruzar', () => {
    const p = planRuteoCongelados(HOJA, [ruteo(' 22lgn ','PKZW16',13)]);
    expect(p.updates).toEqual([{ fila: 2, patente: 'PKZW16' }]);
  });

  it('con la hoja vacía (solo encabezado) todo queda sin fila', () => {
    const p = planRuteoCongelados([HDR], [ruteo('22LGN','PKZW16',13)]);
    expect(p.sinFila).toEqual(['22LGN']);
  });

  it('si una tienda estuviera duplicada, gana la primera fila', () => {
    const dup = [...HOJA, ['11/09/2026','14/09/2026','Lunes','22LGN',12,1,13,'','22LGN','RM']];
    expect(planRuteoCongelados(dup, [ruteo('22LGN','PKZW16',13)]).updates).toEqual([{ fila: 2, patente: 'PKZW16' }]);
  });

  it('tolera filas rotas en la hoja sin reventar', () => {
    const rota = [HDR, [], ['11/09/2026'], HOJA[1]];
    expect(planRuteoCongelados(rota, [ruteo('22LGN','PKZW16',13)]).updates).toEqual([{ fila: 4, patente: 'PKZW16' }]);
  });
});
