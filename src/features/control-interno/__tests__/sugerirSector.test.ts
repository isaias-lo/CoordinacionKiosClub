import { describe, it, expect } from 'vitest';
import { sugerirSector, type TiendaConSector } from '../sugerirSector';

// Catálogo con coordenadas REALES del oriente de Santiago.
const ORIENTE: TiendaConSector[] = [
  { codigo: '11ILC', nombre: 'Isabel la Católica', sector_comuna: 'Corredor Oriente', lat: -33.4165, lon: -70.5760, activo: true },
  { codigo: '52MUT', nombre: 'El MUT',             sector_comuna: 'Corredor Oriente', lat: -33.4045, lon: -70.5745, activo: true },
  { codigo: '45EST', nombre: 'Estoril',            sector_comuna: 'Corredor Oriente', lat: -33.3810, lon: -70.5330, activo: true },
  { codigo: '17MAI', nombre: 'Maipú',              sector_comuna: 'Corredor Poniente', lat: -33.5100, lon: -70.7570, activo: true },
];

// Plaza Egaña (59EGN): el caso real que quedó sin sector al crearse.
const EGANA = { lat: -33.452222, lon: -70.569481 };

describe('sugerirSector · fuera de la RM la región manda', () => {
  it('Valparaíso es Costa: sale del CD en camión propio', () => {
    const r = sugerirSector({ lat: -33.0245, lon: -71.5518 }, 'Valparaíso', ORIENTE);
    expect(r).toMatchObject({ sector: 'Costa', confianza: 'alta' });
  });

  it('al sur del CD es Región Sur', () => {
    const r = sugerirSector({ lat: -38.748274, lon: -72.645941 }, 'Araucanía', ORIENTE);   // 60PBL
    expect(r).toMatchObject({ sector: 'Región Sur', confianza: 'alta' });
  });

  it('al norte del CD es Región Norte', () => {
    const r = sugerirSector({ lat: -23.667609, lon: -70.4 }, 'Antofagasta', ORIENTE);      // 41ANA
    expect(r).toMatchObject({ sector: 'Región Norte', confianza: 'alta' });
  });
});

describe('sugerirSector · dentro de la RM deciden las vecinas', () => {
  // El corredor es una partición propia: ninguna fuente externa lo conoce.
  it('propone el corredor de las tres más cercanas, y dice cuáles son', () => {
    const r = sugerirSector(EGANA, 'RM', ORIENTE);
    expect(r.sector).toBe('Corredor Oriente');
    expect(r.confianza).toBe('media');
    expect(r.motivo).toContain('11ILC');
    expect(r.vecinas).toHaveLength(3);
  });

  it('las vecinas vienen ordenadas por cercanía', () => {
    const kms = sugerirSector(EGANA, 'RM', ORIENTE).vecinas.map(v => v.km);
    expect(kms).toEqual([...kms].sort((a, b) => a - b));
  });

  // Si no hay acuerdo se dice cuántas apoyan, en vez de presentarlo como unánime.
  it('cuando las vecinas no coinciden, lo transparenta', () => {
    const mixto: TiendaConSector[] = [
      { codigo: 'A', sector_comuna: 'Corredor Oriente',  lat: -33.4530, lon: -70.5700, activo: true },
      { codigo: 'B', sector_comuna: 'Corredor Sur',      lat: -33.4540, lon: -70.5710, activo: true },
      { codigo: 'C', sector_comuna: 'Corredor Poniente', lat: -33.4550, lon: -70.5720, activo: true },
    ];
    const r = sugerirSector(EGANA, 'RM', mixto);
    expect(r.motivo).toContain('1 de las 3');
    expect(r.sector).toBe('Corredor Oriente');   // empate → gana la más cercana
  });

  it('ignora tiendas sin sector válido o sin coordenadas', () => {
    const sucio: TiendaConSector[] = [
      { codigo: 'X', sector_comuna: '',                 lat: -33.4522, lon: -70.5694, activo: true },
      { codigo: 'Y', sector_comuna: 'Corredor Oriente', lat: null,     lon: null,     activo: true },
      ...ORIENTE,
    ];
    const r = sugerirSector(EGANA, 'RM', sucio);
    expect(r.vecinas.map(v => v.codigo)).not.toContain('X');
    expect(r.vecinas.map(v => v.codigo)).not.toContain('Y');
  });

  it('ignora las inactivas', () => {
    const r = sugerirSector(EGANA, 'RM', ORIENTE.map(t => ({ ...t, activo: false })));
    expect(r.sector).toBeNull();
  });
});

describe('sugerirSector · cuando no se puede, lo dice', () => {
  it('sin coordenadas no propone nada', () => {
    const r = sugerirSector({ lat: null, lon: null }, 'RM', ORIENTE);
    expect(r).toMatchObject({ sector: null, confianza: 'ninguna' });
  });

  it('sin catálogo para comparar no propone nada', () => {
    const r = sugerirSector(EGANA, 'RM', []);
    expect(r.sector).toBeNull();
    expect(r.motivo).toContain('No hay tiendas');
  });

  // Solo valores de la lista cerrada: un sector inventado cambia la tienda de camión.
  it('nunca propone un sector fuera de la lista cerrada', () => {
    const inventado: TiendaConSector[] = [{ codigo: 'Z', sector_comuna: 'Corredor Marte', lat: -33.4522, lon: -70.5694, activo: true }];
    expect(sugerirSector(EGANA, 'RM', inventado).sector).toBeNull();
  });
});
