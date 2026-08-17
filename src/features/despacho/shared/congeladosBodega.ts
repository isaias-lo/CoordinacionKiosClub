/**
 * Detecta si un `contenido` de picking (picking_pallets.contenido) corresponde a un
 * movimiento de Abastecimiento Congelados. Las bodegas SECO (Nacional y RM/Costa) NO
 * deben ver ni contar estos movimientos — son responsabilidad exclusiva del módulo
 * CONGELADOS.
 *
 * Función pura: sin acceso a red/BD, solo compara el string recibido.
 */
export function esCongeladoContenido(contenido: string | null | undefined): boolean {
  return (contenido ?? '').toLowerCase().includes('congelado');
}
