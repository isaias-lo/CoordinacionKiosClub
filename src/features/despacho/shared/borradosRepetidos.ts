// Cuántas unidades hubo que borrar DOS veces. Puro y testeable.
//
// Borrar algo y que vuelva deja una huella inconfundible: el mismo `slotId` con más de un
// `eliminar_item`. Si el borrado funciona, hay exactamente uno por unidad.
//
// Medido el 24/09 sobre 12 días: de 135 chocolates borrados, 35 volvieron — el 26%. Esa es la
// causa que arreglan las lápidas (`lapidasBorrado.ts`, #573 y #580), y este módulo es con lo que
// se comprueba si el arreglo sirvió, sin depender de que alguien tenga acceso a la base.
//
// Ojo con una trampa que ya costó una medición equivocada: NO sirve mirar si el ítem sigue en
// `shared_session_state`. Ese estado es de TRABAJO y se limpia al registrar el día, así que su
// ausencia no prueba pérdida. La repetición del borrado sí: nadie borra dos veces algo que se
// borró bien.

/** Un `eliminar_item` de `actividad_bodega`, con lo justo para contarlo. */
export interface BorradoBodega {
  fecha: string;
  slotId: number | null;
  /** `CH3`, `P5`, `B1`… en Nacional; RM/Costa escribe el bulto al revés (`3B`). */
  label: string | null;
}

export type TipoUnidad = 'P' | 'B' | 'C' | 'CH';

export interface ConteoTipo { unidades: number; volvieron: number }

export interface DiaBorrados {
  fecha: string;
  /** Unidades DISTINTAS que se borraron ese día. */
  unidades: number;
  /** De esas, cuántas necesitaron más de un borrado (o sea: volvieron). */
  volvieron: number;
  /** `volvieron / unidades`, redondeado a un decimal. */
  pct: number;
  /** Borrados de más: el trabajo que la persona hizo dos veces. */
  borradosDeMas: number;
  porTipo: Record<TipoUnidad, ConteoTipo>;
}

const TIPOS: TipoUnidad[] = ['P', 'B', 'C', 'CH'];

/**
 * A qué tipo de unidad corresponde una etiqueta.
 *
 * Los dos espejos de Bodega la escriben distinto y hay que aceptar las dos formas: Nacional pasa
 * por `ordenToLabel` y sale `B3`; RM/Costa registra el `orden` crudo, donde el bulto lleva el
 * número ADELANTE (`3B`). Es la misma diferencia que documenta `numeroCard.ts`, y leer solo una
 * forma haría que los bultos de un espejo no se contaran.
 *
 * `CH` se evalúa PRIMERO: si no, `CH3` caería en contenedor por empezar con C.
 */
export function tipoDeEtiqueta(label?: string | null): TipoUnidad | null {
  const s = String(label ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s.startsWith('CH')) return 'CH';
  const letra = (s.match(/^([A-Z]+)/) ?? s.match(/([A-Z]+)$/))?.[1];
  return TIPOS.includes(letra as TipoUnidad) ? (letra as TipoUnidad) : null;
}

const cero = (): Record<TipoUnidad, ConteoTipo> =>
  ({ P: { unidades: 0, volvieron: 0 }, B: { unidades: 0, volvieron: 0 },
     C: { unidades: 0, volvieron: 0 }, CH: { unidades: 0, volvieron: 0 } });

/**
 * Agrupa los borrados por día y cuenta cuántas unidades volvieron.
 *
 * La unidad es el `slotId`: es la llave estable, la misma con la que el merge decide y la misma que
 * lleva la lápida. Un borrado SIN `slotId` no se puede emparejar con nada, así que se descarta —
 * contarlo como "no volvió" bajaría el porcentaje, que es la dirección en la que un error acá pasa
 * inadvertido.
 *
 * Los días salen ordenados del más reciente al más viejo, como el resto de la medición.
 */
export function medirBorrados(borrados: readonly BorradoBodega[]): DiaBorrados[] {
  // fecha → slotId → { veces, tipo }
  const porDia = new Map<string, Map<number, { veces: number; tipo: TipoUnidad | null }>>();

  for (const b of borrados) {
    if (b.slotId == null || !b.fecha) continue;
    let dia = porDia.get(b.fecha);
    if (!dia) { dia = new Map(); porDia.set(b.fecha, dia); }
    const previo = dia.get(b.slotId);
    if (previo) {
      previo.veces += 1;
      // La etiqueta puede faltar en una de las repeticiones; se conserva la primera que sirva.
      previo.tipo ??= tipoDeEtiqueta(b.label);
    } else {
      dia.set(b.slotId, { veces: 1, tipo: tipoDeEtiqueta(b.label) });
    }
  }

  const out: DiaBorrados[] = [];
  for (const [fecha, unidades] of porDia) {
    const porTipo = cero();
    let volvieron = 0, borradosDeMas = 0;
    for (const { veces, tipo } of unidades.values()) {
      const repitio = veces > 1;
      if (repitio) { volvieron += 1; borradosDeMas += veces - 1; }
      if (tipo) {
        porTipo[tipo].unidades += 1;
        if (repitio) porTipo[tipo].volvieron += 1;
      }
    }
    const total = unidades.size;
    out.push({
      fecha, unidades: total, volvieron, borradosDeMas,
      pct: total === 0 ? 0 : Math.round((volvieron / total) * 1000) / 10,
      porTipo,
    });
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}
