// Qué TIENDAS quedaron registradas una por una, sin cerrar el día. Puro y testeable.
//
// ── QUÉ RESUELVE ───────────────────────────────────────────────────────────────────────────────
//
// Hoy el registro es todo o nada: se aprieta REGISTRAR al final y sale el día entero. Pero una
// tienda puede quedar lista a las 11 y el día cerrarse a las 20, y en esas nueve horas su carga no
// existe para nadie más — ni en la planilla, ni en la base, ni en el cruce.
//
// Esto deja registrar UNA tienda cuando ya está terminada, sin tocar el día.
//
// ── LA PREGUNTA QUE HIZO EL COORDINADOR ────────────────────────────────────────────────────────
//
// «Ten cuidado que si al finalizar todas las tiendas doy clic en el botón registrar del resumen
// del día, no se vaya a duplicar la tienda que ya registré.»
//
// No se duplica, y no por cuidado de este archivo sino por cómo está hecha la escritura. El id de
// cada fila es `${orden}${cod}${stamp}${prefijo}` —determinista— y `api/sheets-write` hace:
//
//     const newSheetRows = rows.filter(r => !sheetIdSet.has(String(r[0])));
//
// La hoja SOLO agrega ids que no tiene, y el espejo a Supabase separa insert de update por id. Al
// registrar el día entero, las filas de la tienda ya registrada caen en «ya existe» y se
// actualizan en su lugar.
//
// Eso vale mientras el id sea EL MISMO en las dos escrituras, y de ahí salen las dos condiciones
// que impone `puedeRegistrarTienda`:
//
//   · la tienda tiene que estar TERMINADA — con la tienda abierta el `orden` todavía se puede
//     mover (unir dos pallets renumera), y un `orden` distinto es un id distinto, y un id distinto
//     SÍ duplicaría;
//   · la fecha de despacho tiene que ser la misma, porque el `stamp` sale de ella. Por eso el
//     botón usa exactamente la misma llamada que el registro del día, con una sola tienda.
//
// ── SOLO ADMIN ─────────────────────────────────────────────────────────────────────────────────
//
// Pedido explícito. Se pregunta por el ROL y no por `can(...)`, porque `can` con `'read'` devuelve
// true para cualquiera autenticado y solo `'edit'` restringe: es un filo fácil de agarrar al revés.

/** `{ '2026-09-30': { '01TPS': '11:42' } }` — la hora en que se registró cada tienda, por día. */
export type RegistroTiendas = Record<string, Record<string, string>>;

/** ¿Esta tienda ya se registró sola, ese día? */
export function tiendaRegistrada(
  mapa: RegistroTiendas | undefined | null, fecha: string, cod: string,
): string | null {
  if (!mapa || !fecha || !cod) return null;
  return mapa[fecha]?.[cod.toUpperCase()] ?? null;
}

/** Marca una tienda, sin tocar las demás ni los otros días. */
export function marcarTiendaRegistrada(
  mapa: RegistroTiendas | undefined | null, fecha: string, cod: string, hora: string,
): RegistroTiendas {
  if (!fecha || !cod) return { ...(mapa ?? {}) };
  const base = { ...(mapa ?? {}) };
  base[fecha] = { ...(base[fecha] ?? {}), [cod.toUpperCase()]: hora };
  return base;
}

/**
 * Une lo local con lo de otro equipo. **Una marca nunca se pierde.**
 *
 * Misma regla que `registroPorFecha`: dos personas trabajan el mismo día desde equipos distintos, y
 * la que todavía no registró una tienda no puede desmarcársela a la que sí. Ante dos horas para la
 * misma tienda gana la PRIMERA, que es cuando de verdad se registró.
 */
export function fusionarRegistroTiendas(
  a: RegistroTiendas | undefined | null, b: RegistroTiendas | undefined | null,
): RegistroTiendas {
  const out: RegistroTiendas = {};
  for (const mapa of [a ?? {}, b ?? {}]) {
    for (const [fecha, tiendas] of Object.entries(mapa)) {
      out[fecha] = { ...(out[fecha] ?? {}) };
      for (const [cod, hora] of Object.entries(tiendas ?? {})) {
        const previa = out[fecha][cod];
        out[fecha][cod] = previa && previa <= hora ? previa : hora;
      }
    }
  }
  return out;
}

export interface EstadoBoton {
  puede: boolean;
  /** Por qué NO se puede, para el `title` del botón. `null` cuando sí se puede. */
  motivo: string | null;
  /** `false` esconde el botón del todo: no es una puerta cerrada, es que no existe. */
  visible: boolean;
}

/**
 * Si se puede registrar esta tienda, y si no, por qué.
 *
 * El motivo se muestra: un botón apagado sin explicación hace que la gente lo apriete tres veces y
 * después pregunte. Para quien no es admin el botón no se dibuja — no se muestra una puerta
 * cerrada, misma decisión que con las pestañas de Bodega en el #577.
 */
export function puedeRegistrarTienda({ rol, terminada, unidades, yaRegistrada }: {
  rol?: string | null;
  terminada: boolean;
  unidades: number;
  yaRegistrada?: string | null;
}): EstadoBoton {
  if (String(rol ?? '').trim().toLowerCase() !== 'admin') {
    return { puede: false, motivo: null, visible: false };
  }
  if (unidades <= 0) {
    return { puede: false, motivo: 'La tienda no tiene carga todavía.', visible: true };
  }
  if (!terminada) {
    // No es burocracia: con la tienda abierta el `orden` se puede mover —unir dos pallets
    // renumera— y un `orden` distinto es un id distinto. Ahí SÍ se duplicaría.
    return { puede: false, motivo: 'Marca la tienda TERMINADA antes de registrarla.', visible: true };
  }
  if (yaRegistrada) {
    // Se deja apretar igual: volver a registrar es inofensivo —los ids ya existen y se actualizan—
    // y sirve para empujar un peso corregido. El rótulo dice que ya se hizo.
    return { puede: true, motivo: null, visible: true };
  }
  return { puede: true, motivo: null, visible: true };
}

/** El rótulo del botón. Dice si ya se hizo, y cuándo. */
export function rotuloBoton(yaRegistrada?: string | null): string {
  return yaRegistrada ? `Registrada ${yaRegistrada}` : 'Registrar';
}
