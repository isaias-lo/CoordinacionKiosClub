'use client';

import { useAuth } from '@/components/AuthProvider';
import type { TerminadaInfo } from './useTiendaTerminada';
import type { ViendoInfo } from './usePresenciaTienda';

/**
 * Botón/badge "Tienda Terminada" — marcador manual, NO bloquea edición (fase 1, ver
 * useTiendaTerminada.ts). Mismo lenguaje visual que el "✓ Completado" del pie de Resumen
 * (verde relleno = hecho, toca para deshacer).
 */
export function TiendaTerminadaButton({ cod, info, onToggle, itemCount, sinPesarCount, sinGuardar, viendo }: {
  cod: string;
  info?: TerminadaInfo;
  onToggle: (cod: string, terminada: boolean, por?: string) => void;
  /** [Guardia 2026-09-09] Cantidad de ítems agregados a esta tienda hoy. Sin esto se podía marcar
   *  "Terminada" con un solo clic, sin confirmar y sin aviso — incluso en una tienda vacía. En el
   *  Enrutador eso habilita la tienda para asignar a un camión, así que un clic accidental (o
   *  marcar antes de que Bodega termine de cargar) es exactamente el error que la función entera
   *  existe para evitar. */
  itemCount?: number;
  /** Cuántos de esos ítems quedaron "sin pesar" (peso 0) — pedido 2026-09-09: "Persona A termina
   *  su parte y marca terminada, Persona B todavía estaba agregando un pallet. La tienda queda
   *  cerrada con datos incompletos." Si hay ítems sin pesar, se avisa antes de cerrar. */
  sinPesarCount?: number;
  /** Unidades que Picking ya etiquetó y que Bodega NO guardó — tarjetas "sin guardar" que quedaron
   *  ahí. No entran en el conteo que leen el Manual y el Enrutador, así que esa carga no existe
   *  para el camión (2026-09-11: 13PIE salió con 3 bultos así, 22LGN con 2). Ver
   *  `avisoSinGuardar` en sinGuardarEnBodega.ts. */
  sinGuardar?: string | null;
  /** [Presencia] Quién más tiene esta tienda abierta ahora — si alguien la está viendo, puede
   *  estar a mitad de agregar algo que todavía no se guardó. */
  viendo?: ViendoInfo[];
}) {
  const { profile } = useAuth();
  const terminada = info?.terminada === true;

  const handleClick = () => {
    if (terminada) {
      if (!confirm('¿Reabrir esta tienda? Ya no se mostrará como lista para despachar.')) return;
      onToggle(cod, false);
    } else {
      const avisos: string[] = [];
      if (itemCount === 0) avisos.push('⚠ Esta tienda no tiene ningún ítem agregado.');
      if (sinPesarCount) avisos.push(`⚠ ${sinPesarCount} ítem${sinPesarCount > 1 ? 's' : ''} quedó${sinPesarCount > 1 ? 'n' : ''} "sin pesar" (peso en 0).`);
      if (sinGuardar) avisos.push(sinGuardar);
      if (viendo?.length) avisos.push(`⚠ ${viendo.map(v => v.name).join(', ')} ${viendo.length > 1 ? 'están viendo' : 'está viendo'} esta tienda ahora — puede estar a mitad de agregar algo.`);
      const msg = (avisos.length ? avisos.join('\n') + '\n\n' : '')
        + '¿Marcar esta tienda como "Terminada"?\n\nEn el Enrutador va a poder asignarse a un camión — solo hazlo si ya no le vas a agregar más carga.';
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
