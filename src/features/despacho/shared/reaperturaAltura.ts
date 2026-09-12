// Cuando a un pallet se le suma carga, hay que volver a mirar su altura. Puro y testeable.
//
// Existe por 51SER el 2026-09-11: el pallet #12718 se registró a las 12:39 con 162 kg y 60 cm, y a
// las 12:49 se le sumaron 10 ítems (+183 kg). El peso quedó bien (345 kg), pero la altura siguió
// diciendo 60 cm — sumar nunca la tocaba. La caja terminó midiendo bastante más, y esa diferencia
// no es cosmética: el Enrutador reparte volumen con la altura registrada y el aviso de "pallet alto"
// del Manual nunca se enciende.
//
// Unificar pallets ya reabría la tarjeta del destino para pedir la altura. Sumar bultos hace lo
// mismo con la carga, así que ahora también reabre; solo cambia cómo se explica.

export type MotivoReapertura = 'union' | 'suma';

/** El cartel dentro de la tarjeta reabierta. */
export function bannerReapertura(motivo: MotivoReapertura): string {
  return motivo === 'suma'
    ? '⬦ Sumado · peso ya sumado — confirma la altura y Agregar'
    : '⬦ Unificado · peso ya sumado — ingresa la altura y Agregar';
}

/** El texto del botón de guardado de esa tarjeta. */
export function botonReapertura(motivo: MotivoReapertura): string {
  return motivo === 'suma' ? '+ Agregar (sumado)' : '+ Agregar (unificado)';
}

/**
 * El aviso que aparece al sumar. `cuantos` es cuántas unidades se sumaron (1 en la suma simple).
 *
 * Dice el peso agregado —el dato que la persona acaba de ver— y pide la altura, que es lo único
 * que el sistema no puede deducir.
 */
export function toastSuma(destino: string, kg: number, cuantos = 1): string {
  const que = cuantos === 1 ? `Sumado a ${destino}` : `${cuantos} sumados a ${destino}`;
  return `${que} (+${kg}kg) — confirma la altura y Agregar`;
}
