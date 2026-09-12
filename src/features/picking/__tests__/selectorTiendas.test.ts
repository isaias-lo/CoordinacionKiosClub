import { describe, it, expect } from 'vitest';
import { usaSelectorDeTiendas } from '../selectorTiendas';

describe('usaSelectorDeTiendas', () => {
  it('Seco y Congelados trabajan sobre las tiendas elegidas', () => {
    expect(usaSelectorDeTiendas('monitoreo')).toBe(true);
    expect(usaSelectorDeTiendas('congelados')).toBe(true);
  });

  it('las demás no dependen de la selección', () => {
    for (const tab of ['calendario', 'estadisticas', 'actividad', 'historial', 'configuracion']) {
      expect(usaSelectorDeTiendas(tab)).toBe(false);
    }
  });

  it('una pestaña desconocida no abre el panel por las dudas', () => {
    expect(usaSelectorDeTiendas('')).toBe(false);
    expect(usaSelectorDeTiendas('inventada')).toBe(false);
  });
});
