'use client';

import { BodegaTabs } from './BodegaTabs';

/**
 * Header unificado del módulo BODEGA. Antes mostraba un banner navy ("BODEGA" + usuario·fecha)
 * sobre los tabs; se eliminó para recuperar espacio útil hacia arriba (las 3 pantallas ganan
 * alto). Queda solo la barra de tabs (Nacional / RM-Costa / Actividad); el REGISTRAR / contador
 * que iba en el slot `right` se movió al pie de cada pantalla.
 */
export function BodegaHeader() {
  return <BodegaTabs />;
}
