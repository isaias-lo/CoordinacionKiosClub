// De qué caja es un chocolate: negra o de cartón. Puro y testeable.
//
// Hasta el 22/09/2026 el chocolate era UNA cosa: un tipo `CH` con medidas fijas 42 × 80 × 56 y un
// peso por defecto de 20 kg. Las dos suposiciones se cayeron el mismo día — el peso ahora se toma
// en Bodega (#552), y las medidas resultaron ser solo de una de las dos cajas:
//
//   · CAJA NEGRA    mide siempre 42 × 80 × 56. Solo falta pesarla.
//   · CAJA CARTÓN   el tamaño varía mucho. NO se le piden medidas: solo el peso.
//
// Pedirle medidas a una caja de cartón es pedir un dato que nadie puede dar bien, y lo que se
// escribe para salir del paso termina en el cálculo de volumen del camión.
//
// ── Por qué esto es un SUBTIPO y no dos tipos nuevos ───────────────────────────────────────────
//
// Lo natural parecería usar los códigos `CC` y `CN` que ya existen. No se hace, por dos razones y
// la primera es del coordinador:
//
// 1. La numeración tiene que seguir corrida: CH1, CH2, CH3, mezclando las dos cajas.
//    `computePalletNums` numera AGRUPANDO POR TIPO, así que dos tipos distintos darían CN1, CN2 y
//    CC1 por separado. Con un solo tipo, la numeración que se pidió sale sola.
//
// 2. `CC` y `CN` ya significan CONGELADOS en ocho lugares del sistema — `encargadoManual.ts:40`
//    los manda a esa sección sin preguntar, `tiposUnidad.ts:43` los bloquea en seco, y ni
//    `SANT_TIPO` ni los cuatro mapas de `TiendasPage` los conocen: un tipo que no está en el mapa
//    no falla, cae a `'Pallet'` EN SILENCIO. Reusar esos códigos para otra cosa deja a los dos
//    flujos separados por un solo campo de texto.
//
// Así que el tipo sigue siendo `CH` y la caja viaja aparte, en `picking_pallets.subtipo`.
//
// ── Lo que ya estaba guardado ──────────────────────────────────────────────────────────────────
//
// Los chocolates anteriores al cambio no tienen subtipo. Se leen como NEGRA, porque es lo que
// describen: todos recibieron las medidas 42 × 80 × 56. Así nada viejo cambia de comportamiento.

export const SUBTIPOS_CAJA = ['negra', 'carton'] as const;
export type SubtipoCaja = typeof SUBTIPOS_CAJA[number];

/** Las medidas de la caja negra, en cm. Las únicas fijas que hay. */
export const MEDIDAS_CAJA_NEGRA = { alto: 42, largo: 80, ancho: 56 } as const;

/**
 * Lee el subtipo guardado. Lo que no se reconoce —incluido el `null` de todo lo anterior al
 * cambio— se lee como NEGRA: es lo que describe a los chocolates que ya existen.
 */
export function subtipoDeCaja(v: unknown): SubtipoCaja {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'carton' || s === 'cartón' ? 'carton' : 'negra';
}

/** El nombre que ve la persona. El de cartón lleva tilde: es una palabra, no un código. */
export function etiquetaSubtipo(s: SubtipoCaja): string {
  return s === 'carton' ? 'Caja Cartón' : 'Caja Negra';
}

/**
 * ¿Se le piden medidas a esta caja?
 *
 * Solo a la negra, y en realidad ni siquiera: ya se saben, se muestran y no se escriben. La de
 * cartón no tiene medidas que pedir, así que el formulario no las muestra en vez de mostrarlas
 * vacías esperando una respuesta que nadie tiene.
 */
export function tieneMedidasFijas(s: SubtipoCaja): boolean {
  return s === 'negra';
}

/** Las medidas que le corresponden, o `null` si esta caja no tiene medidas conocidas. */
export function medidasDeCaja(s: SubtipoCaja): { alto: number; largo: number; ancho: number } | null {
  return tieneMedidasFijas(s) ? { ...MEDIDAS_CAJA_NEGRA } : null;
}

// ── La clave con la que la interfaz cuenta unidades ────────────────────────────────────────────
//
// Los contadores de Picking agrupan POR TIPO, y ahora dos botones —negra y cartón— escriben el
// mismo tipo `CH`. Si contaran por tipo a secas mostrarían el mismo número los dos.
//
// La clave resuelve eso sin tocar nada más: para el chocolate es `CH:negra` / `CH:carton`, y para
// todo lo demás es el tipo pelado, igual que siempre. Así el pallet, el bulto y el contenedor no
// se enteran de que esto existe, y la base sigue guardando `tipo` y `subtipo` por separado.

/** La clave de conteo de una unidad. `CH:negra` para el chocolate; el tipo pelado para el resto. */
export function claveUnidad(tipo: string, subtipo?: unknown): string {
  const t = String(tipo ?? '').trim().toUpperCase();
  return t === 'CH' ? `CH:${subtipoDeCaja(subtipo)}` : t;
}

/** El camino inverso: de la clave al par que entiende la base. */
export function partirClave(clave: string): { tipo: string; subtipo: SubtipoCaja | null } {
  const [tipo, sub] = String(clave ?? '').split(':');
  const t = (tipo ?? '').trim().toUpperCase();
  return t === 'CH' ? { tipo: 'CH', subtipo: subtipoDeCaja(sub) } : { tipo: t, subtipo: null };
}

// ── La tara de la caja negra ───────────────────────────────────────────────────────────────────
//
// La caja negra es RETORNABLE: vuelve al CD. Su peso no es mercadería, así que lo que tiene que
// quedar registrado es lo que va adentro, no lo que marca la balanza.
//
// Quien pesa pone la caja entera en la balanza —no hay forma de pesar el contenido solo— así que
// la resta la hace el sistema: se teclea 20,5 y queda 17.
//
// La caja de cartón NO tiene tara. No es un olvido: su tamaño varía, y con él su peso. Restarle
// una constante sería inventar un número distinto para cada caja.
//
// ── Por qué la resta va al TECLEAR y no al guardar ─────────────────────────────────────────────
//
// Una tarjeta ya guardada se puede editar con el ✎. Si la resta viviera en el guardado, corregir
// cualquier cosa volvería a restar: 17 → 13,5 → 10. La resta tiene que ocurrir exactamente una
// vez, en el único momento en que existe un peso bruto: cuando la persona lo escribe.

/** Lo que pesa la caja negra vacía, en kg. Es retornable: no cuenta como mercadería. */
export const TARA_CAJA_NEGRA = 3.5;

export type PesoNeto =
  | { ok: true; neto: number; bruto: number; tara: number }
  | { ok: false; error: string };

/**
 * El peso que queda registrado a partir del que marcó la balanza.
 *
 * Se RECHAZA lo que no llega a la tara, no se recorta a cero: si la balanza marca menos que la
 * caja vacía, o alguien se equivocó de casilla o la caja no es la que dice. Guardar un 0 —o peor,
 * un negativo— convierte un error visible en un dato falso que nadie va a volver a mirar. Mismo
 * criterio que `pesoChocolateValido`.
 *
 * El redondeo a una décima evita que 20,6 − 3,5 quede en 17.099999999999998.
 */
export function pesoNetoCajaNegra(bruto: unknown, tara = TARA_CAJA_NEGRA): PesoNeto {
  const n = typeof bruto === 'number' ? bruto : parseFloat(String(bruto ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'Escribe el peso que marcó la balanza (ej. 20,5).' };
  }
  if (n <= tara) {
    return {
      ok: false,
      error: `La caja negra vacía ya pesa ${String(tara).replace('.', ',')} kg. `
           + `¿Son ${String(n).replace('.', ',')} kg lo que marcó la balanza?`,
    };
  }
  return { ok: true, neto: Math.round((n - tara) * 10) / 10, bruto: n, tara };
}

// ── El par que mantiene la resta idempotente ───────────────────────────────────────────────────
//
// El formulario guarda el peso BRUTO (lo que marcó la balanza) y el ítem guarda el NETO. Entre los
// dos hay que convertir en las dos direcciones, y la trampa está en la vuelta:
//
//   guardar        el formulario tiene el bruto → se resta la tara → el ítem queda neto
//   reconstruir    el ítem tiene el neto → se SUMA la tara → el formulario vuelve a mostrar bruto
//
// Sin la suma de vuelta, reabrir la tienda y volver a guardar restaría otra vez: 17 → 13,5 → 10.
// Editar con el ✎ no tiene ese problema —la fila conserva lo tecleado— pero reconstruir sí, y es
// lo que pasa cada vez que alguien entra a la tienda.

/** Lo que se guarda en el ítem, a partir de lo que hay en el formulario. */
export function pesoParaGuardar(bruto: number, subtipo: SubtipoCaja, tara = TARA_CAJA_NEGRA): number {
  if (subtipo !== 'negra') return bruto;
  return Math.round((bruto - tara) * 10) / 10;
}

/** Lo que se muestra en el formulario, a partir de lo guardado. El inverso exacto del anterior. */
export function pesoParaMostrar(neto: number, subtipo: SubtipoCaja, tara = TARA_CAJA_NEGRA): number {
  if (subtipo !== 'negra') return neto;
  return Math.round((neto + tara) * 10) / 10;
}
