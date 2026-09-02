// [P5] Serialización CANÓNICA de la línea base del sync de Bodega.
//
// `lastPushedRef` cumple tres papeles a la vez: es la base del merge a 3 vías, el corta-ecos
// ("esto que llega es lo que yo mismo empujé") y el detector de cambios locales. El problema era
// que cada punto la serializaba con una FORMA distinta del mismo objeto:
//   · al inicializar desde localStorage → { dispatch, pdfData }              (2 claves)
//   · al empujar                        → + fechaDespacho, registrado        (4 claves)
//   · al comparar contra el remoto      → + sessionDate, pushedAt            (6 claves)
// Como las cadenas nunca coincidían, el corta-ecos no cortaba nunca: cada equipo RE-EMPUJABA todo
// remoto que adoptaba, y con N personas registrando eso degenera en una tormenta de escrituras
// sobre la misma fila que nunca converge.
//
// La solución es comparar SIEMPRE el mismo contenido semántico: las tiendas y sus PDFs. Los demás
// campos (fechaDespacho/registrado) se siguen vigilando aparte para decidir si hay que empujar,
// pero no forman parte de la base del merge.

/** Forma mínima que comparte todo lo que se sincroniza en Bodega. */
export interface BaseSync {
  dispatch?: unknown;
  pdfData?: unknown;
}

/**
 * Serializa la base del sync de forma estable: solo `dispatch` y `pdfData`, en ese orden y con las
 * tiendas ordenadas por código. El orden importa — dos equipos con las mismas tiendas en distinto
 * orden de inserción producían cadenas distintas y volvían a disparar el eco.
 */
export function serializarBase(o: BaseSync | null | undefined): string {
  return JSON.stringify({
    dispatch: ordenarClaves(o?.dispatch),
    pdfData:  ordenarClaves(o?.pdfData),
  });
}

/**
 * Base del sync de RM/Costa: `step` + `regimen` + `items` (tiendas ordenadas). Mismo problema que
 * en Nacional — el push serializaba 5 claves y la comparación 3, así que `isDirty` daba SIEMPRE
 * true y el corta-ecos no cortaba nunca. Mantiene la clave `items` para `itemsFromSnapshot`.
 */
export function serializarBaseSantiago(
  o: { step?: unknown; regimen?: unknown; items?: unknown } | null | undefined,
): string {
  return JSON.stringify({
    step:    o?.step ?? null,
    regimen: o?.regimen ?? null,
    items:   ordenarClaves(o?.items),
  });
}

/** Reordena las claves de un objeto plano (una tienda por clave) para que la salida sea estable. */
function ordenarClaves(v: unknown): unknown {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v ?? {};
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) out[k] = src[k];
  return out;
}
