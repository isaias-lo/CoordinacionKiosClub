import { describe, it, expect } from 'vitest';
import { usaSelectorDeTiendas, elegidasFueraDeLista, seleccionVencida } from '../selectorTiendas';

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

describe('elegidasFueraDeLista', () => {
  const lista = [{ cod: '01TPS' }, { cod: '16PQA' }];

  it('una elegida que no está en la lista de hoy queda a la vista para quitarla (caso 59EGN)', () => {
    expect(elegidasFueraDeLista(['01TPS', '59EGN'], lista)).toEqual(['59EGN']);
  });

  it('si todas están en la lista no sobra ninguna', () => {
    expect(elegidasFueraDeLista(['16PQA', '01TPS'], lista)).toEqual([]);
  });

  it('con la lista vacía (calendario sin cargar) todas quedan fuera, y en el orden elegido', () => {
    expect(elegidasFueraDeLista(['59EGN', '01TPS'], [])).toEqual(['59EGN', '01TPS']);
  });
});

describe('seleccionVencida', () => {
  it('las tiendas elegidas ayer se sueltan hoy', () => {
    expect(seleccionVencida('2026-10-13', '2026-10-14', 3)).toBe(true);
  });

  it('el mismo día no se toca nada', () => {
    expect(seleccionVencida('2026-10-14', '2026-10-14', 3)).toBe(false);
  });

  it('sin tiendas elegidas no hay nada que soltar', () => {
    expect(seleccionVencida('2026-10-13', '2026-10-14', 0)).toBe(false);
  });
});
