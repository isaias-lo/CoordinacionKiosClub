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
 * La contrapartida, a propósito: deshacer un registro es local. No se propaga a los otros equipos.
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
  local: RegistroPorFecha | undefined | null, remoto: RegistroPorFecha | undefined | null,
): boolean {
  return Object.entries(remoto ?? {}).some(([fecha, v]) => v && !(local ?? {})[fecha]);
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
