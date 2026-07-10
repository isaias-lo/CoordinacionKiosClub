import React from 'react';

// Estrella de 5 puntas centrada en (cx, cy) con radio exterior R, en el viewBox del logo (1000×451).
function starPoints(cx: number, cy: number, R: number): string {
  const r = R * 0.42;
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + rad * Math.cos(ang)).toFixed(1)},${(cy + rad * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// Las 5 estrellas van en la banda inferior del logo (el webp es 1000×451; la banda ocupa
// ~bottom 25%). Coordenadas en el mismo viewBox que la imagen → alineadas a cualquier tamaño.
const STAR_CX = [296, 418, 540, 662, 784]; // centros calibrados contra las 5 estrellas del webp
const STAR_CY = 393;
const STAR_R  = 31;

interface Props {
  className?: string;
  style?: React.CSSProperties;
  /** Color de las estrellas (por defecto azul navy, "como el fondo"). */
  starColor?: string;
  alt?: string;
}

/**
 * Logo KIOSClub en blanco (para fondos oscuros, vía filtro) con las 5 estrellas de la banda
 * dibujadas en AZUL como overlay SVG. El filtro `brightness(0) invert(1)` vuelve toda la banda
 * blanca y borra las estrellas originales; este overlay las repone en azul, visibles sobre el
 * blanco. El SVG comparte viewBox con el webp, así que escalan y quedan alineadas siempre.
 */
export function KiosLogo({ className, style, starColor = '#1A2550', alt = 'KIOS Club — American Supermarket' }: Props) {
  return (
    <div className={className} style={{ position: 'relative', display: 'inline-block', lineHeight: 0, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-kiosclub.webp"
        alt={alt}
        style={{ display: 'block', width: '100%', height: 'auto', filter: 'brightness(0) invert(1)' }}
      />
      <svg
        viewBox="0 0 1000 451"
        preserveAspectRatio="xMidYMid meet"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        {STAR_CX.map(cx => (
          <polygon key={cx} points={starPoints(cx, STAR_CY, STAR_R)} fill={starColor} />
        ))}
      </svg>
    </div>
  );
}
