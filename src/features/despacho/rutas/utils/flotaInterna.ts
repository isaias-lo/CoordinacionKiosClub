/* ── Flota interna: registro de salida de vehículos ───────────────────────────
   Digitaliza la tabla del jefe ("REGISTRO SALIDA DE VEHÍCULOS"): 1 fila por salida.
   Helpers PUROS (sin DOM ni red) para serializar/armar la fila del Sheet DB. */

export interface ParadaSalida { ref: string; obs: string }

export interface SalidaVehiculo {
  fecha: string;        // ISO yyyy-mm-dd
  conductor: string;
  vehiculo: string;
  patente: string;
  tipo: string;         // 'Entrega' | 'Retiro' | 'Mixto'
  contenido: string;    // congelados, muebles, merma, maquila…
  obsGeneral: string;
  horaSalida: string;
  horaRegreso: string;
  paradas: ParadaSalida[];
}

export const SALIDA_SHEET = 'SALIDA VEHICULOS';

// Orden POSICIONAL de columnas de la hoja (no reordenar; solo agregar al final). Ver
// memoria [[sheets-columnas-posicionales]].
export const SALIDA_HEADERS = [
  'Fecha', 'Conductor', 'Vehículo', 'Patente', 'Tipo', 'Contenido', 'N° Puntos',
  'Tiendas/Destinos', 'Observaciones', 'Hora Salida', 'Hora Regreso', 'Registrado el',
];

/** ISO (yyyy-mm-dd) → dd/mm/yyyy (formato del jefe). Deja tal cual si no matchea. */
export function fechaDDMM(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
}

/** Serializa las paradas en 2 celdas: lista de tiendas/destinos + observaciones por parada. */
export function serializarParadas(paradas: ParadaSalida[]): { tiendas: string; observaciones: string } {
  const limpias = paradas.map(p => ({ ref: p.ref.trim(), obs: p.obs.trim() })).filter(p => p.ref);
  const tiendas = limpias.map(p => p.ref).join(', ');
  const observaciones = limpias.filter(p => p.obs).map(p => `${p.ref}: ${p.obs}`).join(' · ');
  return { tiendas, observaciones };
}

/**
 * Fila (1 por salida) para la hoja SALIDA VEHICULOS. `nPuntos` se calcula solo (nº de paradas
 * con ref). Las observaciones por parada se concatenan y se les suma la observación general.
 */
export function buildSalidaRow(s: SalidaVehiculo, registradoISO: string): (string | number)[] {
  const { tiendas, observaciones } = serializarParadas(s.paradas);
  const nPuntos = s.paradas.filter(p => p.ref.trim()).length;
  const obs = [observaciones, s.obsGeneral.trim()].filter(Boolean).join(' — ');
  return [
    fechaDDMM(s.fecha), s.conductor.trim(), s.vehiculo.trim(), s.patente.trim(),
    s.tipo, s.contenido.trim(), nPuntos,
    tiendas, obs, s.horaSalida, s.horaRegreso, registradoISO,
  ];
}
