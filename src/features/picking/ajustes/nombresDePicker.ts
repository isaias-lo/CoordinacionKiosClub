// Las dos cosas que se pueden hacer con una pistola en Configuración, que NO son la misma:
// borrarle el nombre y quitarla de la lista. Módulo puro.
//
// ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────────────────────
//
// La pantalla ofrece las dos y pide confirmación para cada una, con dos textos distintos:
//
//     editar el campo  →  «Cambiar nombre: "Control Interno" → "(sin nombre)". Lo verán todos.»
//     el botón ✕       →  «¿Eliminar el picker o pistola "Control Interno"? Desaparece para todos.»
//
// pero las dos terminaban en la MISMA línea —`delete next[key]`— y el servidor borraba la fila
// en cuanto el nombre llegaba vacío. O sea: el cuadro decía «(sin nombre)» y eliminaba la
// pistola. Pasó el 09/11/2026 a las 14:12 y 14:13 con «control interno» y «Sofia Sanchez»: las
// dos desaparecieron de Configuración y de Estadísticas, con sus operaciones.
//
// La pistola y la persona son dos cosas: la cuenta de Odoo existe aunque hoy no la use nadie, y
// el trabajo que hizo sigue estando en Odoo. Dejar la cuenta sin nombre es un estado normal
// —una pistola libre— y tiene que poder representarse.
//
// ── Y POR QUÉ SE LIMPIA TAMBIÉN `nombre_olas` ─────────────────────────────────────────────────
//
// `nombre_olas` es el nombre **tal como lo escribe la planilla del bono**, y es por persona, no
// por pistola. Si la persona se va y la pistola se reasigna, un `nombre_olas` viejo sobreviviendo
// al cambio escribiría el nombre del que se fue sobre el trabajo del que llegó — y el bono no
// avisa: el XLOOKUP encuentra el nombre, el SUMIFS no, y el bono queda en cero en silencio.
//
// Sin `nombre_olas` el registro de olas se SALTA esa fila y lo dice, que es lo correcto: un
// nombre que nadie confirmó no se adivina. Ver `planilla/registroOlas.ts`.

/** Qué se le pide al servidor. El servidor NO lo deduce del nombre vacío: se le dice. */
export type AccionNombre = 'nombre' | 'quitar';

export interface CambioDeNombre {
  /** El mapa que queda en el cliente. Una pistola sin nombre sigue presente, con `''`. */
  names: Record<string, string>;
  /** Lo que se manda a `/api/picker-canonical-names`. */
  envio: { key: string; display_name: string; accion: AccionNombre };
}

/**
 * Ponerle —o quitarle— el nombre a una pistola. La pistola SIEMPRE queda.
 *
 * Un nombre en blanco no es una orden de borrar: es «esta pistola no la usa nadie». Es la
 * distinción que no existía y por la que borrar un nombre borraba la cuenta entera.
 */
export function guardarNombre(
  actuales: Readonly<Record<string, string>>,
  key: string,
  valor: string,
): CambioDeNombre {
  const nombre = valor.trim();
  return {
    names: { ...actuales, [key]: nombre },
    envio: { key, display_name: nombre, accion: 'nombre' },
  };
}

/** Quitar la pistola de la lista. Esto sí la borra, y solo se llega acá por el botón ✕. */
export function quitarPicker(
  actuales: Readonly<Record<string, string>>,
  key: string,
): CambioDeNombre {
  const names = { ...actuales };
  delete names[key];
  return { names, envio: { key, display_name: '', accion: 'quitar' } };
}

/**
 * Cómo se muestra una pistola: su nombre, y si no tiene, la cuenta.
 *
 * Que una pistola sin nombre se dibuje con el nombre de su cuenta es lo que hace que «sin
 * asignar» sea un estado visible en vez de una fila en blanco.
 */
export function nombreVisible(
  canonicalNames: Readonly<Record<string, string>>,
  key: string,
): string {
  return canonicalNames[key]?.trim() || key;
}

/** ¿Esta pistola existe pero no la usa nadie? */
export function sinAsignar(
  canonicalNames: Readonly<Record<string, string>>,
  key: string,
): boolean {
  return key in canonicalNames && !canonicalNames[key]?.trim();
}
