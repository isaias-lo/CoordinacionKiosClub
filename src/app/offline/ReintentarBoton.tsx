'use client';

import { RefreshCw } from 'lucide-react';

/**
 * Único trozo interactivo de la página de sin conexión: recargar para ver si ya volvió la señal.
 * Va aparte para que la página en sí siga siendo estática y se pueda guardar en el caché.
 */
export function ReintentarBoton() {
  return (
    <button
      onClick={() => { window.location.reload(); }}
      className="text-[15px] font-bold px-5 py-2.5 rounded-xl cursor-pointer transition-all active:scale-95 inline-flex items-center gap-2"
      style={{ background: '#fff', color: '#1A2550' }}
    >
      <RefreshCw size={15} /> Reintentar
    </button>
  );
}
