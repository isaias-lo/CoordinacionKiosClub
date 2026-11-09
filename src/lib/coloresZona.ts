// Los cinco colores de zona, en UN solo lugar.
//
// ── POR QUÉ ESTE ARCHIVO EXISTE ───────────────────────────────────────────────────────────────
//
// Estaban escritos tres veces: en la planilla de Picking, en el calendario impreso y en lo que se
// escribe al Google Sheet. Tres copias de la misma tabla, y el 06/11/2026 se comprobó lo que eso
// siempre termina provocando: **dos de ellas tenían el norte y el sur al revés.**
//
//     zonaPlanilla.ts        norte amarillo · sur celeste
//     CalendarioColumnas     norte amarillo · sur celeste
//     calendario-write       norte CELESTE  · sur AMARILLO   ← al revés
//
// La misma tienda salía de un color en el papel y de otro en la planilla de cálculo. Y la quinta
// zona ni siquiera coincidía: `rm` era gris «Stripcenter» en dos lados y verde «Flota Luis regular
// RM» en el tercero, siendo —comprobado contra las reglas de clasificación— **el mismo conjunto de
// tiendas**: las de la RM que no son mall.
//
// Repintar las tres copias habría dejado la puerta abierta a que se separen de nuevo. Por eso el
// arreglo no es pintar: es que haya una sola tabla y que las tres la importen.
//
// ── POR QUÉ EL SHEET LLEVA OTRO VALOR ─────────────────────────────────────────────────────────
//
// En pantalla las pastillas tienen borde y viven sobre una tarjeta; en una planilla de cálculo no
// hay ni borde ni tarjeta, y un relleno casi blanco sobre fondo blanco no se ve. Por eso cada zona
// tiene dos rellenos: el de pantalla y uno algo más cargado para las celdas del Sheet. Es el mismo
// tono, no otro color — lo que cambia es cuánto hay que cargarlo para que se note sobre blanco.
//
// ── DE DÓNDE SALE ESTA PALETA ─────────────────────────────────────────────────────────────────
//
// Los colores viejos eran pasteles al ~85% de saturación, con el borde MÁS CLARO que el relleno:
// el bloque flotaba y competía con los números, que son lo que se viene a leer. Esta paleta baja
// la saturación a ~18% y mueve el peso al borde y al texto, que es de donde los sistemas de
// escritorio sacan la jerarquía. El tono de cada zona se conserva —el amarillo sigue siendo
// amarillo— así que nadie tiene que reaprender qué color es cada ruta.

export type ZonaPlanilla = 'norte' | 'sur' | 'costa' | 'mall' | 'rm';

export interface ColorZona {
  /** Relleno en pantalla. */
  bg: string;
  /** Texto. Oscuro, para que el código de tienda se lea sobre el relleno. */
  text: string;
  /** Borde. Más OSCURO que el relleno: define en vez de brillar. */
  border: string;
  label: string;
  /** Relleno para las celdas del Google Sheet: mismo tono, algo más cargado. */
  sheet: string;
}

/**
 * La tabla única. El orden de las claves no importa; el de la leyenda lo fija `ZONAS`.
 *
 * `rm` es «Stripcenter»: la RM que no es mall. En `calendario-write` se llamaba «Flota Luis
 * regular RM» y era verde, pero es el mismo conjunto de tiendas, así que ahora comparte color y
 * nombre con el resto del sistema.
 */
export const COLOR_ZONA: Record<ZonaPlanilla, ColorZona> = {
  norte: { bg: '#F3EDDC', text: '#5B4719', border: '#A8853C', label: 'Ruta Norte',  sheet: '#EDE2C4' },
  sur:   { bg: '#DFE9F5', text: '#1C3A57', border: '#36689B', label: 'Ruta Sur',    sheet: '#D2E1F2' },
  costa: { bg: '#DDEAE7', text: '#1B453F', border: '#3C7A70', label: 'Costa',       sheet: '#CBE0DB' },
  mall:  { bg: '#F0E4E6', text: '#53262E', border: '#94525F', label: 'Mall RM',     sheet: '#E8D4D8' },
  rm:    { bg: '#EBEDF0', text: '#353B45', border: '#848B97', label: 'Stripcenter', sheet: '#E0E3E8' },
};

/** El orden en que se muestra la leyenda: de la ruta más lejana a la más cercana. */
export const ZONAS: ZonaPlanilla[] = ['norte', 'sur', 'costa', 'mall', 'rm'];

/** `#RRGGBB` → el color que pide la API de Sheets (componentes de 0 a 1). */
export function aColorSheets(hex: string): { red: number; green: number; blue: number } {
  return {
    red:   parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue:  parseInt(hex.slice(5, 7), 16) / 255,
  };
}
