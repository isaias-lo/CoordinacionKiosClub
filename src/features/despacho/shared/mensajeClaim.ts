// Qué decirle a quien intenta agregar un pallet preexistente y no aparece.
//
// El mensaje viejo era uno solo — "No encontramos el pallet #123. Verifica el número." — y en el
// caso más común es MENTIRA: el número está bien, lo que pasa es que alguien lo borró. El borrado
// es físico (verificado: de 876 borrados en 14 días, 0 filas sobreviven en `picking_pallets`), así
// que el único rastro queda en `picking_eventos`. Buscar ahí convierte un "revisa el número" —que
// manda a la persona a mirar una etiqueta que está perfecta— en una instrucción accionable.
//
// Dos cosas que salieron de mirar los datos y que condicionan el diseño:
//
//  1. `actor_name` está en el 6-20% de los borrados según el mes (468 de 4.984 en total). Decir
//     "lo eliminó Juan" es la EXCEPCIÓN: el mensaje tiene que leerse bien sin nombre, no colgarse
//     de él ni escribir "eliminado por undefined".
//  2. La hora se formatea en America/Santiago con `Intl`, no con `getHours()`. En el navegador dan
//     lo mismo, pero así la función es determinista en los tests corran donde corran.
//
// Puro y testeable: no toca red ni base.

export type MotivoClaim =
  | 'eliminado'      // existió y alguien lo borró — el caso que antes mentía
  | 'otra_tienda'    // existe, pero es de otra tienda
  | 'ya_en_carga'    // ya está en la carga de HOY de esta misma tienda
  | 'no_encontrado'  // no existe y tampoco hay rastro de borrado: el número está mal
  | 'desconocido';   // cualquier otra cosa

export interface ContextoClaim {
  /** El número tal como lo digitó o escaneó la persona. */
  ref: string;
  /** Dueño real del pallet (motivo `otra_tienda`). */
  storeCod?: string | null;
  /** ISO del borrado (motivo `eliminado`). */
  eliminadoEn?: string | null;
  /** Quién lo borró. Falta en la mayoría de los casos — ver nota 1 arriba. */
  eliminadoPor?: string | null;
  /**
   * Texto EXACTO del botón con el que recrearlo (ej. `'+ Choc.'`), tal como sale de
   * `botonDeTipoCode`. Literal y no traducido: el punto es que lo encuentre en pantalla.
   */
  boton?: string | null;
  /** Inyectable para tests. */
  ahora?: Date;
}

/** Fecha y hora de un instante en Chile, sin depender de la zona de la máquina. */
function enChile(d: Date): { fecha: string; hora: string } {
  const opts = { timeZone: 'America/Santiago' } as const;
  return {
    // 'en-CA' da YYYY-MM-DD, que es lo cómodo para comparar días.
    fecha: new Intl.DateTimeFormat('en-CA', opts).format(d),
    hora: new Intl.DateTimeFormat('es-CL', {
      ...opts, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d),
  };
}

/** "hoy a las 10:42" · "ayer a las 17:05" · "el 03/09 a las 08:15". */
function cuando(iso: string, ahora: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ev = enChile(d);
  const hoy = enChile(ahora).fecha;
  const ayer = enChile(new Date(ahora.getTime() - 24 * 60 * 60 * 1000)).fecha;

  if (ev.fecha === hoy) return `hoy a las ${ev.hora}`;
  if (ev.fecha === ayer) return `ayer a las ${ev.hora}`;
  const [, mes, dia] = ev.fecha.split('-');
  return `el ${dia}/${mes} a las ${ev.hora}`;
}

/** "Vuelve a crearlo con “+ Choc.”" — o sin el botón si no sabemos el tipo. */
function comoRecrear(boton?: string | null): string {
  const b = (boton ?? '').trim();
  return b
    ? `Vuelve a crearlo con “${b}” y reimprime la etiqueta.`
    : 'Vuelve a crearlo y reimprime la etiqueta.';
}

/**
 * El texto que ve la persona. Siempre dice qué pasó Y qué hacer: un mensaje que solo diagnostica
 * deja a alguien parado frente a una pantalla con un pallet en la mano.
 */
export function mensajeClaim(motivo: MotivoClaim, ctx: ContextoClaim): string {
  const ref = String(ctx.ref ?? '').trim().replace(/^#/, '');
  const num = ref ? `#${ref}` : 'ese pallet';
  const ahora = ctx.ahora ?? new Date();

  switch (motivo) {
    case 'eliminado': {
      const quien = (ctx.eliminadoPor ?? '').trim();
      const momento = ctx.eliminadoEn ? cuando(ctx.eliminadoEn, ahora) : '';
      // Sin nombre —que es lo normal— la frase va en pasiva y no se nota el hueco.
      const cabeza = quien
        ? `El pallet ${num} lo eliminó ${quien}${momento ? ` ${momento}` : ''}.`
        : `El pallet ${num} fue eliminado${momento ? ` ${momento}` : ''}.`;
      return `${cabeza} ${comoRecrear(ctx.boton)}`;
    }

    case 'otra_tienda': {
      const duena = (ctx.storeCod ?? '').trim();
      return duena
        ? `El pallet ${num} es de la tienda ${duena}, no de esta. Revisa la etiqueta o agrégalo en esa tienda.`
        : `El pallet ${num} es de otra tienda. Revisa la etiqueta o agrégalo en la tienda que corresponde.`;
    }

    case 'ya_en_carga':
      return `El pallet ${num} ya está en la carga de hoy de esta tienda. Búscalo en la lista — no hace falta agregarlo de nuevo.`;

    case 'no_encontrado':
      return `No existe ningún pallet ${num}. Revisa el número de la etiqueta.`;

    default:
      return `No se pudo agregar el pallet ${num}. Intenta de nuevo.`;
  }
}
