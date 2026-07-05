import { describe, it, expect } from 'vitest';
import { buildAsignacionUserPrompt, IA_SYSTEM_PROMPT } from '../promptBuilder';
import type { IAStore, IATruck, IAExample } from '../types';

const stores: IAStore[] = [
  { cod: '05LP', p: 2, b: 0, ch: 4, zona: 'Corredor RM' },
  { cod: '56PZA', p: 2, b: 1, ch: 6 },
];
const trucks: IATruck[] = [
  { patente: 'PTFZ21', tipo: 'Camión grande', capP: 10, capB: 20, refrigerado: true },
];
const examples: IAExample[] = [
  { fecha: '02/07/2026', asignacion: { PTFZ21: ['05LP', '21NUC'] } },
];

describe('buildAsignacionUserPrompt', () => {
  it('incluye ejemplos, camiones y tiendas de hoy', () => {
    const p = buildAsignacionUserPrompt({ stores, trucks, examples });
    expect(p).toContain('02/07/2026');
    expect(p).toContain('PTFZ21');
    expect(p).toContain('05LP');
    expect(p).toContain('56PZA');
    expect(p).toContain('10 pallets');    // capacidad
    expect(p).toContain('Camión grande'); // tipo del camión
    expect(p).toContain('frío');          // camión refrigerado
    expect(p).toContain('Corredor RM');   // zona de la tienda
  });

  it('sin historial muestra fallback', () => {
    const p = buildAsignacionUserPrompt({ stores, trucks, examples: [] });
    expect(p).toContain('sin historial');
  });

  it('el system pide JSON puro', () => {
    expect(IA_SYSTEM_PROMPT).toContain('JSON');
    expect(IA_SYSTEM_PROMPT.toLowerCase()).toContain('capacidad');
  });
});
