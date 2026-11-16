// Textos de «Reabrir camión» (16/11/2026). Puros, para testearlos sin la pantalla.

import type { PedidoConfirmacion } from '../../shared/confirmar';

/** La pregunta antes de reabrir: qué se deshace y qué hay que hacer después. */
export function pedidoReabrirCamion(patente: string, tiendas: number): PedidoConfirmacion {
  const n = tiendas === 1 ? '1 tienda' : `${tiendas} tiendas`;
  return {
    titulo: `¿Reabrir ${patente}?`,
    detalle:
      `Se anula su manifiesto y su QR (${n}). El camión vuelve a quedar abierto para mover carga, ` +
      'y deja de verse como cargado en Bodega y en el panel del conductor.\n\n' +
      'Si ya imprimiste el manifiesto, bótalo: al volver a cerrar sale uno nuevo, con otro QR.\n\n' +
      'Solo se puede si el camión no ha salido.',
    aceptar: `Reabrir ${patente}`,
    tono: 'aviso',
  };
}

/** Aviso cuando el servidor no deja reabrir (el camión salió, o falló algo). */
export function avisoNoReabierto(patente: string, motivo: string): string {
  return `No se reabrió ${patente}: ${motivo}`;
}
