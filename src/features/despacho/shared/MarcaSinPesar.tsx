'use client';

import { avisoSinPesar } from './avisoSinPesar';

/**
 * Marca de esquina en la tarjeta de la grilla: esta tienda tiene unidades guardadas SIN PESAR.
 *
 * Un solo componente para los dos espejos (Santiago y Regiones) a propósito: la tarjeta de tienda
 * ya divergió una vez entre los dos archivos —por eso existe `storeCardStyles.ts`— y una marca
 * copiada dos veces es exactamente la forma en que vuelve a pasar.
 *
 * Va en la esquina inferior izquierda, no en la superior: ahí se apoya `PresenciaBadge` con
 * `z-10`. El detalle de por qué, y por qué las otras dos esquinas tampoco sirven, está en
 * `avisoSinPesar.ts`.
 *
 * La tarjeta que la contiene tiene que ser `relative` (las dos lo son).
 */
export function MarcaSinPesar({ sinPesar }: { sinPesar?: number }) {
  const aviso = avisoSinPesar(sinPesar ?? 0);
  if (!aviso) return null;
  return (
    <span
      title={aviso.titulo}
      aria-label={aviso.titulo}
      // #C2410C y no un naranja más vivo: en blanco sobre este fondo el texto da ~5:1, y a 10 px
      // en negrita eso es el piso para que se lea en la tablet del CD. Mismo criterio de contraste
      // que ya aplica `storeCardStyles.ts` al resto de la tarjeta.
      className="absolute bottom-0 left-0 z-[5] flex items-center gap-[2px] h-[15px] pl-[5px] pr-[6px] bg-[#C2410C] text-white text-[10px] font-extrabold leading-none tabular-nums select-none pointer-events-none"
      style={{ borderRadius: '0 8px 0 11px' }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4" /><path d="M12 17h.01" />
      </svg>
      {aviso.texto}
    </span>
  );
}
