import { describe, it, expect } from 'vitest';
import {
  fechaDeSerial, normalizar, planRegistro, serialDeFecha, tiendaDeCadaFila, type FilaHoja,
} from '../registroOlas';
import type { MovimientoPlanilla } from '../armarPlanilla';

// Los nombres son los medidos en la hoja el 05/11/2026. Varios llevan espacio al final a
// propósito: es lo que la hoja tiene y quitarlo rompe el cruce del bono.
const NOMBRES = new Map([
  ['Cristian Morales', 'Cristian Morales '],
  ['Christian Flores', 'Christian Flores'],
  ['Marcelo Vergara', 'MARCELO VERGARA'],
  ['Zervens Louissant', 'Zervens Louissant'],
  ['Simon Sabathier', 'Simón Sabathier'],
  ['Valentina Conejera', 'Valentina Conejera'],
  ['Diego Farr', 'Diego Farr'],
]);

function mov(p: Partial<MovimientoPlanilla> = {}): MovimientoPlanilla {
  return {
    cod: '57CAS', seccion: 'Comida', registros: 30, picker: 'Cristian Morales',
    cuenta: 'Pickers 18', asignadoEn: '2026-11-05 11:00:00', validadoEn: null,
    estado: 'assigned', ...p,
  };
}

/** El esqueleto tal como lo arma la hoja: la tienda solo en la primera fila del grupo. */
function grupo(desde: number, tienda: string): FilaHoja[] {
  return [
    { fila: desde,     tienda, seccion: 'COMIDA', pistolero: '', usuario: '' },
    { fila: desde + 1, tienda: '', seccion: 'ASEO ', pistolero: '', usuario: '' },
    { fila: desde + 2, tienda: '', seccion: 'HOGAR', pistolero: '', usuario: '' },
  ];
}

describe('normalizar', () => {
  it('ignora acentos, mayúsculas y espacios al borde', () => {
    expect(normalizar('ASEO ')).toBe('ASEO');
    expect(normalizar('Simón Sabathier')).toBe('SIMON SABATHIER');
    expect(normalizar('  hogar  ')).toBe('HOGAR');
  });

  it('colapsa la Ñ como el catálogo', () => {
    expect(normalizar('37VIÑ')).toBe(normalizar('37VIN'));
  });
});

describe('tiendaDeCadaFila', () => {
  it('arrastra la tienda a las filas que la dejan en blanco', () => {
    // La hoja pone el código solo en la primera fila del grupo; sin arrastrarlo, Aseo y Hogar
    // no calzarían con ninguna tienda y quedarían sin registrar.
    const m = tiendaDeCadaFila(grupo(10, '57CAS'));
    expect(m.get(10)).toBe('57CAS');
    expect(m.get(11)).toBe('57CAS');
    expect(m.get(12)).toBe('57CAS');
  });

  it('cambia de tienda al llegar al grupo siguiente', () => {
    const m = tiendaDeCadaFila([...grupo(10, '57CAS'), ...grupo(13, '28TEM')]);
    expect(m.get(12)).toBe('57CAS');
    expect(m.get(13)).toBe('28TEM');
    expect(m.get(15)).toBe('28TEM');
  });

  it('chocolates y congelados NO heredan la última tienda', () => {
    // Son del día entero. Si heredaran, el chocolate se registraría como si fuera de la última
    // tienda de la lista.
    const filas: FilaHoja[] = [...grupo(10, '57CAS'),
      { fila: 13, tienda: '', seccion: 'CHOCOLATES', pistolero: '', usuario: '' },
      { fila: 14, tienda: '', seccion: 'CONGELADOS', pistolero: '', usuario: '' }];
    const m = tiendaDeCadaFila(filas);
    expect(m.has(13)).toBe(false);
    expect(m.has(14)).toBe(false);
  });
});

describe('planRegistro: el caso normal', () => {
  it('escribe el nombre de la hoja en F y la cuenta de Odoo en S', () => {
    const p = planRegistro(
      [mov({ seccion: 'Comida' }), mov({ seccion: 'Aseo' }), mov({ seccion: 'Hogar' })],
      grupo(10, '57CAS'), NOMBRES);
    expect(p.escrituras).toEqual([
      { fila: 10, columna: 'F', valor: 'Cristian Morales ' },
      { fila: 10, columna: 'S', valor: 'Pickers 18' },
      { fila: 11, columna: 'F', valor: 'Cristian Morales ' },
      { fila: 11, columna: 'S', valor: 'Pickers 18' },
      { fila: 12, columna: 'F', valor: 'Cristian Morales ' },
      { fila: 12, columna: 'S', valor: 'Pickers 18' },
    ]);
    expect(p.avisos).toEqual([]);
    expect(p.filasAEscribir).toBe(3);
  });

  it('el nombre que va a F NO es el del sistema, es el de la hoja', () => {
    // Es el punto entero: «Simon Sabathier» en el sistema, «Simón Sabathier» en la hoja. Con el
    // del sistema el SUMIFS del bono no encuentra y esa persona cobra cero.
    const p = planRegistro([mov({ cod: '43CUR', picker: 'Simon Sabathier', cuenta: 'Pickers 4' })],
      grupo(10, '43CUR'), NOMBRES);
    expect(p.escrituras[0].valor).toBe('Simón Sabathier');
  });

  it('cada sección puede llevar una persona distinta', () => {
    // 50PTM el 05/11: Comida de Zervens, Aseo y Hogar de Marcelo.
    const p = planRegistro([
      mov({ cod: '50PTM', seccion: 'Comida', picker: 'Zervens Louissant', cuenta: 'Pickers 14' }),
      mov({ cod: '50PTM', seccion: 'Aseo',   picker: 'Marcelo Vergara',   cuenta: 'Pickers 7' }),
      mov({ cod: '50PTM', seccion: 'Hogar',  picker: 'Marcelo Vergara',   cuenta: 'Pickers 7' }),
    ], grupo(10, '50PTM'), NOMBRES);
    expect(p.escrituras.filter(e => e.columna === 'F').map(e => e.valor))
      .toEqual(['Zervens Louissant', 'MARCELO VERGARA', 'MARCELO VERGARA']);
  });

  it('calza la tienda aunque la Ñ venga distinta', () => {
    const p = planRegistro([mov({ cod: '37VIÑ' })], grupo(10, '37VIN'), NOMBRES);
    expect(p.escrituras).toHaveLength(2);
  });

  it('una tienda sin carga deja sus filas vacías, sin avisar', () => {
    // 75PUC el 05/11 no tuvo picker. La hoja la deja en blanco y así está bien.
    const p = planRegistro([], grupo(10, '75PUC'), NOMBRES);
    expect(p.escrituras).toEqual([]);
    expect(p.avisos).toEqual([]);
  });

  it('un movimiento anulado no se registra', () => {
    const p = planRegistro([mov({ estado: 'cancel' }), mov({ estado: 'confirmed' })],
      grupo(10, '57CAS'), NOMBRES);
    expect(p.escrituras).toEqual([]);
  });
});

describe('planRegistro: lo que NO se escribe', () => {
  it('una persona sin nombre para esta planilla se salta y se avisa', () => {
    const p = planRegistro([mov({ picker: 'Alguien Nuevo', cuenta: 'Pickers 99' })],
      grupo(10, '57CAS'), NOMBRES);
    expect(p.escrituras).toEqual([]);
    expect(p.avisos[0].tipo).toBe('sin-nombre-olas');
    expect(p.avisos[0].detalle).toContain('Alguien Nuevo');
  });

  it('dos pickers en la misma celda se dejan a mano', () => {
    // No cabe una sola persona en una sola fila, y elegir una sería decidir a quién se le abona.
    const p = planRegistro([
      mov({ seccion: 'Comida', picker: 'Cristian Morales', cuenta: 'Pickers 18', registros: 30 }),
      mov({ seccion: 'Comida', picker: 'Marcelo Vergara', cuenta: 'Pickers 7', registros: 54 }),
    ], grupo(10, '57CAS'), NOMBRES);
    expect(p.escrituras).toEqual([]);
    expect(p.avisos[0].tipo).toBe('pickers-distintos');
  });

  it('dos movimientos de la MISMA persona sí se escriben', () => {
    // 57CAS Comida el 05/11: 30 y 54, los dos de Cristian Morales. Una sola fila, un solo nombre.
    const p = planRegistro([
      mov({ seccion: 'Comida', registros: 30 }),
      mov({ seccion: 'Comida', registros: 54 }),
    ], grupo(10, '57CAS'), NOMBRES);
    expect(p.escrituras).toEqual([
      { fila: 10, columna: 'F', valor: 'Cristian Morales ' },
      { fila: 10, columna: 'S', valor: 'Pickers 18' },
    ]);
  });

  it('una celda que ya dice otra cosa no se pisa', () => {
    const filas = grupo(10, '57CAS');
    filas[0] = { ...filas[0], pistolero: 'OTRA PERSONA', usuario: 'Pickers 2' };
    const p = planRegistro([mov()], filas, NOMBRES);
    expect(p.escrituras).toEqual([]);
    expect(p.avisos[0].tipo).toBe('ya-escrita');
    expect(p.avisos[0].detalle).toContain('OTRA PERSONA');
  });

  it('una celda que ya dice LO MISMO no se reescribe ni avisa', () => {
    const filas = grupo(10, '57CAS');
    filas[0] = { ...filas[0], pistolero: 'Cristian Morales ', usuario: 'Pickers 18' };
    const p = planRegistro([mov()], filas, NOMBRES);
    expect(p.escrituras).toEqual([]);
    expect(p.avisos).toEqual([]);
  });

  it('una tienda con trabajo que no tiene fila en la hoja se avisa', () => {
    // El esqueleto se arma antes del turno y puede quedar corto. Sin aviso, esa tienda
    // simplemente no quedaría registrada y nadie lo notaría.
    const p = planRegistro([mov({ cod: '99XXX' })], grupo(10, '57CAS'), NOMBRES);
    expect(p.avisos.some(a => a.tipo === 'sin-fila' && a.detalle.includes('99XXX'))).toBe(true);
  });

  it('nunca escribe en una columna que no sea F o S', () => {
    // La hoja tiene fórmulas en T, U y X, y A/B/C las pone el esqueleto. Es el invariante que
    // impide que este registro rompa algo que no es suyo.
    const p = planRegistro(
      [mov({ seccion: 'Comida' }), mov({ seccion: 'Aseo' }), mov({ seccion: 'Hogar' })],
      grupo(10, '57CAS'), NOMBRES);
    expect(p.escrituras.every(e => e.columna === 'F' || e.columna === 'S')).toBe(true);
  });
});

describe('planRegistro: los chocolates', () => {
  const filasChoc: FilaHoja[] = [
    { fila: 20, tienda: '', seccion: 'CHOCOLATES', pistolero: '', usuario: '' },
    { fila: 21, tienda: '', seccion: 'CHOCOLATES', pistolero: '', usuario: '' },
  ];

  it('agrupa por persona: una fila por persona, no por tienda', () => {
    // En la planilla el chocolate sale por tienda; en la hoja es una fila por persona del día.
    const p = planRegistro([
      mov({ cod: '57CAS', seccion: 'Chocolates', picker: 'Diego Farr', cuenta: 'Pickers 11', registros: 18 }),
      mov({ cod: '28TEM', seccion: 'Chocolates', picker: 'Valentina Conejera', cuenta: 'Pickers 13', registros: 13 }),
      mov({ cod: '60PBL', seccion: 'Chocolates', picker: 'Diego Farr', cuenta: 'Pickers 11', registros: 8 }),
    ], filasChoc, NOMBRES);
    expect(p.escrituras).toEqual([
      { fila: 20, columna: 'F', valor: 'Diego Farr' },          // 18+8 = 26, va primero
      { fila: 20, columna: 'S', valor: 'Pickers 11' },
      { fila: 21, columna: 'F', valor: 'Valentina Conejera' },  // 13
      { fila: 21, columna: 'S', valor: 'Pickers 13' },
    ]);
  });

  it('el orden sale del volumen, no de en qué tienda apareció primero', () => {
    const p = planRegistro([
      mov({ cod: '57CAS', seccion: 'Chocolates', picker: 'Valentina Conejera', cuenta: 'Pickers 13', registros: 4 }),
      mov({ cod: '28TEM', seccion: 'Chocolates', picker: 'Diego Farr', cuenta: 'Pickers 11', registros: 40 }),
    ], filasChoc, NOMBRES);
    expect(p.escrituras[0].valor).toBe('Diego Farr');
  });

  it('más personas que filas: avisa y escribe las de más volumen', () => {
    const p = planRegistro([
      mov({ seccion: 'Chocolates', picker: 'Diego Farr', cuenta: 'Pickers 11', registros: 30 }),
      mov({ cod: '28TEM', seccion: 'Chocolates', picker: 'Valentina Conejera', cuenta: 'Pickers 13', registros: 20 }),
      mov({ cod: '60PBL', seccion: 'Chocolates', picker: 'Cristian Morales', cuenta: 'Pickers 18', registros: 10 }),
    ], filasChoc, NOMBRES);
    expect(p.avisos.some(a => a.tipo === 'chocolates-no-calza')).toBe(true);
    expect(p.escrituras.filter(e => e.columna === 'F').map(e => e.valor))
      .toEqual(['Diego Farr', 'Valentina Conejera']);
  });

  it('los congelados no se tocan', () => {
    // Viven en otra pestaña de Picking y no están en esta planilla.
    const filas: FilaHoja[] = [{ fila: 30, tienda: '', seccion: 'CONGELADOS', pistolero: '', usuario: '' }];
    const p = planRegistro([mov({ seccion: 'Comida' })], filas, NOMBRES);
    expect(p.escrituras).toEqual([]);
  });
});

describe('el serial de la fecha', () => {
  it('convierte en los dos sentidos', () => {
    // Medido contra la hoja: el bloque del 05/11/2026 tiene 46331 en la columna A.
    expect(serialDeFecha('2026-11-05')).toBe(46331);
    expect(fechaDeSerial(46331)).toBe('2026-11-05');
    expect(serialDeFecha('2026-11-06')).toBe(46332);
  });

  it('rechaza el serial roto que la hoja tiene hoy', () => {
    // El 06/11/2026 el bloque del día traía −619871: alguien tipeó el año «0202». Ni esta
    // función ni el XLOOKUP del bono lo encuentran, así que tiene que dar null y no una fecha
    // del año 202 que parecería un dato válido.
    expect(fechaDeSerial(-619871)).toBeNull();
    expect(fechaDeSerial(0)).toBeNull();
    expect(fechaDeSerial(NaN)).toBeNull();
  });

  it('ida y vuelta sobre un mes entero', () => {
    for (let d = 1; d <= 30; d++) {
      const iso = `2026-11-${String(d).padStart(2, '0')}`;
      expect(fechaDeSerial(serialDeFecha(iso))).toBe(iso);
    }
  });
});

describe('planRegistro: la fila de Falabella Full', () => {
  // La hoja la tiene vacía desde el 23/07/2026 y esta planilla no la llena: el trabajo de
  // Falabella Full no se paga por acá. No es una sección DESCONOCIDA —es una que se deja a mano,
  // como congelados—, y tratarla de desconocida sacaba un aviso falso en cada registro de lunes
  // y miércoles.
  const conCola = (seccion: string): FilaHoja[] => [
    ...grupo(10, '57CAS'),
    { fila: 13, tienda: '', seccion: 'CONGELADOS', pistolero: '', usuario: '' },
    { fila: 14, tienda: '', seccion, pistolero: '', usuario: '' },
  ];

  it('no se le escribe nada', () => {
    const plan = planRegistro([mov()], conCola('Fala full'), NOMBRES);
    expect(plan.escrituras.some(e => e.fila === 14)).toBe(false);
  });

  it('no saca un aviso de «sección desconocida», en ninguna de sus grafías', () => {
    // Las dos que la hoja tiene, medidas el 10/11/2026, más una mayúscula por si alguien la
    // reescribe: el calce es normalizado.
    for (const grafia of ['Fala full', 'falabella full', 'FALABELLA FULL', 'Falabella Full']) {
      const plan = planRegistro([mov()], conCola(grafia), NOMBRES);
      expect(plan.avisos.map(a => a.detalle).join(' | ')).not.toContain('desconocida');
    }
  });

  it('una sección que de verdad no se conoce sigue avisando', () => {
    const plan = planRegistro([mov()], conCola('PANADERÍA'), NOMBRES);
    expect(plan.avisos.some(a => a.detalle.includes('desconocida'))).toBe(true);
  });
});
