// El archivo que se baja, una función por vista. Módulo puro.
//
// La celda de una sección puede llevar DOS movimientos (los dos Hogar de 38SP2). En el CSV van en
// una sola celda, separados por « / » y entre comillas: una coma suelta ahí correría todas las
// columnas que siguen y el archivo se abriría torcido en la planilla de cálculo.

import { SECCIONES, type Planilla, type MovimientoPlanilla } from './armarPlanilla';
import { COLOR_ZONA } from './zonaPlanilla';
import { horaChile, duracionMinutos, formatearDuracion } from './horasPlanilla';

/** Texto que ya viene escapado: `fila` lo escribe tal cual, sin volver a entrecomillarlo. */
interface Crudo { crudo: string }
type Valor = string | number | Crudo;

/** Entre comillas solo si hace falta, y las comillas de adentro se duplican (RFC 4180). */
function campo(v: string | number): string {
  const s = String(v);
  if (!/[",\n]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * Los valores de una celda de la matriz. Con más de un movimiento van SIEMPRE entre comillas,
 * aunque «63 / 46» no tenga coma: es lo que avisa a quien lee el archivo que son dos datos en
 * una celda, y protege si el separador algún día cambia a uno que sí la tenga.
 */
function celdaCsv(valores: Array<string | number>): Crudo {
  const s = valores.join(' / ');
  return { crudo: valores.length > 1 ? '"' + s.replace(/"/g, '""') + '"' : s };
}

const fila = (cs: Array<Valor>): string =>
  cs.map(v => (typeof v === 'object' ? v.crudo : campo(v))).join(',');

/** La matriz: una línea por tienda y la de totales al final. */
export function csvVistaPlanilla(p: Planilla, fecha: string): string {
  const encabezados = ['Fecha', '#', 'Tienda', 'Zona'];
  for (const s of SECCIONES) encabezados.push(s, 'Usuario ' + s);

  const lineas = [encabezados.join(',')];

  p.filas.forEach((f, i) => {
    const cs: Array<Valor> = [fecha, i + 1, f.cod, COLOR_ZONA[f.zona].label];
    for (const s of SECCIONES) {
      const celda = f.celdas[s];
      cs.push(celdaCsv(celda.map(c => c.registros)));
      cs.push(celdaCsv(celda.map(c => c.picker)));
    }
    lineas.push(fila(cs));
  });

  const tot: Array<Valor> = [fecha, '', 'TOTAL', ''];
  for (const s of SECCIONES) tot.push(p.totales[s], '');
  lineas.push(fila(tot));

  return lineas.join('\n');
}

/** El detalle: una línea por movimiento, ordenada por hora de inicio. */
export function csvVistaDetalle(movimientos: MovimientoPlanilla[], fecha: string): string {
  const lineas = ['Fecha,Tienda,Seccion,Usuario,Registros,Inicio,Validado,Duracion,Estado'];

  const ordenados = [...movimientos].sort((a, b) => {
    if (!a.asignadoEn && !b.asignadoEn) return 0;
    if (!a.asignadoEn) return 1;
    if (!b.asignadoEn) return -1;
    return a.asignadoEn < b.asignadoEn ? -1 : a.asignadoEn > b.asignadoEn ? 1 : 0;
  });

  for (const m of ordenados) {
    lineas.push(fila([
      fecha, m.cod, m.seccion, m.picker, m.registros,
      horaChile(m.asignadoEn), horaChile(m.validadoEn),
      formatearDuracion(duracionMinutos(m.asignadoEn, m.validadoEn)),
      m.estado,
    ]));
  }

  return lineas.join('\n');
}
