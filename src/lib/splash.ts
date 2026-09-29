/**
 * Tabla de pantallas de inicio (splash) de iOS.
 *
 * iOS no escala la splash: si la imagen no calza EXACTO con la resolución del dispositivo, muestra
 * una pantalla en blanco al abrir la app instalada. Por eso hay una entrada por modelo, y por eso
 * esta tabla tiene que ir a la par de `scripts/generar-splash.mjs` — el test de al lado verifica
 * que cada entrada tenga su PNG y que no sobre ninguno.
 */

/** `[anchoCSS, altoCSS, dpr]`. Los píxeles reales del archivo son CSS × dpr. */
type Pantalla = readonly [number, number, number];

/** iPhones: solo vertical. Nadie despacha con el teléfono acostado. */
const IPHONES: Pantalla[] = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 15/16 Plus · 14 Pro Max
  [393, 852, 3], // 15/16 · 14 Pro
  [390, 844, 3], // 13 · 14
  [428, 926, 3], // 12/13 Pro Max
  [375, 812, 3], // X · XS · 11 Pro · 13 mini
  [414, 896, 3], // XS Max · 11 Pro Max
  [414, 896, 2], // XR · 11
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // 8 · SE 2ª y 3ª
];

/** iPads: en bodega se usan apaisadas, así que llevan las dos orientaciones. */
const IPADS: Pantalla[] = [
  [1024, 1366, 2], // Pro 12.9"
  [834,  1194, 2], // Pro 11"
  [820,  1180, 2], // Air 10.9"
  [810,  1080, 2], // 10.2"
];

function entrada(ancho: number, alto: number, dpr: number, orientacion: 'portrait' | 'landscape') {
  const [px, py] = orientacion === 'portrait' ? [ancho * dpr, alto * dpr] : [alto * dpr, ancho * dpr];
  return {
    url: `/splash/splash-${px}x${py}.png`,
    media: `(device-width: ${ancho}px) and (device-height: ${alto}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientacion})`,
  };
}

/**
 * Las entradas para `metadata.appleWebApp.startupImage`.
 *
 * `device-width`/`device-height` van siempre en el orden vertical del aparato, incluso para la
 * entrada apaisada: Safari no los invierte al girar, lo único que cambia es `orientation`.
 */
export function pantallasDeInicio() {
  return [
    ...IPHONES.map(([a, l, d]) => entrada(a, l, d, 'portrait')),
    ...IPADS.flatMap(([a, l, d]) => [entrada(a, l, d, 'portrait'), entrada(a, l, d, 'landscape')]),
  ];
}
