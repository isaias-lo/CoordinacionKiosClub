// Corregir a mano quién hizo un movimiento. Módulo puro: valida el pedido y arma el texto que se
// le muestra a la persona antes de guardar.
//
// ── POR QUÉ SE CORRIGE EL PICKER Y NADA MÁS ───────────────────────────────────────────────────
//
// En Odoo el responsable de un movimiento es la CUENTA de la pistola, no la persona. Eso ya se
// sabía —existe `picker_canonical_names` para traducir «Pickers 15» a «Cristobal Labra»—, pero esa
// traducción es por cuenta, y una pistola se presta.
//
// Medido del 28/10 al 04/11: 862 movimientos repartidos en 31 cuentas distintas, cada una con
// entre 24 y 76 movimientos en la semana. Y el problema no se limita a las cuentas «Pickers N»:
// `Laura Roiatti Finato` está mapeada a `Diego Echeverria`, así que ni siquiera una cuenta con
// nombre de persona pertenece a esa persona.
//
// Las cantidades NO se corrigen: salen de lo validado en Odoo, que es lo que la persona hizo.
//
// ── NADA SE CAMBIA SIN CONFIRMAR ──────────────────────────────────────────────────────────────
//
// Cambiar quién hizo un trabajo mueve sus métricas: los minutos y las líneas de ese movimiento
// pasan de una persona a otra. Por eso el texto de confirmación dice las dos cosas —de quién sale
// y a quién va— y no solo «¿confirmar?». El que aprueba tiene que poder ver qué está aprobando.

import type { SeccionPlanilla } from './armarPlanilla';

/** Lo que se quiere corregir en una celda. */
export interface PedidoCorreccion {
  /** La referencia de Odoo del movimiento. Es lo que identifica la celda. */
  ref: string;
  fecha: string;
  cod: string;
  seccion: SeccionPlanilla;
  /** El nombre que se muestra hoy: el de Odoo traducido, o una corrección anterior. */
  pickerActual: string;
  /** La persona que de verdad lo hizo. */
  pickerNuevo: string;
}

export type Validacion = { ok: true } | { ok: false; motivo: string };

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ¿Se puede guardar? Devuelve el motivo en palabras, para mostrarlo tal cual. */
export function validarCorreccion(p: PedidoCorreccion): Validacion {
  if (!p.ref.trim())   return { ok: false, motivo: 'El movimiento no tiene referencia de Odoo.' };
  if (!FECHA_RE.test(p.fecha)) return { ok: false, motivo: 'La fecha no es válida.' };
  if (!p.cod.trim())   return { ok: false, motivo: 'Falta la tienda.' };

  const nuevo = p.pickerNuevo.trim();
  if (!nuevo) return { ok: false, motivo: 'Hay que elegir quién hizo el movimiento.' };
  // Sin esto, «guardar» sobre el mismo nombre dejaría la celda marcada como corregida sin que
  // nada haya cambiado, y el conteo de correcciones mentiría.
  if (nuevo === p.pickerActual.trim()) {
    return { ok: false, motivo: 'Ese ya es el picker de este movimiento.' };
  }
  return { ok: true };
}

export interface TextoConfirmacion {
  titulo: string;
  /** Las líneas del cuadro, en orden. Cada una se muestra como un renglón. */
  lineas: string[];
  aviso: string;
}

/**
 * Lo que se le muestra a la persona ANTES de guardar.
 *
 * Dice de quién sale y a quién va, con la tienda y la sección, para que se pueda verificar sin
 * cerrar el cuadro. El aviso explica la consecuencia que no es obvia: las métricas se mueven.
 */
export function textoConfirmacion(p: PedidoCorreccion): TextoConfirmacion {
  return {
    titulo: '¿Cambiar quién hizo este movimiento?',
    lineas: [
      `${p.cod} · ${p.seccion}`,
      `Ahora dice: ${p.pickerActual.trim() || 'sin asignar'}`,
      `Va a decir: ${p.pickerNuevo.trim()}`,
    ],
    aviso: 'El tiempo y los registros de este movimiento pasan a contar para la persona nueva, '
         + 'también en sus métricas. La hoja va a mostrar que este nombre se corrigió a mano.',
  };
}
