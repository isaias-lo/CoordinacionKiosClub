import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pantallasDeInicio } from '../splash';

const DIR = join(process.cwd(), 'public', 'splash');

describe('pantallas de inicio de iOS', () => {
  const entradas = pantallasDeInicio();

  // Si una entrada apunta a un archivo que no existe, iOS abre la app con una pantalla en blanco
  // y nadie se entera hasta que un jefe de local lo reporta.
  it('cada entrada tiene su PNG generado', () => {
    const faltantes = entradas.filter(e => !existsSync(join(DIR, e.url.replace('/splash/', ''))));
    expect(faltantes.map(f => f.url)).toEqual([]);
  });

  it('no sobra ningún PNG sin entrada', () => {
    const usados = new Set(entradas.map(e => e.url.replace('/splash/', '')));
    const sobrantes = readdirSync(DIR).filter(f => f.endsWith('.png') && !usados.has(f));
    expect(sobrantes).toEqual([]);
  });

  it('el nombre del archivo son los píxeles reales, no los CSS', () => {
    const iphone16ProMax = entradas.find(e => e.media.includes('device-width: 440px'));
    expect(iphone16ProMax?.url).toBe('/splash/splash-1320x2868.png');
  });

  // Dos aparatos distintos con el mismo tamaño CSS (XR y XS Max, ambos 414×896) solo se distinguen
  // por el dpr; si se perdiera esa parte de la consulta, uno de los dos se quedaría en blanco.
  it('ninguna consulta de medios se repite', () => {
    const medios = entradas.map(e => e.media);
    expect(new Set(medios).size).toBe(medios.length);
  });

  it('las iPad traen vertical y apaisada', () => {
    const iPadPro = entradas.filter(e => e.media.includes('device-width: 1024px'));
    expect(iPadPro.map(e => e.url)).toEqual([
      '/splash/splash-2048x2732.png',
      '/splash/splash-2732x2048.png',
    ]);
  });
});
