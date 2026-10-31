// Qué se pierde al descartar un borrador de Bodega, dicho antes de descartarlo. PURO.
//
// ── EL CASO DEL 22/10/2026 ────────────────────────────────────────────────────────────────────
//
// Ese jueves Bodega RM/Costa pesó 20 tiendas —46 unidades, 8.557,9 kg— y nadie apretó REGISTRAR.
// Al día siguiente apareció el aviso de «despacho sin registrar», y alguien eligió **Descartar**.
//
// El borrador se borró: el blob de `shared_session_state` quedó con una sola clave, `_handled`.
// Desde ahí el día no vuelve a aparecer en el aviso NUNCA, porque el aviso se arma justamente de
// los blobs que no están atendidos. Nadie lo volvió a ver, y la hoja CRUCE PESOS mostró ese día
// con 20 de 27 tiendas sin peso durante una semana.
//
// Lo que la pregunta decía entonces era, entero: «¿Descartar el borrador del jueves 22 de octubre?
// No se puede deshacer.» Verdadero, y a la vez inútil: no se puede deshacer QUÉ.
//
// ── POR QUÉ LOS KILOS Y NO EL RESUMEN DEL BORRADOR ────────────────────────────────────────────
//
// El aviso ya muestra «3 tiendas · 12 pallets». Eso dice cuánto hay en la PANTALLA, que es lo que
// se descarta; no dice cuánto de eso es trabajo que ya pasó por la balanza y no está registrado en
// ninguna otra parte. Son preguntas distintas y la segunda es la que duele: un borrador de una
// tienda que ya se registró no cuesta nada tirarlo, y uno de 8.557 kg sin registrar es una semana
// de cruce roto.
//
// Por eso el peso sale de `picking_pallets` —la balanza— cruzado contra lo que ya está en
// `despacho_rm` / `despacho_regiones`, que es la misma pregunta que responde el cruce.
//
// ── SI NO SE PUEDE AVERIGUAR, SE DESCARTA IGUAL ───────────────────────────────────────────────
//
// `pesado` admite `null`: si las consultas fallan, la pregunta vuelve a ser la de antes y el botón
// sigue funcionando. Un aviso que no se puede calcular no es motivo para bloquear una acción que
// hoy funciona — bastante daño hace ya el silencio.

import type { PedidoConfirmacion } from './confirmar';

/** Lo que pasó por la balanza y no está registrado. */
export interface LoPesado {
  unidades: number;
  kg: number;
}

/** Una unidad de `picking_pallets`, con lo poco que hace falta mirarle. */
export interface SlotPesado {
  id: number;
  peso: number | null;
}

/**
 * Cuánto de lo pesado ese día NO llegó a `despacho_*`.
 *
 * La llave es el `picking_slot_id`, igual que en `sumarPesosPorTienda`: es lo único que identifica
 * una unidad física entre las dos tablas. Una unidad sin peso no cuenta —todavía no se pesó, no
 * hay nada que perder— y una ya registrada tampoco.
 */
export function contarPesadoSinRegistrar(
  slots: readonly SlotPesado[],
  registrados: ReadonlySet<number>,
): LoPesado {
  let unidades = 0;
  let kg = 0;
  for (const s of slots) {
    const peso = typeof s.peso === 'number' ? s.peso : null;
    if (peso === null || !(peso > 0)) continue;
    if (registrados.has(s.id)) continue;
    unidades += 1;
    kg += peso;
  }
  // Un decimal, como la balanza. Sumar flotantes deja colas de 0,0000001 que en un aviso se leen
  // como un error del sistema.
  return { unidades, kg: Math.round(kg * 10) / 10 };
}

/** «8.557,9», como se escribe un peso en Chile. */
export function enKilos(kg: number): string {
  return kg.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * La pregunta antes de descartar un borrador.
 *
 * Con trabajo pesado sin registrar, el botón deja de decir «Descartar» y pasa a decir «Descartar
 * igual»: la palabra sola suena a limpiar una pantalla, y «igual» es lo que avisa que se está
 * pasando por encima de algo que la pregunta acaba de nombrar.
 */
export function pedidoDescartarBorrador(
  fechaBonita: string,
  pesado: LoPesado | null,
): PedidoConfirmacion {
  const titulo = `¿Descartar el borrador del ${fechaBonita}?`;

  if (!pesado || pesado.unidades === 0) {
    return { titulo, detalle: 'No se puede deshacer.', aceptar: 'Descartar', tono: 'peligro' };
  }

  const u = pesado.unidades === 1 ? '1 unidad pesada' : `${pesado.unidades} unidades pesadas`;
  return {
    titulo,
    detalle: `Ese día tiene ${u} y ${enKilos(pesado.kg)} kg que nunca se registraron.\n`
      + 'Descartar NO los registra: el aviso desaparece, el día no vuelve a aparecer y esa carga '
      + 'queda fuera de la planilla y del cruce.\n'
      + 'Para conservarla, cancela y usa «Registrar ahora».',
    aceptar: 'Descartar igual',
    tono: 'peligro',
  };
}
