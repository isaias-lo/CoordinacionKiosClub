// Mide cuánto coincide la asignación que PROPUSO el motor con la que el coordinador dejó FINAL.
// Puro y testeable — alimenta el bloque "Qué tan de acuerdo estamos" del Tablero vivo.
//
// La métrica es por PARES de tiendas (tipo Rand): para cada par del mismo día, ¿quedaron en el
// mismo camión en ambas asignaciones? Se elige por pares —y no por tienda— porque es robusta al
// nombre del camión: no importa si el coordinador usó otra patente, solo si AGRUPÓ igual.
//   · precision = de los pares que el MOTOR juntó, cuántos también juntó el coordinador.
//   · cobertura = de los pares que el COORDINADOR juntó, cuántos también había juntado el motor.
//   · f1        = media armónica de ambas (el número "de acuerdo" global).
// Solo se cuentan pares de tiendas presentes en AMBAS asignaciones: una tienda que está en una y no
// en la otra (p. ej. la que el motor mandó a 2ª vuelta) se EXCLUYE, no cuenta como desacuerdo.

export interface Coincidencia {
  /** pares de tiendas que quedaron JUNTAS en ambas (verdaderos positivos). */
  paresCoinciden: number;
  /** pares juntos en exactamente UNA de las dos (desacuerdos: FP + FN). */
  paresDistintos: number;
  /** tiendas (presentes en ambas) que quedaron en un camión distinto al propuesto. */
  tiendasMovidas: number;
  precision: number;   // 0..1
  cobertura: number;   // 0..1  (recall)
  f1: number;          // 0..1
}

/** Mapa cod→patente a partir de una asignación { patente: [cods] }. */
function porTienda(asig: Record<string, string[]>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [pat, cods] of Object.entries(asig ?? {})) {
    for (const c of cods) m.set(c, pat);
  }
  return m;
}

/**
 * Coincidencia entre la propuesta del motor y la asignación final.
 * @param excluir cods a sacar del cálculo (p. ej. `segunda_vuelta` + `sin_flota` del motor): tiendas
 *   que el motor dejó fuera A PROPÓSITO y que no deben contar como desacuerdo.
 */
export function coincidenciaAsignacion(
  propuesta: Record<string, string[]>,
  final: Record<string, string[]>,
  excluir: Iterable<string> = [],
): Coincidencia {
  const ex = new Set(excluir);
  const pa = porTienda(propuesta);
  const fi = porTienda(final);
  // Solo tiendas presentes en AMBAS (y no excluidas): las de un solo lado no se juzgan.
  const comunes = [...pa.keys()].filter(c => fi.has(c) && !ex.has(c));

  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < comunes.length; i++) {
    for (let j = i + 1; j < comunes.length; j++) {
      const a = comunes[i], b = comunes[j];
      const juntosP = pa.get(a) === pa.get(b);
      const juntosF = fi.get(a) === fi.get(b);
      if (juntosP && juntosF) tp++;
      else if (juntosP && !juntosF) fp++;
      else if (!juntosP && juntosF) fn++;
      // distintos en ambas (TN): no aporta a la métrica.
    }
  }

  // Sin pares "juntos" en ningún lado (todas en camiones distintos, o < 2 tiendas comunes): no hay
  // nada que contradecir → coincidencia vacuosamente perfecta. Los llamadores filtran los días sin
  // propuesta real antes de promediar.
  const precision = (tp + fp) === 0 ? 1 : tp / (tp + fp);
  const cobertura = (tp + fn) === 0 ? 1 : tp / (tp + fn);
  const f1 = (precision + cobertura) === 0 ? 0 : (2 * precision * cobertura) / (precision + cobertura);
  const tiendasMovidas = comunes.filter(c => pa.get(c) !== fi.get(c)).length;

  return { paresCoinciden: tp, paresDistintos: fp + fn, tiendasMovidas, precision, cobertura, f1 };
}

/** Cods (presentes en ambas) que el coordinador movió a otro camión respecto de la propuesta.
 *  Para armar el ranking de "tiendas que más se mueven" agregando varios días. */
export function tiendasMovidasEntre(
  propuesta: Record<string, string[]>,
  final: Record<string, string[]>,
  excluir: Iterable<string> = [],
): string[] {
  const ex = new Set(excluir);
  const pa = porTienda(propuesta);
  const fi = porTienda(final);
  return [...pa.keys()].filter(c => fi.has(c) && !ex.has(c) && pa.get(c) !== fi.get(c));
}

/** Fila de `ia_asignacion_feedback` que necesita el resumen (una por día registrado). */
export interface FilaFeedback {
  fecha: string;
  propuesta_ia: Record<string, string[]> | null;
  final: Record<string, string[]>;
  segunda_vuelta?: string[] | null;
  sin_flota?: string[] | null;
}

export interface ResumenCoincidencia {
  /** Coincidencia del día `hoyISO` (null si todavía no hay fila con propuesta para hoy). */
  hoy: Coincidencia | null;
  /** Promedio de f1 sobre los días con propuesta y pares reales (null si no hay ninguno). */
  promedioF1: number | null;
  /** Cuántos días entraron al promedio. */
  dias: number;
  /** Tiendas que más se mueven respecto de la propuesta, de mayor a menor. */
  tiendasTop: { cod: string; veces: number }[];
}

/**
 * Agrega las filas de feedback en el resumen del panel "Qué tan de acuerdo estamos": coincidencia de
 * hoy, promedio de los últimos días y las tiendas que más se mueven (las excepciones que el motor
 * todavía no entiende). Puro. Ignora filas sin propuesta (motor no corrió) y días sin pares reales.
 */
export function resumenCoincidencia(rows: FilaFeedback[], hoyISO: string, topN = 8): ResumenCoincidencia {
  const excluirDe = (r: FilaFeedback) => [...(r.segunda_vuelta ?? []), ...(r.sin_flota ?? [])];
  const conPropuesta = rows.filter(r => r.propuesta_ia && Object.keys(r.propuesta_ia).length > 0);

  let suma = 0, dias = 0;
  const movCount = new Map<string, number>();
  for (const r of conPropuesta) {
    const c = coincidenciaAsignacion(r.propuesta_ia!, r.final, excluirDe(r));
    if (c.paresCoinciden + c.paresDistintos > 0) { suma += c.f1; dias++; } // solo días que informan
    for (const cod of tiendasMovidasEntre(r.propuesta_ia!, r.final, excluirDe(r))) {
      movCount.set(cod, (movCount.get(cod) ?? 0) + 1);
    }
  }

  const filaHoy = conPropuesta.find(r => r.fecha === hoyISO) ?? null;
  const hoy = filaHoy ? coincidenciaAsignacion(filaHoy.propuesta_ia!, filaHoy.final, excluirDe(filaHoy)) : null;
  const tiendasTop = [...movCount.entries()]
    .map(([cod, veces]) => ({ cod, veces }))
    .sort((a, b) => b.veces - a.veces || a.cod.localeCompare(b.cod))
    .slice(0, topN);

  return { hoy, promedioF1: dias ? suma / dias : null, dias, tiendasTop };
}
