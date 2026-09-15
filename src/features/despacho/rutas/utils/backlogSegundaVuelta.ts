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
 * Une lo calculado con lo que ya estaba guardado a mano.
 *
 * Lo GUARDADO manda: si alguien cerró el día y ajustó la lista, esa decisión no se pisa con un
 * cálculo. El cálculo solo aporta lo que nadie registró — que es justamente el caso que se está
 * arreglando.
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

/** Un manifiesto, reducido a lo que el backlog necesita. */
export interface ManifiestoRuteado { fecha: string; cods: string[] }

/**
 * Los códigos que ya salieron para un día de origen: los de ESE día y los de cualquier día
 * POSTERIOR.
 *
 * Tiene un límite conocido: si una tienda tiene carga el lunes y el martes, y el jueves sale un
 * manifiesto, no hay forma de saber si cubrió la del lunes, la del martes o las dos — el manifiesto
 * no guarda de qué día venía la carga. Se asume que cubre ambas, que es el lado seguro: no
 * despachar de más.
 */
export function ruteadasParaOrigen(
  manifiestos: ManifiestoRuteado[],
  fechaOrigen: string,
): Set<string> {
  const out = new Set<string>();
  for (const m of manifiestos) {
    if (m.fecha < fechaOrigen) continue;
    for (const c of m.cods) {
      const cod = String(c ?? '').trim().toUpperCase();
      if (cod) out.add(cod);
    }
  }
  return out;
}
