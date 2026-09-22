// Cuánto trabajo de Bodega se hizo DOS veces. Puro.
//
// ── La corrección que dio origen a este archivo (22/09/2026) ────────────────────────────────────
//
// La primera versión buscaba el trabajo duplicado en `picking_eventos`: un `eliminar` seguido de un
// `crear`. Es una definición razonable y está completamente equivocada, porque describe un caso que
// en la operación casi no ocurre. Medido sobre seis jornadas: de 45 a 89 borrados por día, entre
// CERO y OCHO tuvieron un alta después. El 17/09 no hubo ninguno.
//
// Lo que pasa de verdad no borra ni crea nada. Dos personas abren la misma tienda, las dos pesan la
// MISMA unidad, y la segunda guarda encima de la primera. `fusionarConPrevio` hace lo correcto —no
// duplica el ítem, lo fusiona— así que el conteo final queda bien y `picking_eventos` no registra
// absolutamente nada. El trabajo se hizo dos veces y el rastro es invisible ahí.
//
// Donde sí queda es en `actividad_bodega`: cada guardado escribe un `registrar_item` con el slot en
// `detalle->>'slotId'`. Dos filas con el mismo slot el mismo día = la unidad se cargó dos veces.
//
// Ejemplo real del 17/09: el slot 13938 (59EGN, P1, 193,5 kg) lo registró una persona a las
// 10:33:32 y otra a las 10:33:49. Mismo slot, mismo peso, 17 segundos, dos personas.
//
// ── Rehacer no es lo mismo que corregir ────────────────────────────────────────────────────────
//
// Un segundo registro puede ser dos cosas muy distintas, y la que importa es la primera:
//
//   · MISMO peso   → la unidad se volvió a pesar y dio lo mismo. El trabajo se hizo dos veces.
//   · PESO DISTINTO → alguien corrigió un dato. Es trabajo útil, no desperdicio.
//
// Por eso `rehecho` compara el peso, y no solo cuenta registros repetidos. Sin esa distinción el
// número mezcla el problema con su solución.
//
// ── Y por qué se mira quién ────────────────────────────────────────────────────────────────────
//
// Que la MISMA persona vuelva a guardar la misma unidad es otra cosa: casi siempre está editando lo
// que ella misma cargó. Se cuenta aparte (`repetidoMismaPersona`) porque no es trabajo duplicado
// entre dos personas, que es el problema que se está midiendo.
//
// Acá el actor sí sirve: `actividad_bodega.actor_name` viene lleno. (En `picking_eventos` no —
// ahí el borrado casi nunca trae actor, y por eso aquella métrica tampoco podía apoyarse en él.)

/** Una fila de `actividad_bodega` con `accion='registrar_item'`, ya aplanada. */
export interface RegistroBodega {
  fecha: string;
  tienda: string | null;
  actor: string | null;
  createdAt: string;
  /** `detalle->>'slotId'`: la unidad de Picking. Sin esto la fila no se puede emparejar. */
  slotId: number | null;
  /** `detalle->>'peso'`: distingue rehacer de corregir. */
  peso: number | null;
}

export interface DiaMedido {
  fecha: string;
  /** Unidades distintas que se cargaron ese día. Es el denominador. */
  unidades: number;
  /** Total de guardados, incluidos los repetidos. */
  registros: number;
  /** **El número que importa**: otra persona volvió a pesar la unidad y le dio lo mismo. */
  rehecho: number;
  /** Otra persona la volvió a guardar con OTRO peso: es una corrección, no desperdicio. */
  corregido: number;
  /** La misma persona volvió a guardar: casi siempre está editando lo suyo. */
  repetidoMismaPersona: number;
  /** `rehecho / unidades`, redondeado. Lo que se compara entre días. */
  porcentaje: number;
  /** Separa el ruido de sincronía (segundos) de alguien que lo notó y lo rehizo (minutos). */
  brechas: { hastaUnMinuto: number; hastaDiezMinutos: number; masDeDiezMinutos: number };
  /** Dónde se concentró, de mayor a menor. */
  tiendas: { cod: string; rehecho: number }[];
}

const MINUTO = 60_000;

/** Lo que pasó con un guardado que no es el primero de su unidad. */
type Clase = 'rehecho' | 'corregido' | 'repetidoMismaPersona';

interface Repetido { clase: Clase; tienda: string; minutos: number }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Clasifica los guardados que siguen al primero de cada unidad.
 *
 * Se agrupa por `(fecha, slotId)` y se ordena por hora: el primero es la carga, y cada uno que
 * venga después se compara CONTRA EL PRIMERO —no contra el anterior— porque lo que se quiere saber
 * es si se rehízo el trabajo original, no si hubo una cadena de ediciones.
 *
 * Una fila sin `slotId` se descarta: no hay con qué emparejarla, y adivinar inventaría duplicados.
 */
export function repetidosDelDia(registros: readonly RegistroBodega[]): Repetido[] {
  const porUnidad = new Map<number, RegistroBodega[]>();
  for (const r of registros) {
    if (r.slotId == null) continue;
    porUnidad.set(r.slotId, [...(porUnidad.get(r.slotId) ?? []), r]);
  }

  const salida: Repetido[] = [];
  for (const delSlot of porUnidad.values()) {
    const ordenados = [...delSlot].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const primero = ordenados[0];
    const tPrimero = new Date(primero.createdAt).getTime();
    if (Number.isNaN(tPrimero)) continue;           // hora ilegible: no inventar un repetido

    for (const r of ordenados.slice(1)) {
      const t = new Date(r.createdAt).getTime();
      if (Number.isNaN(t)) continue;
      const clase: Clase = norm(r.actor) === norm(primero.actor)
        ? 'repetidoMismaPersona'
        : (r.peso === primero.peso ? 'rehecho' : 'corregido');
      salida.push({
        clase,
        tienda: (r.tienda ?? primero.tienda ?? '').trim().toUpperCase(),
        minutos: Math.round((t - tPrimero) / MINUTO),
      });
    }
  }
  return salida;
}

/** Resume un día. */
export function medirDia(fecha: string, registros: readonly RegistroBodega[]): DiaMedido {
  const delDia = registros.filter(r => r.fecha === fecha);
  const unidades = new Set(delDia.filter(r => r.slotId != null).map(r => r.slotId)).size;
  const repetidos = repetidosDelDia(delDia);
  const rehechos = repetidos.filter(r => r.clase === 'rehecho');

  const porTienda = new Map<string, number>();
  for (const r of rehechos) porTienda.set(r.tienda, (porTienda.get(r.tienda) ?? 0) + 1);

  return {
    fecha,
    unidades,
    registros: delDia.length,
    rehecho: rehechos.length,
    corregido: repetidos.filter(r => r.clase === 'corregido').length,
    repetidoMismaPersona: repetidos.filter(r => r.clase === 'repetidoMismaPersona').length,
    porcentaje: unidades > 0 ? Math.round((rehechos.length / unidades) * 100) : 0,
    brechas: {
      hastaUnMinuto:    rehechos.filter(r => r.minutos <= 1).length,
      hastaDiezMinutos: rehechos.filter(r => r.minutos > 1 && r.minutos <= 10).length,
      masDeDiezMinutos: rehechos.filter(r => r.minutos > 10).length,
    },
    tiendas: [...porTienda.entries()]
      .map(([cod, n]) => ({ cod, rehecho: n }))
      .sort((a, b) => b.rehecho - a.rehecho || a.cod.localeCompare(b.cod)),
  };
}

/** Mide todos los días presentes, del más reciente al más viejo. */
export function medirDias(registros: readonly RegistroBodega[]): DiaMedido[] {
  return [...new Set(registros.map(r => r.fecha))].sort().reverse()
    .map(f => medirDia(f, registros));
}
