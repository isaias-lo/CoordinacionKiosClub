// Qué cambió, en palabras.
//
// El calendario, la flota, los roles y las tiendas son mutables y compartidos, y no quedaba rastro
// de quién cambió qué. Cuando desapareció 40LIL, o cuando un camión "se guardaba y desaparecía",
// hubo que hacer forense sobre la base: cruzar `shared_session_state` con `rutas_despacho` y con
// el feedback del motor para reconstruir un día. Eso responde en segundos con un registro.
//
// Guardar `antes` y `despues` completos es necesario para reconstruir, pero ilegible para mirar.
// Lo que hace útil a un registro de cambios es la línea que se lee de un vistazo: qué campos
// cambiaron y de qué a qué. Eso es lo que arma este módulo.
//
// Puro y testeable: no toca red ni base.

export interface CampoCambiado { campo: string; antes: string; despues: string }

/** Cómo se muestra un valor vacío. Un `null` y un `''` son lo mismo para quien lee. */
const VACIO = '∅';

function texto(v: unknown): string {
  if (v == null) return VACIO;
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (Array.isArray(v)) return v.length ? v.join(', ') : VACIO;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.trim() === '' ? VACIO : s;
}

/**
 * Los campos que cambiaron entre dos versiones.
 *
 * `etiquetas` decide QUÉ se mira y cómo se llama cada campo en pantalla: sin eso, un cambio de
 * tienda mostraría también `updated_at` y ruido interno que nadie pidió. Solo se comparan las
 * claves que están ahí, y en ese orden — el orden de lectura lo define quien lo muestra.
 *
 * La comparación es por TEXTO mostrado, así que `null` y `''` no cuentan como cambio: para quien
 * lee son lo mismo, y reportarlo sería inventar un cambio que nadie hizo.
 */
export function camposCambiados(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown> | null | undefined,
  etiquetas: Record<string, string>,
): CampoCambiado[] {
  const out: CampoCambiado[] = [];
  for (const [clave, etiqueta] of Object.entries(etiquetas)) {
    const a = texto(antes?.[clave]);
    const d = texto(despues?.[clave]);
    if (a !== d) out.push({ campo: etiqueta, antes: a, despues: d });
  }
  return out;
}

/**
 * El cambio en una línea, listo para mostrar.
 *
 * Se corta a `max` campos y se dice cuántos quedaron fuera, en vez de escupir veinte: una línea
 * que no cabe en pantalla no se lee, y el detalle completo igual queda en `antes`/`despues`.
 */
export function resumenCambio(cambios: CampoCambiado[], max = 4): string {
  if (!cambios.length) return 'Sin cambios';
  const visibles = cambios.slice(0, max).map(c => `${c.campo}: ${c.antes} → ${c.despues}`);
  const resto = cambios.length - visibles.length;
  return visibles.join(' · ') + (resto > 0 ? ` · y ${resto} campo${resto === 1 ? '' : 's'} más` : '');
}

/** Las entidades que se registran. Cada una nombra sus campos y cómo se llama su identificador. */
export const ENTIDADES = {
  tienda: {
    label: 'Tienda',
    campos: {
      nombre: 'nombre', direccion: 'dirección', sector_comuna: 'sector', region: 'región',
      corredor: 'corredor', tipo: 'tipo', ventana: 'ventana', lat: 'lat', lon: 'lon',
      correos: 'correos', tel_encargado: 'tel. encargado', supervisor: 'supervisor',
      tel_supervisor: 'tel. supervisor', recepcion_pallet: 'recepción pallet', activo: 'activa',
      region_sendu: 'región Sendu', comuna: 'comuna', calle: 'calle', numero: 'número',
      complemento: 'complemento',
    } as Record<string, string>,
  },
  flota: {
    label: 'Camión',
    campos: {
      empresa: 'empresa', capacidad_p: 'capacidad pallets', capacidad_b: 'capacidad bultos',
      tipo: 'tipo', porton: 'portón', refrigerado: 'refrigerado', es_tlbd: '2ª vuelta',
      activo: 'activo', en_servicio: 'en servicio',
    } as Record<string, string>,
  },
} as const;

export type Entidad = keyof typeof ENTIDADES;
export type AccionBitacora = 'crear' | 'editar' | 'eliminar';
