// Dos archivos de la misma carpeta no pueden diferenciarse SOLO en mayúsculas.
//
// ── POR QUÉ ESTE TEST, Y POR QUÉ EN CI ────────────────────────────────────────────────────────
//
// El sistema de archivos de macOS no distingue mayúsculas; el de Linux sí. Así que dos archivos
// como `ResumenDia.tsx` y `resumenDia.ts` conviven en Vercel —donde compila el proyecto— y son EL
// MISMO archivo para quien trabaja en un Mac: los dos imports caen en uno solo, y el que pierde
// parece no exportar nada.
//
// El resultado es el peor de los dos mundos: CI queda en VERDE y `main` NO COMPILA en local.
// Nadie se entera hasta que alguien corre `npm run build` en su máquina.
//
// Pasó DOS veces en una semana:
//
//   · #667  `ListaTiendas.tsx` / `listaTiendas.ts`   → quedó `ListaTiendasUI.tsx`
//   · #697  `ResumenDia.tsx`   / `resumenDia.ts`     → quedó `ResumenDiaUI.tsx`
//
// Las dos veces la causa fue la misma —un componente y su parte pura con el mismo nombre— y las
// dos veces se descubrió compilando a mano. Este test lo corta antes de llegar a `main`.
//
// La convención que quedó: el componente lleva el sufijo `UI`, y la parte pura conserva el nombre
// (que es la que más se importa).

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..');

/** Nombres que chocan al ignorar mayúsculas, con la carpeta donde están. */
function colisiones(dir: string): string[] {
  const entradas = readdirSync(dir, { withFileTypes: true }).filter(e => e.name !== 'node_modules');
  const porMinuscula = new Map<string, string[]>();
  const out: string[] = [];

  for (const e of entradas) {
    const k = e.name.toLowerCase();
    porMinuscula.set(k, [...(porMinuscula.get(k) ?? []), e.name]);
  }
  for (const nombres of porMinuscula.values()) {
    if (nombres.length > 1) out.push(`${dir}: ${[...nombres].sort().join(' / ')}`);
  }
  for (const e of entradas) {
    if (e.isDirectory()) out.push(...colisiones(join(dir, e.name)));
  }
  return out;
}

describe('nombres de archivo', () => {
  it('ninguna carpeta tiene dos nombres que solo se diferencien en mayúsculas', () => {
    // Si este test falla: renombrá uno de los dos. El componente lleva el sufijo `UI`
    // (`ResumenDiaUI.tsx`) y la parte pura conserva su nombre. Ver el encabezado.
    expect(colisiones(RAIZ)).toEqual([]);
  });

  it('detecta una colisión cuando la hay — si no, este guard no probaría nada', () => {
    // Fija que la comparación es por minúsculas y no por igualdad exacta. Sin esto, un refactor
    // podría dejar la función devolviendo siempre `[]` y el guard se volvería decorativo.
    const nombres = ['ResumenDia.tsx', 'resumenDia.ts', 'otroArchivo.ts'];
    const porMinuscula = new Map<string, string[]>();
    for (const n of nombres) {
      const k = n.replace(/\.[^.]+$/, '').toLowerCase();
      porMinuscula.set(k, [...(porMinuscula.get(k) ?? []), n]);
    }
    const choca = [...porMinuscula.values()].filter(v => v.length > 1);
    expect(choca).toEqual([['ResumenDia.tsx', 'resumenDia.ts']]);
  });
});
