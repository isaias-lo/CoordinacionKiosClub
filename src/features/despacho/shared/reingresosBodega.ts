// Cuánto trabajo de Bodega se hizo DOS veces, deducido de `picking_eventos`. Puro.
//
// Por qué existe: durante una semana la pregunta "¿se sigue perdiendo trabajo en Bodega?" solo se
// pudo responder escribiendo SQL a mano contra la base. Eso la volvió inservible en la práctica —
// depende de que alguien tenga acceso directo, y el día que el acceso falla la pregunta no se puede
// contestar. Acá la métrica queda definida en un solo lugar, con tests, y la calcula el servidor.
//
// ── Cómo se reconoce un reingreso ───────────────────────────────────────────────────────────────
//
// Cuando la carga de un compañero desaparece y alguien la vuelve a cargar, NO vuelve la misma fila:
// se crea un slot nuevo, con otro `pallet_id`. Por eso no se puede seguir por id — seguir por id es
// justamente lo que hace invisible el problema que se está midiendo.
//
// Lo que queda es el patrón: dentro de la misma tienda y el mismo tipo, un `eliminar` y después un
// `crear`. Se emparejan en orden de llegada (el primero que desapareció es el primero que se vuelve
// a cargar) y cada par cuenta como un reingreso.
//
// Un `restaurar` CANCELA la baja pendiente: esa unidad volvió con su id, nadie la tecleó de nuevo.
//
// ── Lo que esta métrica NO es ───────────────────────────────────────────────────────────────────
//
// Es un indicio, no una prueba. Borrar un pallet mal cargado y agregar el correcto produce el mismo
// par de eventos que la carga que se perdió y hubo que rehacer. Por eso el número solo (“12”) no
// alcanza y esta función devuelve además LA BRECHA DE TIEMPO, que es lo que separa los dos casos:
//
//   · segundos   → la sincronización borró y recreó sola (el churn del bug)
//   · minutos    → la unidad desapareció, una persona lo notó y la volvió a cargar a mano
//   · corrección → también cae acá; por eso se mira la distribución, no el total
//
// Y NO se apoya en comparar personas, aunque sería lo natural: el borrado casi nunca trae actor
// (`picking_eventos.actor_name` viene vacío en la mayoría — ver el comentario de
// `api/picking-pallets/claim-bodega/route.ts`). Una métrica basada en "otra persona" mediría sobre
// todo cuáles borrados guardaron el nombre.

/** Una fila de `picking_eventos`, con lo mínimo que la métrica necesita. */
export interface EventoBodega {
  date: string;
  event_type: string;            // 'crear' | 'eliminar' | 'restaurar'
  store_cod: string | null;
  tipo: string | null;
  pallet_id: number | null;
  created_at: string;
}

export interface Reingreso {
  tienda: string;
  tipo: string;
  /** Minutos entre el borrado y la vuelta a cargar. */
  minutos: number;
}

export interface DiaMedido {
  fecha: string;
  creados: number;
  eliminados: number;
  restaurados: number;
  /** Pares `eliminar` → `crear`: unidades que hubo que volver a cargar. */
  reingresos: number;
  /** `reingresos / creados`, redondeado. El número que se compara entre días. */
  porcentaje: number;
  /** La distribución es lo que hace legible el total. Ver el comentario de arriba. */
  brechas: { hastaUnMinuto: number; hastaDiezMinutos: number; masDeDiezMinutos: number };
  /** Las tiendas con más reingresos, de mayor a menor. Para saber dónde mirar. */
  tiendas: { cod: string; reingresos: number }[];
}

const MINUTO = 60_000;

/** Agrupa por `tienda|tipo`: es el ámbito donde una unidad que se pierde se vuelve a cargar. */
function claveGrupo(e: EventoBodega): string {
  return `${(e.store_cod ?? '').trim().toUpperCase()}|${(e.tipo ?? '').trim().toUpperCase()}`;
}

/**
 * Empareja bajas con altas posteriores dentro de un mismo día y devuelve un reingreso por par.
 *
 * FIFO a propósito: la primera unidad que desapareció es la primera que se vuelve a cargar. Con
 * LIFO las brechas saldrían sistemáticamente más chicas y el caso grave —el que tarda minutos—
 * se escondería detrás del que tarda segundos.
 */
export function reingresosDelDia(eventos: readonly EventoBodega[]): Reingreso[] {
  const porGrupo = new Map<string, EventoBodega[]>();
  for (const e of eventos) {
    const k = claveGrupo(e);
    porGrupo.set(k, [...(porGrupo.get(k) ?? []), e]);
  }

  const salida: Reingreso[] = [];
  for (const [clave, delGrupo] of porGrupo) {
    const [tienda, tipo] = clave.split('|');
    const ordenados = [...delGrupo].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    // Bajas sin explicar todavía. Se guarda el id para que un `restaurar` cancele la suya.
    const pendientes: { palletId: number | null; ts: number }[] = [];

    for (const e of ordenados) {
      const ts = new Date(e.created_at).getTime();
      if (Number.isNaN(ts)) continue;                      // fecha ilegible: no inventar un par

      if (e.event_type === 'eliminar') {
        pendientes.push({ palletId: e.pallet_id, ts });
        continue;
      }
      if (e.event_type === 'restaurar') {
        // Volvió con su propio id: nadie la tecleó de nuevo, así que no es un reingreso.
        const i = pendientes.findIndex(p => p.palletId != null && p.palletId === e.pallet_id);
        if (i >= 0) pendientes.splice(i, 1);
        continue;
      }
      if (e.event_type === 'crear' && pendientes.length > 0) {
        const baja = pendientes.shift()!;
        salida.push({ tienda, tipo, minutos: Math.round((ts - baja.ts) / MINUTO) });
      }
    }
  }
  return salida;
}

/** Resume un día: totales, porcentaje, distribución de brechas y las tiendas más afectadas. */
export function medirDia(fecha: string, eventos: readonly EventoBodega[]): DiaMedido {
  const delDia = eventos.filter(e => e.date === fecha);
  const cuenta = (t: string) => delDia.filter(e => e.event_type === t).length;
  const creados = cuenta('crear');
  const reingresos = reingresosDelDia(delDia);

  const porTienda = new Map<string, number>();
  for (const r of reingresos) porTienda.set(r.tienda, (porTienda.get(r.tienda) ?? 0) + 1);

  return {
    fecha,
    creados,
    eliminados: cuenta('eliminar'),
    restaurados: cuenta('restaurar'),
    reingresos: reingresos.length,
    porcentaje: creados > 0 ? Math.round((reingresos.length / creados) * 100) : 0,
    brechas: {
      hastaUnMinuto:     reingresos.filter(r => r.minutos <= 1).length,
      hastaDiezMinutos:  reingresos.filter(r => r.minutos > 1 && r.minutos <= 10).length,
      masDeDiezMinutos:  reingresos.filter(r => r.minutos > 10).length,
    },
    tiendas: [...porTienda.entries()]
      .map(([cod, n]) => ({ cod, reingresos: n }))
      .sort((a, b) => b.reingresos - a.reingresos || a.cod.localeCompare(b.cod)),
  };
}

/** Mide todos los días presentes en los eventos, del más reciente al más viejo. */
export function medirDias(eventos: readonly EventoBodega[]): DiaMedido[] {
  const fechas = [...new Set(eventos.map(e => e.date))].sort().reverse();
  return fechas.map(f => medirDia(f, eventos));
}
