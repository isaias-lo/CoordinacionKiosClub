'use client';

import { useAuth } from '@/components/AuthProvider';
import type { TerminadaInfo } from './useTiendaTerminada';

/**
 * Botón/badge "Tienda Terminada" — marcador manual, NO bloquea edición (fase 1, ver
 * useTiendaTerminada.ts). Mismo lenguaje visual que el "✓ Completado" del pie de Resumen
 * (verde relleno = hecho, toca para deshacer).
 */
export function TiendaTerminadaButton({ cod, info, onToggle, itemCount }: {
  cod: string;
  info?: TerminadaInfo;
  onToggle: (cod: string, terminada: boolean, por?: string) => void;
  /** [Guardia 2026-09-09] Cantidad de ítems agregados a esta tienda hoy. Sin esto se podía marcar
   *  "Terminada" con un solo clic, sin confirmar y sin aviso — incluso en una tienda vacía. En el
   *  Enrutador eso habilita la tienda para asignar a un camión, así que un clic accidental (o
   *  marcar antes de que Bodega termine de cargar) es exactamente el error que la función entera
   *  existe para evitar. */
  itemCount?: number;
}) {
  const { profile } = useAuth();
  const terminada = info?.terminada === true;

  const handleClick = () => {
    if (terminada) {
      if (!confirm('¿Reabrir esta tienda? Ya no se mostrará como lista para despachar.')) return;
      onToggle(cod, false);
    } else {
      const msg = itemCount === 0
        ? '⚠ Esta tienda no tiene ningún ítem agregado.\n\n¿Marcarla "Terminada" igual? En el Enrutador va a quedar habilitada para asignarse a un camión.'
        : '¿Marcar esta tienda como "Terminada"?\n\nEn el Enrutador va a poder asignarse a un camión — solo hazlo si ya no le vas a agregar más carga.';
      if (!confirm(msg)) return;
      onToggle(cod, true, profile?.full_name ?? undefined);
    }
  };

  return (
    <button
      onClick={handleClick}
      title={terminada && info?.por ? `Terminada por ${info.por}` : 'Marcar esta tienda como terminada'}
      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-wide cursor-pointer border transition-all active:scale-95 flex-shrink-0 ${
        terminada
          ? 'bg-[#16A34A] text-white border-transparent'
          : 'bg-white/10 text-white/80 border-white/20'
      }`}
    >
      {terminada ? '✓ Terminada' : 'Marcar terminada'}
    </button>
  );
}
