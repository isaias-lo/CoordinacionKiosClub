'use client';

import { BodegaHeader } from '../features/despacho/shared/BodegaHeader';
import { CongeladosPage } from '../features/despacho/congelados/pages/CongeladosPage';

/**
 * Shell del módulo CONGELADOS — espeja AppScreen/SantiagoScreen (BodegaHeader + pantalla).
 * `zona` decide qué grupo del Calendario de Congelados y qué catálogo de tiendas usar:
 * 'nacional' → Regiones ('fal') · 'rmcosta' → RM + Costa.
 *
 * PR read-only (2C-3b-i): solo grilla de tiendas/cajas. El detalle CC/CN y el botón
 * "Registrar" llegan en el PR siguiente.
 */
export function CongeladosScreen({ zona }: { zona: 'nacional' | 'rmcosta' }) {
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      <BodegaHeader />

      <div className="flex-1 overflow-hidden flex flex-col">
        <CongeladosPage zona={zona} />
      </div>
    </div>
  );
}
