import { OPCIONES_DEFAULT, aMinutos } from './enrutadorV2';
import { INCREMENTAL_DEFAULT, type OpcionesIncremental } from './enrutadorIncremental';

/**
 * Los seis parámetros del motor editables en pantalla (PASO 5). Salen de `OPCIONES_DEFAULT`
 * (geografía/ventanas) + `INCREMENTAL_DEFAULT` (cierre incremental). `horaSalida` se maneja como
 * 'HH:MM' (lo que espera el motor); `corteCierre` como minutos-desde-medianoche (lo que espera el
 * motor), aunque en la UI se edita como hora.
 */
export interface ParametrosMotor {
  maxDiametroKm: number;    // 0 = sin límite
  velocidadKmH: number;
  minutosPorParada: number;
  horaSalida: string;       // 'HH:MM'
  corteCierre: number;      // minutos desde medianoche
  silencioMin: number;
}

export const PARAMETROS_DEFAULT: ParametrosMotor = {
  maxDiametroKm:    OPCIONES_DEFAULT.maxDiametroKm,
  velocidadKmH:     OPCIONES_DEFAULT.velocidadKmH,
  minutosPorParada: OPCIONES_DEFAULT.minutosPorParada,
  horaSalida:       OPCIONES_DEFAULT.horaSalida,
  corteCierre:      INCREMENTAL_DEFAULT.corteCierre,
  silencioMin:      INCREMENTAL_DEFAULT.silencioMin,
};

/** Claves en `config_despacho` (tabla plana clave→valor de `/api/parametros-sistema`). */
export const CLAVES = {
  maxDiametroKm:    'motor_max_diametro_km',
  velocidadKmH:     'motor_velocidad_kmh',
  minutosPorParada: 'motor_minutos_parada',
  horaSalida:       'motor_hora_salida',
  corteCierre:      'motor_corte_cierre',   // se guarda como 'HH:MM'
  silencioMin:      'motor_silencio_min',
} as const;

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

function numPos(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
}
function numNoNeg(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

/** Minutos-desde-medianoche → 'HH:MM' (para persistir corteCierre y mostrar horarios). */
export function minutosAHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Lee el objeto plano {clave:valor} de `/api/parametros-sistema` a `ParametrosMotor`, cayendo al
 * default ante ausencia o basura. `maxDiametroKm` admite 0 (= sin límite); el resto exige > 0.
 */
export function parseParametros(raw: Record<string, string> = {}): ParametrosMotor {
  const horaTxt  = String(raw[CLAVES.horaSalida] ?? '');
  const corteTxt = String(raw[CLAVES.corteCierre] ?? '');
  return {
    maxDiametroKm:    numNoNeg(raw[CLAVES.maxDiametroKm], PARAMETROS_DEFAULT.maxDiametroKm),
    velocidadKmH:     numPos(raw[CLAVES.velocidadKmH], PARAMETROS_DEFAULT.velocidadKmH),
    minutosPorParada: numPos(raw[CLAVES.minutosPorParada], PARAMETROS_DEFAULT.minutosPorParada),
    horaSalida:       HHMM.test(horaTxt) ? horaTxt : PARAMETROS_DEFAULT.horaSalida,
    corteCierre:      HHMM.test(corteTxt) ? (aMinutos(corteTxt) ?? PARAMETROS_DEFAULT.corteCierre) : PARAMETROS_DEFAULT.corteCierre,
    silencioMin:      numPos(raw[CLAVES.silencioMin], PARAMETROS_DEFAULT.silencioMin),
  };
}

/** Serializa a los pares {clave,valor} que persiste POST `/api/parametros-sistema`. */
export function serializarParametros(p: ParametrosMotor): { clave: string; valor: string }[] {
  return [
    { clave: CLAVES.maxDiametroKm,    valor: String(p.maxDiametroKm) },
    { clave: CLAVES.velocidadKmH,     valor: String(p.velocidadKmH) },
    { clave: CLAVES.minutosPorParada, valor: String(p.minutosPorParada) },
    { clave: CLAVES.horaSalida,       valor: p.horaSalida },
    { clave: CLAVES.corteCierre,      valor: minutosAHHMM(p.corteCierre) },
    { clave: CLAVES.silencioMin,      valor: String(p.silencioMin) },
  ];
}

/** Opciones para `planificarIncremental` / `enrutarV2` desde los parámetros. */
export function aOpcionesMotor(p: ParametrosMotor): OpcionesIncremental {
  return {
    maxDiametroKm:    p.maxDiametroKm,
    velocidadKmH:     p.velocidadKmH,
    minutosPorParada: p.minutosPorParada,
    horaSalida:       p.horaSalida,
    corteCierre:      p.corteCierre,
    silencioMin:      p.silencioMin,
  };
}
