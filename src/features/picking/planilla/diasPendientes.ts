// Qué días quedaron sin registrar en la hoja de olas. Puro y testeable.
//
// ── POR QUÉ ───────────────────────────────────────────────────────────────────────────────────
//
// Registrar es un clic al cerrar el turno, y un clic se olvida. Pasó dos veces en dos semanas:
//
//     mié 11/11/2026   el bloque se creó pero quedó con 17 de 68 filas con nombre: se apretó
//                      Registrar a media mañana y no se volvió a apretar al cerrar
//     vie 13/11/2026   no se registró nada: 135 movimientos y 31 tiendas sin una sola fila
//
// Nadie se entera hasta que alguien va a buscar ese día, y para entonces ya pasaron días. De la
// hoja de olas sale el bono, así que un día sin registrar es trabajo que no se paga.
//
// La idea es del coordinador (16/11/2026) y es mejor que un selector de fecha suelto: el sistema
// avisa qué día falta y lleva ahí, en vez de dejar una fecha libre que alguien pueda mover por
// error creyendo que mira el día de hoy.
//
// ── CÓMO SE DECIDE QUE UN DÍA ESTÁ PENDIENTE ──────────────────────────────────────────────────
//
// Cruzando dos cosas que el sistema ya sabe mirar: si Odoo tuvo movimientos ese día, y qué tiene
// la hoja. De ahí salen tres casos, y el tercero importa tanto como los otros dos:
//
//     con movimientos y SIN bloque .............. pendiente · «sin-bloque»
//     con bloque pero con pocas filas llenas .... pendiente · «incompleto»
//     SIN movimientos ........................... NO se avisa
//
// El tercero es el que mantiene vivo al aviso. Los sábados y domingos no se trabaja —el sábado
// 14/11 tuvo cero movimientos— y un aviso que aparece todos los lunes por un día que nunca tuvo
// trabajo se deja de leer en una semana, y con él los que sí importan.
//
// ── EL UMBRAL DEL 80%, MEDIDO ─────────────────────────────────────────────────────────────────
//
// Un bloque nunca se llena al 100%: las filas de congelados y la de Falabella Full van vacías a
// propósito, y una tienda sin carga deja sus tres filas en blanco. Medido en la hoja sobre los
// días que SÍ se registraron bien:
//
//     mar 10/11   88 de  88   100%
//     vie 06/11   87 de  88    99%
//     lun 09/11   93 de  95    98%
//     mié 04/11   66 de  68    97%
//     jue 12/11   88 de  91    97%
//     ───────────────────────────────
//     mié 11/11   17 de  68    25%   ← el que hay que detectar
//
// Entre el peor día sano (97%) y el día roto (25%) hay una distancia enorme. El umbral en 80%
// cae en el medio con margen para los dos lados: deja pasar un día con varias tiendas sin carga
// —cinco tiendas sin carga sobre 95 filas dan 84%— y atrapa cualquier registro a medias.

/** Un día tal como aparece en la hoja, ya agrupado. */
export interface DiaEnHoja {
  /** ISO `YYYY-MM-DD`. */
  fecha: string;
  filas: number;
  conNombre: number;
  desde: number;
  hasta: number;
}

/** Lo que Odoo tuvo ese día. */
export interface DiaConTrabajo {
  fecha: string;
  movimientos: number;
  tiendas: number;
}

export type MotivoPendiente = 'sin-bloque' | 'incompleto';

export interface DiaPendiente {
  fecha: string;
  motivo: MotivoPendiente;
  movimientos: number;
  tiendas: number;
  /** Solo en `incompleto`: cuántas filas tiene el bloque y cuántas llevan nombre. */
  filas?: number;
  conNombre?: number;
  desde?: number;
  hasta?: number;
}

/** Por debajo de esto, el bloque está a medio llenar. Ver la cabecera para la medición. */
export const UMBRAL_LLENO = 0.8;

/**
 * Los días que quedaron pendientes, del más reciente al más viejo.
 *
 * `hoy` se EXCLUYE siempre: que el día de hoy no esté registrado es lo normal hasta que se cierra
 * el turno, y avisarlo sería gritar todos los días.
 */
export function diasPendientes(
  conTrabajo: readonly DiaConTrabajo[],
  enHoja: readonly DiaEnHoja[],
  hoy: string,
  umbral: number = UMBRAL_LLENO,
): DiaPendiente[] {
  const porFecha = new Map(enHoja.map(d => [d.fecha, d]));
  const out: DiaPendiente[] = [];

  for (const t of conTrabajo) {
    if (!t.fecha || t.fecha >= hoy) continue;        // hoy y cualquier cosa futura quedan fuera
    if (t.movimientos <= 0) continue;                // un día sin trabajo no es un día pendiente

    const h = porFecha.get(t.fecha);
    if (!h) {
      out.push({ fecha: t.fecha, motivo: 'sin-bloque', movimientos: t.movimientos, tiendas: t.tiendas });
      continue;
    }
    // Un bloque de cero filas no existe en la práctica, pero dividir por cero sí rompe.
    const lleno = h.filas > 0 ? h.conNombre / h.filas : 0;
    if (lleno < umbral) {
      out.push({
        fecha: t.fecha, motivo: 'incompleto',
        movimientos: t.movimientos, tiendas: t.tiendas,
        filas: h.filas, conNombre: h.conNombre, desde: h.desde, hasta: h.hasta,
      });
    }
  }

  return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** «135 movimientos · 31 tiendas» / «17 de 68 filas con nombre». */
export function detallePendiente(d: DiaPendiente): string {
  if (d.motivo === 'incompleto')
    return `${d.conNombre} de ${d.filas} filas con nombre`;
  const t = d.tiendas === 1 ? '1 tienda' : `${d.tiendas} tiendas`;
  return `${d.movimientos} movimiento${d.movimientos === 1 ? '' : 's'} · ${t}`;
}

/** Un movimiento de Odoo, con lo mínimo para agruparlo por día. */
export interface MovimientoCrudo {
  /** El día local YA resuelto: `YYYY-MM-DD`. Ver la advertencia de abajo. */
  dia: string;
  /** El `origin` de Odoo, de donde sale el código de tienda. */
  origin?: string | null;
}

/**
 * Agrupa movimientos por día y cuenta tiendas distintas.
 *
 * ── LA ADVERTENCIA QUE JUSTIFICA QUE ESTO SEA UNA FUNCIÓN ────────────────────────────────────
 *
 * `dia` tiene que ser `YYYY-MM-DD` y nada más. La primera versión de esto vivía suelta dentro de
 * la ruta y armaba la clave con `odooDateToISO`, que **no devuelve un día**: devuelve la marca de
 * tiempo entera, `2026-11-04T13:19:46Z`. Con eso cada movimiento fue su propio «día» y el aviso
 * salió con una fila por movimiento — decenas de filas diciendo «1 movimiento · 0 tiendas».
 *
 * La que da el día local en Chile es `fechaChileDe`. Y la diferencia no es cosmética: un
 * movimiento validado a las 22:00 de Chile es del día de Chile, no del siguiente en UTC.
 *
 * Por eso esta función descarta cualquier clave que no tenga la forma de un día: si vuelve a
 * entrar una marca de tiempo, el resultado queda vacío y se nota, en vez de producir una lista
 * larga y creíble.
 */
export function agruparPorDia(movs: readonly MovimientoCrudo[]): DiaConTrabajo[] {
  const SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;
  const COD_TIENDA = /\b(\d{2}[A-ZÑ]{2,4}\d?)\b/;
  const porDia = new Map<string, { movimientos: number; tiendas: Set<string> }>();

  for (const m of movs) {
    const dia = String(m.dia ?? '').trim();
    if (!SOLO_DIA.test(dia)) continue;
    let a = porDia.get(dia);
    if (!a) { a = { movimientos: 0, tiendas: new Set() }; porDia.set(dia, a); }
    a.movimientos++;
    const cod = COD_TIENDA.exec(String(m.origin ?? '').toUpperCase())?.[1];
    if (cod) a.tiendas.add(cod);
  }

  return [...porDia]
    .map(([fecha, a]) => ({ fecha, movimientos: a.movimientos, tiendas: a.tiendas.size }))
    .sort((x, y) => y.fecha.localeCompare(x.fecha));
}
