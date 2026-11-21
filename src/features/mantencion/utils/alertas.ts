// Qué avisos le corresponden a una tienda en el tablero. Módulo puro.
//
// ── EL LÍMITE ES «MÁS QUE», NO «DESDE» ────────────────────────────────────────────────────────
//
// Con el umbral en 5, cinco solicitudes NO alertan y seis sí. Se escribe acá y se prueba en el
// borde exacto porque es el error que nadie ve: un `>=` donde va un `>` enciende el aviso en la
// mitad de las tiendas el primer día y el tablero deja de leerse.
//
// ── EL COLOR NO ES DECORACIÓN ─────────────────────────────────────────────────────────────────
//
// Rojo es lo que no tiene a nadie encima —pendientes sin fecha, una urgencia sin clasificar—.
// Ámbar es volumen: hay mucho, pero está visto. Dos niveles y no cinco: un tablero donde todo
// está marcado no marca nada.
//
// ── QUÉ NO DECIDE ESTE MÓDULO ─────────────────────────────────────────────────────────────────
//
// No ordena —eso es `prioridad.ts`— y no sabe de pantallas. Devuelve qué alertas aplican y con
// qué número, y quien dibuja elige cómo mostrarlas.

export type TipoAlerta =
  | 'sin_programar' | 'volumen_total' | 'urgencia' | 'antiguedad' | 'espera_material';

export type NivelAlerta = 'roja' | 'ambar';

export interface Alerta {
  tipo: TipoAlerta;
  nivel: NivelAlerta;
  /** El número que la disparó: cuántas solicitudes, o cuántos días. */
  valor: number;
}

/** Lo que hace falta saber de una tienda para decidir sus alertas. */
export interface EstadoTienda {
  /** Abiertas sin fecha de visita. */
  sinProgramar: number;
  /** Abiertas en total, programadas o no. */
  abiertas: number;
  /** Abiertas marcadas urgentes. */
  urgentes: number;
  /** Días de la más antigua sin cerrar. */
  diasMasAntigua: number;
  /** Alguna está esperando material. */
  esperaMaterial: boolean;
}

/** Los umbrales de `mant_config`. */
export interface UmbralesAlerta {
  umbralSinProgramar: number;
  umbralTotal: number;
  diasAntiguedad: number;
}

export const UMBRALES_POR_DEFECTO: UmbralesAlerta = {
  umbralSinProgramar: 5,
  umbralTotal: 5,
  diasAntiguedad: 7,
};

/**
 * Las alertas de una tienda, en orden de gravedad: primero las rojas.
 *
 * Una tienda sin nada devuelve una lista vacía, no una alerta «todo bien»: lo que no hace falta
 * mirar no ocupa espacio en el tablero.
 */
export function alertasDeTienda(
  t: EstadoTienda,
  u: UmbralesAlerta = UMBRALES_POR_DEFECTO,
): Alerta[] {
  const n = (x: unknown) => Math.max(0, Number(x) || 0);
  const sinProgramar = n(t.sinProgramar);
  const abiertas = n(t.abiertas);
  const urgentes = n(t.urgentes);
  const dias = n(t.diasMasAntigua);

  const rojas: Alerta[] = [];
  const ambares: Alerta[] = [];

  if (sinProgramar > n(u.umbralSinProgramar)) {
    rojas.push({ tipo: 'sin_programar', nivel: 'roja', valor: sinProgramar });
  }
  if (urgentes > 0) {
    rojas.push({ tipo: 'urgencia', nivel: 'roja', valor: urgentes });
  }
  if (abiertas > n(u.umbralTotal)) {
    ambares.push({ tipo: 'volumen_total', nivel: 'ambar', valor: abiertas });
  }
  if (dias > n(u.diasAntiguedad)) {
    ambares.push({ tipo: 'antiguedad', nivel: 'ambar', valor: dias });
  }
  if (t.esperaMaterial) {
    // Esperar material no es culpa de la tienda ni de Mantención: es un estado, y por eso es
    // ámbar aunque la solicitud lleve semanas. Marcarla en rojo mandaría a Jesús a revisar algo
    // que ya está resuelto hasta que llegue el material.
    ambares.push({ tipo: 'espera_material', nivel: 'ambar', valor: 1 });
  }

  return [...rojas, ...ambares];
}

/** El nivel más grave de una tienda, o `null` si no tiene ninguna alerta. */
export function nivelDeTienda(
  t: EstadoTienda,
  u: UmbralesAlerta = UMBRALES_POR_DEFECTO,
): NivelAlerta | null {
  const a = alertasDeTienda(t, u);
  if (a.some(x => x.nivel === 'roja')) return 'roja';
  return a.length ? 'ambar' : null;
}
