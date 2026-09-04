'use client';

import { useAuth } from '@/components/AuthProvider';
import type { TerminadaInfo } from './useTiendaTerminada';

/**
 * Botón/badge "Tienda Terminada" — marcador manual, NO bloquea edición (fase 1, ver
 * useTiendaTerminada.ts). Mismo lenguaje visual que el "✓ Completado" del pie de Resumen
 * (verde relleno = hecho, toca para deshacer).
 */
export function TiendaTerminadaButton({ cod, info, onToggle }: {
  cod: string;
  info?: TerminadaInfo;
  onToggle: (cod: string, terminada: boolean, por?: string) => void;
}) {
  const { profile } = useAuth();
  const terminada = info?.terminada === true;

  const handleClick = () => {
    if (terminada) {
      if (!confirm('¿Reabrir esta tienda? Ya no se mostrará como lista para despachar.')) return;
      onToggle(cod, false);
    } else {
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
