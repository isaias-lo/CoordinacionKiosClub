// El archivo que se baja, una función por vista. Módulo puro.
//
// La celda de una sección puede llevar DOS movimientos (los dos Hogar de 38SP2). En el CSV van en
// una sola celda, separados por « / »: el separador NO es una coma justamente para que la celda no
// necesite comillas y la línea conserve sus 12 campos. Si fuera «63, 46» correría todas las
// columnas que siguen y el archivo se abriría torcido en la planilla de cálculo.
//
// El entrecomillado queda solo donde el RFC 4180 lo pide: cuando el texto trae una coma, una
// comilla o un salto de línea. Eso pasa de verdad con un nombre como «Vergara, Marcelo».

import { SECCIONES, porAsignacion, type Planilla, type MovimientoPlanilla } from './armarPlanilla';
import { marcaBackorder } from './backorders';
import { COLOR_ZONA } from './zonaPlanilla';
import { horaChile, duracionMinutos, formatearDuracion } from './horasPlanilla';

/** Entre comillas solo si hace falta, y las comillas de adentro se duplican (RFC 4180). */
function campo(v: string | number): string {
  const s = String(v);
  if (!/[",\n]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

const fila = (cs: Array<string | number>): string => cs.map(campo).join(',');

/** La matriz: una línea por tienda y la de totales al final. */
export function csvVistaPlanilla(p: Planilla, fecha: string): string {
  const encabezados = ['Fecha', '#', 'Tienda', 'Zona'];
  for (const s of SECCIONES) encabezados.push(s, 'Usuario ' + s);

  const lineas = [encabezados.join(',')];

  p.filas.forEach((f, i) => {
    const cs: Array<string | number> = [fecha, i + 1, f.cod, COLOR_ZONA[f.zona].label];
    for (const s of SECCIONES) {
      const celda = f.celdas[s];
      cs.push(celda.map(c => c.registros).join(' / '));
      // La marca ↳4 va pegada al nombre, igual que en el papel: la columna del archivo es la
      // misma, y separarla en otra columna correría todas las que siguen.
      cs.push(celda.map(c =>
        (c.backorderDe ? marcaBackorder(c.backorderDe) + ' ' : '') + c.picker).join(' / '));
    }
    lineas.push(fila(cs));
  });

  const tot: Array<string | number> = [fecha, '', 'TOTAL', ''];
  for (const s of SECCIONES) tot.push(p.totales[s], '');
  lineas.push(fila(tot));

  return lineas.join('\n');
}

/** El detalle: una línea por movimiento, ordenada por hora de inicio. */
export function csvVistaDetalle(movimientos: MovimientoPlanilla[], fecha: string): string {
  // «Resto de» va en una COLUMNA propia y no como marca pegada al nombre: en el detalle hay
  // espacio, y la referencia del movimiento original sirve para buscarlo en Odoo. La columna
  // nueva va AL FINAL — las hojas de este proyecto se escriben por posición y una columna al
  // medio corre todo lo que sigue.
  const lineas = ['Fecha,Tienda,Seccion,Usuario,Registros,Inicio,Validado,Duracion,Estado,Resto de'];

  for (const m of [...movimientos].sort(porAsignacion)) {
    lineas.push(fila([
      fecha, m.cod, m.seccion, m.picker, m.registros,
      horaChile(m.asignadoEn), horaChile(m.validadoEn),
      formatearDuracion(duracionMinutos(m.asignadoEn, m.validadoEn)),
      m.estado,
      m.backorderDe ? m.backorderDe.ref : '',
    ]));
  }

  return lineas.join('\n');
}
