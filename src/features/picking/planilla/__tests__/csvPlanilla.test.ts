import { describe, it, expect } from 'vitest';
import { csvVistaPlanilla, csvVistaDetalle } from '../csvPlanilla';
import { armarPlanilla, type MovimientoPlanilla } from '../armarPlanilla';

const TIENDAS = [{ cod: '38SP2', zona: 'sur' as const }, { cod: '75PUC', zona: 'sur' as const }];

const MOVS: MovimientoPlanilla[] = [
  { cod: '38SP2', seccion: 'Hogar', registros: 63, picker: 'Marcelo Vergara',
    asignadoEn: '2026-11-03 11:00:00', validadoEn: '2026-11-03 13:26:00', estado: 'done' },
  { cod: '38SP2', seccion: 'Hogar', registros: 46, picker: 'Marcelo Vergara',
    asignadoEn: '2026-11-03 14:00:00', validadoEn: null, estado: 'assigned' },
  { cod: '38SP2', seccion: 'Comida', registros: 119, picker: 'Ignacio Poblete',
    asignadoEn: '2026-11-03 11:30:00', validadoEn: '2026-11-03 14:00:00', estado: 'done' },
];

describe('csvVistaPlanilla', () => {
  const csv = csvVistaPlanilla(armarPlanilla(MOVS, TIENDAS), '2026-11-03');
  const lineas = csv.split('\n');

  it('la primera línea son los encabezados', () => {
    expect(lineas[0]).toBe('Fecha,#,Tienda,Zona,Comida,Usuario Comida,Aseo,Usuario Aseo,Hogar,Usuario Hogar,Chocolates,Usuario Chocolates');
  });

  it('una celda con dos movimientos no rompe las columnas', () => {
    // Los dos valores van en UNA celda separados por « / ». No se entrecomillan porque el
    // separador no es una coma: entrecomillar sin necesidad va contra el RFC 4180 y obliga a
    // mantener un segundo camino de escape. Lo que importa es que la línea siga teniendo 12
    // campos, y eso es lo que se mide.
    expect(lineas[1]).toContain('63 / 46');
    expect(lineas[1]).toContain('Marcelo Vergara / Marcelo Vergara');
    // 12 encabezados ⇒ 11 comas fuera de las comillas.
    expect(lineas[1].replace(/"[^"]*"/g, 'X').split(',')).toHaveLength(12);
  });

  it('la tienda sin carga sale con sus celdas vacías', () => {
    expect(lineas[2]).toBe('2026-11-03,2,75PUC,Ruta Sur,,,,,,,,');
  });

  it('la última línea son los totales', () => {
    expect(lineas[lineas.length - 1]).toBe('2026-11-03,,TOTAL,,119,,0,,109,,0,');
  });
});

describe('csvVistaDetalle', () => {
  const csv = csvVistaDetalle(MOVS, '2026-11-03');
  const lineas = csv.split('\n');

  it('la primera línea son los encabezados', () => {
    expect(lineas[0]).toBe('Fecha,Tienda,Seccion,Usuario,Registros,Inicio,Validado,Duracion,Estado');
  });

  it('una fila por movimiento, ordenada por hora de inicio', () => {
    expect(lineas).toHaveLength(4);   // encabezado + 3
    expect(lineas[1]).toBe('2026-11-03,38SP2,Hogar,Marcelo Vergara,63,08:00,10:26,2 h 26,done');
  });

  it('un movimiento sin validar deja la duración en raya y la hora vacía', () => {
    expect(lineas[3]).toBe('2026-11-03,38SP2,Hogar,Marcelo Vergara,46,11:00,,—,assigned');
  });

  it('un nombre con coma iría entre comillas', () => {
    const uno = csvVistaDetalle(
      [{ ...MOVS[0], picker: 'Vergara, Marcelo' }], '2026-11-03').split('\n')[1];
    expect(uno).toContain('"Vergara, Marcelo"');
  });
});
