// Trinquete de la escala de letra y la paleta de Bodega.
//
// Bodega llegó a tener 20 tamaños de letra escritos a mano (`text-[11px]`, `fontSize: 9`…) y 73
// colores hex sueltos. La escala con nombre (`text-rotulo`, `text-cuerpo`…) y la paleta (`est-*`,
// `uni-*`) viven en `tailwind.config.js` e `index.css`; las pantallas se van pasando de a una.
//
// Este test no exige que todo esté migrado: exige que NO EMPEORE. Cuenta lo suelto que queda y
// falla si sube. Cuando una migración lo baja, se baja el tope en el mismo PR — así el piso nuevo
// queda fijado y nadie lo deshace sin darse cuenta.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..');           // src/features/despacho
const CARPETAS = ['regiones', 'santiago', 'congelados', 'shared', 'actividad'];

function archivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === '__tests__' ? [] : archivosTsx(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

const fuente = CARPETAS.flatMap(c => archivosTsx(join(RAIZ, c))).map(f => readFileSync(f, 'utf8')).join('\n');
const contar = (re: RegExp) => (fuente.match(re) ?? []).length;

/** Topes de hoy. Solo pueden bajar. */
const TOPE = {
  // Bajan 408/181/452 → 397/175/436: la línea de fechas de Bodega pasó a `FechasBodega`, con
  // las clases de la escala en vez de estilos sueltos.
  tamanosSueltos: 397,   // text-[Npx] + fontSize numérico
  menoresA12:     175,   // los de 9 a 11,5 px: no se leen en una handheld
  // Baja de 453: la etiqueta de Picking pasó a nombrar sus dos tintas (`TINTA` y `ACENTO` en
  // `BarcodeCard`) en vez de repetir el hex en cada regla. Se fija el piso nuevo, como pide el
  // encabezado de este archivo.
  hexSueltos:     436,
};

describe('escala y paleta de Bodega', () => {
  it('no suma tamaños de letra escritos a mano', () => {
    const n = contar(/text-\[\d+(?:\.\d+)?px\]/g) + contar(/fontSize:\s*['"]?\d/g);
    expect(n).toBeLessThanOrEqual(TOPE.tamanosSueltos);
  });

  it('no suma letra bajo 12 px', () => {
    const n = contar(/text-\[(?:9|10|11|11\.5)px\]/g) + contar(/fontSize:\s*['"]?(?:9|10|11)\b/g);
    expect(n).toBeLessThanOrEqual(TOPE.menoresA12);
  });

  it('no suma colores hex sueltos', () => {
    expect(contar(/#[0-9A-Fa-f]{6}\b/g)).toBeLessThanOrEqual(TOPE.hexSueltos);
  });
});
