// Los umbrales y pesos que Jesús edita en Ajustes, y cómo pasan de la fila a la pantalla.
// Módulo puro.
//
// Los topes no son decoración: un 0 en `dias_por_solicitud` dividía el puntaje por cero
// (`prioridad.ts` ya se defiende), y un umbral de 0 pondría en alerta a toda tienda con una sola
// solicitud. Validar acá corta el problema antes de que llegue a la base.

import { z } from 'zod';
import { CONFIG_POR_DEFECTO, type ConfigMant } from './tablero';

const entero = (min: number, max: number) => z.number().int().min(min).max(max);

export const CAMPOS_AJUSTE: ReadonlyArray<{
  clave: keyof ConfigMant; columna: string; etiqueta: string; ayuda: string; min: number; max: number;
}> = [
  { clave: 'umbralSinProgramar', columna: 'umbral_sin_programar', etiqueta: 'Alerta roja: sin programar',
    ayuda: 'Una tienda con MÁS de estas solicitudes sin programar se marca en rojo.', min: 1, max: 50 },
  { clave: 'umbralTotal', columna: 'umbral_total', etiqueta: 'Alerta ámbar: abiertas',
    ayuda: 'Una tienda con MÁS de estas solicitudes abiertas se marca en ámbar.', min: 1, max: 50 },
  { clave: 'diasAntiguedad', columna: 'dias_antiguedad', etiqueta: 'Alerta ámbar: días de espera',
    ayuda: 'Si la solicitud más antigua lleva MÁS de estos días, la tienda se marca en ámbar.', min: 1, max: 90 },
  { clave: 'pesoUrgente', columna: 'peso_urgente', etiqueta: 'Peso de una urgente',
    ayuda: 'Cuántas solicitudes normales vale una urgente al ordenar el tablero.', min: 0, max: 20 },
  { clave: 'diasPorSolicitud', columna: 'dias_por_solicitud', etiqueta: 'Días que valen una solicitud',
    ayuda: 'Cada tantos días de espera, la tienda sube como si tuviera una solicitud más.', min: 1, max: 30 },
  { clave: 'diasAvisoPrecierre', columna: 'dias_aviso_precierre', etiqueta: 'Aviso de precierre (días)',
    ayuda: 'Se usa en la Fase 2, con los técnicos. Se guarda desde ya.', min: 1, max: 30 },
];

export const AjustesSchema = z.object(Object.fromEntries(
  CAMPOS_AJUSTE.map(c => [c.clave, entero(c.min, c.max)]),
) as Record<keyof ConfigMant, z.ZodNumber>);

/** De la fila de `mant_config` a la pantalla. Lo que falta cae al valor de la semilla. */
export function configDeFila(fila: Record<string, unknown> | null | undefined): ConfigMant {
  const out = { ...CONFIG_POR_DEFECTO };
  for (const c of CAMPOS_AJUSTE) {
    const v = Number(fila?.[c.columna]);
    if (Number.isFinite(v)) out[c.clave] = v;
  }
  return out;
}

/** De la pantalla a las columnas de `mant_config`. */
export function filaDeConfig(c: ConfigMant): Record<string, number> {
  return Object.fromEntries(CAMPOS_AJUSTE.map(x => [x.columna, c[x.clave]]));
}

/** Un nombre de categoría limpio, o `null` si no sirve. */
export function nombreCategoria(entrada: unknown): string | null {
  if (typeof entrada !== 'string') return null;
  const limpio = entrada.trim().replace(/\s+/g, ' ');
  if (!limpio || limpio.length > 60) return null;
  return limpio;
}
