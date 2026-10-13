// Qué días quedaron REGISTRADOS en Bodega. Puro y testeable: no toca red ni base.
//
// Existe por un caso real del 28/09/2026. El coordinador registró Nacional y RM/Costa desde su
// escritorio; en la Mac los dos seguían en rojo. Mirando `shared_session_state`: RM/Costa tenía
// `registrado: true` y Nacional `registrado: false`. No se había perdido el push — se había
// BORRADO el flag.
//
// La causa: `registrado` era UN SOLO BOOLEANO para toda la sesión, y el reducer hacía
//
//     case 'SET_FECHA_DESPACHO':
//       return { ...state, fechaDespacho: action.payload, registrado: false };
//
// O sea que mover la fecha de despacho —un campo que se toca todos los días para dejar lista la
// carga del día siguiente— borraba el registro del día que SÍ se había registrado, y ese `false`
// se empujaba a todos los equipos. El registro no se perdía por un error de sincronización: se
// perdía porque el estado no sabía A QUÉ DÍA pertenecía.
//
// Acá el registro pasa a ser POR FECHA. Cambiar la fecha ya no borra nada: cada día recuerda lo
// suyo, y volver a la fecha anterior la muestra registrada de nuevo.

/** `{ '2026-09-28': true }` — solo se guardan los días registrados. */
export type RegistroPorFecha = Record<string, boolean>;

/** ¿Ese día quedó registrado? Sin dato, no. */
export function estaRegistrado(mapa: RegistroPorFecha | undefined | null, fecha: string): boolean {
  return !!(mapa && fecha && mapa[fecha]);
}

/**
 * Marca o desmarca UN día, sin tocar los demás.
 *
 * Al desmarcar se borra la llave en vez de dejarla en `false`: el mapa solo enumera días
 * registrados, así que no crece con un `false` por cada fecha que alguien miró.
 */
export function marcarRegistro(
  mapa: RegistroPorFecha | undefined | null, fecha: string, valor: boolean,
): RegistroPorFecha {
  const base = { ...(mapa ?? {}) };
  if (!fecha) return base;
  if (valor) base[fecha] = true;
  else delete base[fecha];
  return base;
}

/**
 * Une lo local con lo que llega de otro equipo. **Un `true` nunca se pierde.**
 *
 * Es la misma regla que ya regía con el booleano —el merge adoptaba el remoto solo si estaba en
 * `true`, nunca al revés— y por el mismo motivo: dos personas trabajan el mismo día desde equipos
 * distintos, y el que todavía no registró no puede desregistrar al que sí.
 *
 * Esta función sola NO sabe de reaperturas: por eso el resultado pasa después por
 * `aplicarDecisiones`. Ver el bloque de abajo.
 */
export function fusionarRegistros(
  local: RegistroPorFecha | undefined | null, remoto: RegistroPorFecha | undefined | null,
): RegistroPorFecha {
  const out = { ...(local ?? {}) };
  for (const [fecha, v] of Object.entries(remoto ?? {})) if (v) out[fecha] = true;
  return out;
}

/**
 * ¿El remoto trae algún día registrado que lo local no tiene?
 *
 * El corta-ecos compara solo los ítems: un push de otro equipo que SOLO registró el día traía los
 * mismos ítems y se descartaba entero. Este equipo se quedaba sin el registro y, en su siguiente
 * push, escribía `registros: {}` sobre la fila (gana el último que escribe): al día siguiente salía
 * «DESPACHO SIN REGISTRAR» y se ofrecía registrar de nuevo.
 */
export function traeRegistrosNuevos(
  local: RegistroPorFecha | undefined | null,
  remoto: RegistroPorFecha | undefined | null,
  /** Si acá se reabrió ese día, el `true` de la fila vieja no es una novedad: es lo que se deshizo. */
  decisiones?: DecisionPorFecha | null,
): boolean {
  return Object.entries(remoto ?? {}).some(([fecha, v]) => {
    if (!v || (local ?? {})[fecha]) return false;
    const d = leerDecision(decisiones?.[fecha]);
    return !(d && !d.registrado);
  });
}

/**
 * Compatibilidad con el estado viejo, que guardaba un solo `registrado: boolean`.
 *
 * Hay estados así guardados en `localStorage` y en `shared_session_state` ahora mismo. Al leerlos,
 * ese booleano solo tiene sentido junto a la fecha que lo acompañaba; sin ella no se puede saber a
 * qué día se refería y se descarta, que es el lado seguro: mostrar "sin registrar" un día que sí
 * se registró hace revisar de más, mientras que lo contrario hace despachar sin registrar.
 */
export function migrarRegistroViejo(
  mapa: RegistroPorFecha | undefined | null,
  registradoViejo: boolean | undefined,
  fecha: string | undefined,
): RegistroPorFecha {
  const base = { ...(mapa ?? {}) };
  if (registradoViejo === true && fecha) base[fecha] = true;
  return base;
}


// ── REABRIR UN DÍA YA REGISTRADO ──────────────────────────────────────────────────────────────
//
// El 12/10/2026 el coordinador necesitaba modificar y volver a registrar RM/Costa. Apretaba
// Reabrir, el botón pasaba a REGISTRAR y **volvía solo a Completado en un segundo**.
//
// No era la pantalla: era este archivo. Reabrir borra la fecha del mapa local, pero la fila de
// `shared_session_state` seguía con `registros: {"2026-10-13": true}` —medido—, y la regla de
// arriba dice que un `true` remoto nunca se pierde. Al primer evento de sincronización —su propio
// eco, el otro espejo, o el catch-up al volver a la pestaña— el `true` se volvía a adoptar.
//
// La regla «un true nunca se pierde» es correcta y se queda: nació de un caso real en que mover la
// fecha de despacho desregistraba el día para todos. Lo que le faltaba es la distinción que el
// repositorio ya usa para los ítems borrados (`lapidasBorrado.ts`):
//
//     NO TENER un registro ≠ HABERLO DESHECHO A PROPÓSITO.
//
// Un equipo que todavía no registró no trae el `true` porque no lo tiene: ese no puede
// desregistrar a nadie. Reabrir es una decisión explícita, con hora, y esa sí manda.
//
// Por qué con hora y no una simple lápida: después de reabrir hay que poder REGISTRAR de nuevo, y
// ese registro tiene que ganarle a la reapertura. Con la hora de cada decisión, gana la última, en
// cualquiera de los dos sentidos y venga del equipo que venga.

/** La última decisión EXPLÍCITA sobre un día —registrarlo o reabrirlo— con la hora en que se tomó. */
export type DecisionPorFecha = Record<string, { registrado: boolean; ts: number }>;

/** Valida una decisión que llega de la red o del `localStorage`. Lo que no calza se ignora. */
function leerDecision(d: unknown): { registrado: boolean; ts: number } | null {
  if (!d || typeof d !== 'object') return null;
  const { registrado, ts } = d as { registrado?: unknown; ts?: unknown };
  if (typeof registrado !== 'boolean' || typeof ts !== 'number' || !Number.isFinite(ts)) return null;
  return { registrado, ts };
}

/** Deja asentado que alguien registró o reabrió ese día, a esa hora. */
export function decidir(
  mapa: DecisionPorFecha | undefined | null, fecha: string, registrado: boolean, ahora: number,
): DecisionPorFecha {
  const base = { ...(mapa ?? {}) };
  if (!fecha || !Number.isFinite(ahora)) return base;
  base[fecha] = { registrado, ts: ahora };
  return base;
}

/** Une las decisiones de dos equipos: por fecha, **gana la más nueva**. */
export function fusionarDecisiones(
  local: DecisionPorFecha | undefined | null, remoto: DecisionPorFecha | undefined | null,
): DecisionPorFecha {
  const out: DecisionPorFecha = {};
  for (const [fecha, d] of Object.entries(local ?? {})) {
    const v = leerDecision(d);
    if (v) out[fecha] = v;
  }
  for (const [fecha, d] of Object.entries(remoto ?? {})) {
    const v = leerDecision(d);
    if (!v) continue;
    const mio = out[fecha];
    // Empate: se queda el local. No hay forma de desempatar y cambiar de opinión sola es peor.
    if (!mio || v.ts > mio.ts) out[fecha] = v;
  }
  return out;
}

/**
 * Aplica las decisiones sobre el mapa de registros ya fusionado. **Va al final de todo**, después
 * de `fusionarRegistros` y de `migrarRegistroViejo`: si fuera antes, el booleano viejo del estado
 * remoto volvería a marcar el día que se acaba de reabrir.
 */
export function aplicarDecisiones(
  registros: RegistroPorFecha | undefined | null, decisiones: DecisionPorFecha | undefined | null,
): RegistroPorFecha {
  const out = { ...(registros ?? {}) };
  for (const [fecha, d] of Object.entries(decisiones ?? {})) {
    const v = leerDecision(d);
    if (!v) continue;
    if (v.registrado) out[fecha] = true;
    else delete out[fecha];
  }
  return out;
}
