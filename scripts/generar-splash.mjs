/**
 * Genera las pantallas de inicio (splash) de iOS a partir de public/logo-kiosclub.webp.
 *
 *   npm run splash
 *
 * `sharp` no está en package.json: viene con Next. Si algún día Next deja de traerlo, instalarlo
 * a mano (`npm i -D sharp`) antes de correr esto; no vale la pena agregarlo como dependencia fija
 * para un script que se usa una vez por cambio de logo.
 *
 * Existe como script y no como un puñado de PNGs sueltos porque iOS exige que la imagen calce
 * EXACTO con la resolución del dispositivo: si no calza, muestra una pantalla en blanco. Así que
 * cada modelo nuevo es una entrada más en la tabla de abajo, y el día que cambie el logo hay que
 * rehacerlas todas. La tabla de src/lib/splash.ts tiene que quedar igual a esta: el test
 * src/lib/__tests__/splash.test.ts falla si se desincronizan.
 *
 * El fondo es blanco a propósito: es el `background_color` del manifest (src/app/manifest.ts), así
 * que entre la splash y la app no hay un salto de color.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const LOGO    = 'public/logo-kiosclub.webp';
const SALIDA  = 'public/splash';
const FONDO   = { r: 255, g: 255, b: 255, alpha: 1 };

/** [ancho, alto] en píxeles reales (CSS × dpr). Portrait; el landscape se deriva invirtiéndolos. */
const PANTALLAS = [
  // iPhone
  [1320, 2868], // 16 Pro Max
  [1206, 2622], // 16 Pro
  [1290, 2796], // 15/16 Plus · 14 Pro Max
  [1179, 2556], // 15/16 · 14 Pro
  [1170, 2532], // 13 · 14
  [1284, 2778], // 12/13 Pro Max
  [1125, 2436], // X · XS · 11 Pro · 13 mini
  [1242, 2688], // XS Max · 11 Pro Max
  [828,  1792], // XR · 11
  [1242, 2208], // 8 Plus
  [750,  1334], // 8 · SE 2ª y 3ª
  // iPad — en bodega se usan apaisadas, así que de estas se generan las dos orientaciones
  [2048, 2732], // Pro 12.9"
  [1668, 2388], // Pro 11"
  [1640, 2360], // Air 10.9"
  [1620, 2160], // 10.2"
];
/** Desde cuál de la lista en adelante son iPad (llevan también landscape). */
const PRIMER_IPAD = 11;

async function generar(ancho, alto) {
  // El logo ocupa el 55% del lado corto. Suficiente para leerse en un iPhone SE sin que en un iPad
  // apaisado quede una marca gigante ocupando media pantalla.
  const anchoLogo = Math.round(Math.min(ancho, alto) * 0.55);
  const logo = await sharp(LOGO).resize({ width: anchoLogo }).toBuffer();
  const { height: altoLogo } = await sharp(logo).metadata();

  await sharp({ create: { width: ancho, height: alto, channels: 4, background: FONDO } })
    .composite([{
      input: logo,
      left: Math.round((ancho - anchoLogo) / 2),
      top:  Math.round((alto - altoLogo) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toFile(`${SALIDA}/splash-${ancho}x${alto}.png`);
}

await mkdir(SALIDA, { recursive: true });
let n = 0;
for (const [i, [ancho, alto]] of PANTALLAS.entries()) {
  await generar(ancho, alto);
  n++;
  if (i >= PRIMER_IPAD) { await generar(alto, ancho); n++; }
}
console.log(`${n} pantallas de inicio en ${SALIDA}/`);
