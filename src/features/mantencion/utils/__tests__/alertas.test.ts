import { describe, it, expect } from 'vitest';
import { alertasDeTienda, nivelDeTienda, UMBRALES_POR_DEFECTO } from '../alertas';
import type { EstadoTienda } from '../alertas';

const tienda = (p: Partial<EstadoTienda> = {}): EstadoTienda => ({
  sinProgramar: 0, abiertas: 0, urgentes: 0, diasMasAntigua: 0, esperaMaterial: false, ...p,
});
const tipos = (t: EstadoTienda) => alertasDeTienda(t).map(a => a.tipo);

describe('alertasDeTienda · el límite exacto', () => {
  it('cinco sin programar NO alerta y seis sí', () => {
    expect(tipos(tienda({ sinProgramar: 5, abiertas: 5 }))).not.toContain('sin_programar');
    expect(tipos(tienda({ sinProgramar: 6, abiertas: 6 }))).toContain('sin_programar');
  });

  it('cinco abiertas NO alerta y seis sí', () => {
    expect(tipos(tienda({ abiertas: 5 }))).not.toContain('volumen_total');
    expect(tipos(tienda({ abiertas: 6 }))).toContain('volumen_total');
  });

  it('siete días NO alerta y ocho sí', () => {
    expect(tipos(tienda({ diasMasAntigua: 7 }))).not.toContain('antiguedad');
    expect(tipos(tienda({ diasMasAntigua: 8 }))).toContain('antiguedad');
  });
});

describe('alertasDeTienda · qué aplica', () => {
  it('una tienda tranquila no devuelve nada, ni un «todo bien»', () => {
    expect(alertasDeTienda(tienda())).toEqual([]);
    expect(nivelDeTienda(tienda())).toBeNull();
  });

  it('una sola urgencia ya es roja, sin importar el volumen', () => {
    expect(alertasDeTienda(tienda({ urgentes: 1, abiertas: 1 })))
      .toEqual([{ tipo: 'urgencia', nivel: 'roja', valor: 1 }]);
    expect(nivelDeTienda(tienda({ urgentes: 1, abiertas: 1 }))).toBe('roja');
  });

  it('esperar material es ámbar, no rojo: ya está visto', () => {
    expect(alertasDeTienda(tienda({ esperaMaterial: true })))
      .toEqual([{ tipo: 'espera_material', nivel: 'ambar', valor: 1 }]);
    expect(nivelDeTienda(tienda({ esperaMaterial: true }))).toBe('ambar');
  });

  it('las rojas van primero', () => {
    const t = tienda({ sinProgramar: 9, abiertas: 12, urgentes: 2, diasMasAntigua: 20 });
    const a = alertasDeTienda(t);
    expect(a.map(x => x.nivel)).toEqual(['roja', 'roja', 'ambar', 'ambar']);
    expect(a.map(x => x.tipo))
      .toEqual(['sin_programar', 'urgencia', 'volumen_total', 'antiguedad']);
  });

  it('cada alerta trae el número que la disparó', () => {
    const a = alertasDeTienda(tienda({ sinProgramar: 9, abiertas: 12, diasMasAntigua: 20 }));
    expect(a.find(x => x.tipo === 'sin_programar')?.valor).toBe(9);
    expect(a.find(x => x.tipo === 'volumen_total')?.valor).toBe(12);
    expect(a.find(x => x.tipo === 'antiguedad')?.valor).toBe(20);
  });

  it('los umbrales salen de la configuración', () => {
    const t = tienda({ sinProgramar: 6, abiertas: 6 });
    expect(tipos(t)).toContain('sin_programar');
    expect(alertasDeTienda(t, { ...UMBRALES_POR_DEFECTO, umbralSinProgramar: 10, umbralTotal: 10 }))
      .toEqual([]);
  });

  it('un umbral en cero alerta con una sola, que es lo que significa', () => {
    expect(tipos(tienda({ abiertas: 1 })).length).toBe(0);
    expect(alertasDeTienda(tienda({ abiertas: 1 }), { ...UMBRALES_POR_DEFECTO, umbralTotal: 0 })
      .map(a => a.tipo)).toEqual(['volumen_total']);
  });

  it('valores negativos o basura se tratan como cero', () => {
    expect(alertasDeTienda(tienda({ sinProgramar: -4, abiertas: NaN }))).toEqual([]);
  });
});
