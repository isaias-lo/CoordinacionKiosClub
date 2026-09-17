// El backlog de 2ª vuelta, calculado desde los datos. Puro y testeable.
//
// Hasta ahora el backlog dependía de un botón: lo que quedaba sin asignar pasaba a 2ª vuelta SOLO
// al apretar "Terminar día". Si nadie cerraba la jornada, la carga sobrante no quedaba en ninguna
// parte — y el tab decía "No hay pendientes", que era cierto y a la vez inútil.
//
// Pasó tres días seguidos: 10, 11 y 14 de septiembre sin fila `rutas_reg`, y el 14 con NUEVE
// tiendas (28 pallets, 15 bultos, 8 chocolates) registradas en bodega y fuera de todo manifiesto.
// Invisibles para la operación con toda su data en la base.
//
// Acá el backlog se deduce de dos hechos que ya existen, sin que nadie tenga que acordarse de nada:
//
//     lo que Bodega REGISTRÓ ese día      (despacho_sesion)
//   − lo que entró en algún MANIFIESTO    (ruta_tiendas)
//   = lo que quedó pendiente
//
// Es la misma cuenta que se hizo a mano en SQL para encontrar esas nueve. La diferencia es que
// ahora la hace el sistema, y sirve para los días que ya pasaron: no hay que arreglar el pasado a
// mano, aparece solo.

export interface CargaRegistrada {
  cod: string;
  pallets: number;
  bultos: number;
  contenedores?: number;
  chocolates?: number;
}

export interface PendienteBacklog {
  c: string;
  p: number;
  b: number;
  ch: number;
  fechaOrigen: string;
}

/**
 * Lo que quedó pendiente de un día: registrado en bodega y sin entrar a ningún manifiesto.
 *
 * `ruteadas` son los códigos que salieron ese día **o DESPUÉS**. Esa es la parte que importa: una
 * 2ª vuelta se despacha en un día POSTERIOR al de origen, así que mirar solo los manifiestos de la
 * misma fecha marcaba como pendiente algo que ya había salido. Medido sobre septiembre: de 28
 * "pendientes", 15 eran falsos — las 11 del 09 salieron entre el 10 y el 14, y 4 de las del 10
 * salieron el 11 y el 14.
 *
 * Un falso positivo acá es peor que un falso negativo: lleva a despachar dos veces la misma carga.
 *
 * Una tienda sin carga no es pendiente —no hay nada que despachar— y una con carga 0 tampoco,
 * aunque tenga fila. Los contenedores suman como pallet: ocupan piso igual.
 */
export function pendientesDelDia(
  carga: CargaRegistrada[],
  ruteadas: ReadonlySet<string>,
  fechaOrigen: string,
): PendienteBacklog[] {
  const out: PendienteBacklog[] = [];
  for (const r of carga) {
    const c = String(r.cod ?? '').trim().toUpperCase();
    if (!c || ruteadas.has(c)) continue;
    const p  = (r.pallets ?? 0) + (r.contenedores ?? 0);
    const b  = r.bultos ?? 0;
    const ch = r.chocolates ?? 0;
    if (p === 0 && b === 0 && ch === 0) continue;
    out.push({ c, p, b, ch, fechaOrigen });
  }
  return out.sort((a, b) => a.c.localeCompare(b.c));
}

/**
 * Une lo calculado con lo que se guardó al cerrar el día.
 *
 * Lo GUARDADO manda: si alguien cerró el día y ajustó la lista, esa decisión no se pisa. El cálculo
 * aporta lo que esa lista no puede cubrir — y ese hueco es real: al cerrar el día solo se guardan
 * las tiendas SIN camión, así que una tienda asignada a un camión que nunca se cerró no entra en
 * ninguna de las dos listas. El 16/09 así se perdieron cuatro (01TPS, 02SCL, 06MQH y 37VIÑ, en los
 * camiones VRYL52 y VYJL23).
 *
 * Durante un tiempo esto descartó el cálculo en los días cerrados, para tapar los falsos positivos
 * que producía preguntar por el manifiesto maestro. Ya no hace falta: con la pregunta correcta
 * —¿tiene patente en Control Despacho?— el cálculo dejó de inventar pendientes, y taparlo solo
 * servía para esconder las que sí lo eran.
 */
export function unirBacklog(
  guardado: PendienteBacklog[],
  calculado: PendienteBacklog[],
): PendienteBacklog[] {
  const clave = (x: PendienteBacklog) => `${x.fechaOrigen}::${x.c}`;
  const vistos = new Set(guardado.map(clave));
  return [...guardado, ...calculado.filter(x => !vistos.has(clave(x)))];
}

/** Texto del total, para la cabecera del tab. Vacío si no hay nada. */
export function textoBacklog(p: PendienteBacklog[]): string {
  if (!p.length) return '';
  const tiendas = new Set(p.map(x => x.c)).size;
  const dias = new Set(p.map(x => x.fechaOrigen)).size;
  const t = `${tiendas} ${tiendas === 1 ? 'tienda' : 'tiendas'}`;
  const d = `${dias} ${dias === 1 ? 'día' : 'días'}`;
  return `${t} de ${d}`;
}

/** Lo despachado un día: las tiendas que salieron, según Control Despacho. */
export interface DespachoDelDia { fecha: string; cods: string[] }

/** "DD/MM/YYYY" desde "YYYY-MM-DD". Control Despacho guarda la fecha en el formato de la planilla. */
export function aFechaPlanilla(iso: string): string {
  const [a, m, d] = String(iso ?? '').split('-');
  return (a && m && d) ? `${d}/${m}/${a}` : '';
}

/** "YYYY-MM-DD" desde "DD/MM/YYYY". Vacío si no tiene esa forma. */
export function desdeFechaPlanilla(ddmmaaaa: string): string {
  const m = String(ddmmaaaa ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/**
 * Los códigos que ya salieron para un día de origen: los de ESE día y los de cualquier día
 * POSTERIOR.
 *
 * La pregunta que responde esto cambió, y es el corazón del arreglo. Antes era «¿tiene manifiesto
 * MAESTRO guardado?», y esa es la pregunta equivocada: el manifiesto maestro es opcional. En la
 * operación se imprimen los manifiestos POR TIENDA —que es lo que necesita el chofer— y el maestro
 * muchas veces no. Medido el 15/09: de 28 tiendas con carga, 28 salieron según Control Despacho,
 * pero solo 9 tenían fila de manifiesto maestro. Las otras 19 se contaban como pendientes sin serlo.
 *
 * La pregunta correcta es la que hace el coordinador cuando revisa: **¿tiene PATENTE en Control
 * Despacho?**. Es el mismo hecho que «se cerró su camión», pero anotado tienda por tienda — y eso
 * importa: el 16/09 los camiones se marcaron cerrados a las 19:50 y el tablero siguió cambiando
 * hasta las 22:54, así que preguntar por el camión habría dado por salidas a tiendas que se le
 * agregaron después.
 *
 * Sigue el límite conocido de siempre: si una tienda tiene carga el lunes y el martes y sale el
 * jueves, no hay forma de saber cuál de las dos cubrió. Se asume que cubre ambas, que es el lado
 * seguro: no despachar de más.
 */
export function despachadasParaOrigen(
  despachos: DespachoDelDia[],
  fechaOrigen: string,
): Set<string> {
  const out = new Set<string>();
  for (const d of despachos) {
    if (d.fecha < fechaOrigen) continue;
    for (const c of d.cods) {
      const cod = String(c ?? '').trim().toUpperCase();
      if (cod) out.add(cod);
    }
  }
  return out;
}
