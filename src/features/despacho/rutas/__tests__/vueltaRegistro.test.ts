import { describe, it, expect } from 'vitest';
import {
  tablaDeGrupo, splitRoutingPorTabla, buildControlRows,
  type RoutingUpdate, type RutaControl, type PendienteControl,
} from '../utils/vueltaRegistro';

describe('tablaDeGrupo', () => {
  it('Regiones (fal) → despacho_regiones; RM/Costa → despacho_rm', () => {
    expect(tablaDeGrupo('fal')).toBe('despacho_regiones');
    expect(tablaDeGrupo('rm')).toBe('despacho_rm');
    expect(tablaDeGrupo('costa')).toBe('despacho_rm');
    expect(tablaDeGrupo(undefined)).toBe('despacho_rm'); // desconocido → RM
  });
});

describe('splitRoutingPorTabla', () => {
  const base = { conductor: '', patente: 'AB', transporte: '', ruta: '1', supervisor: '' };
  const updates: RoutingUpdate[] = [
    { ...base, cod: '05LP' },   // rm
    { ...base, cod: '47PTV' },  // fal (regiones)
    { ...base, cod: '53VAL' },  // costa → rm
  ];
  const grupo: Record<string, 'rm' | 'costa' | 'fal'> = { '05LP': 'rm', '47PTV': 'fal', '53VAL': 'costa' };

  it('manda Regiones a despacho_regiones y RM/Costa a despacho_rm', () => {
    const out = splitRoutingPorTabla(updates, c => grupo[c]);
    expect(out.despacho_rm.map(u => u.cod)).toEqual(['05LP', '53VAL']);
    expect(out.despacho_regiones.map(u => u.cod)).toEqual(['47PTV']);
  });

  it('cods sin grupo conocido caen en despacho_rm', () => {
    const out = splitRoutingPorTabla([{ ...base, cod: 'XXX' }], () => undefined);
    expect(out.despacho_rm).toHaveLength(1);
    expect(out.despacho_regiones).toHaveLength(0);
  });
});

describe('buildControlRows', () => {
  it('incluye ruteadas (con patente) y pendientes (sin patente) → cuadra el conteo', () => {
    const rutas: RutaControl[] = [
      { patente: 'PAT1', tlbd: false, ts: [{ c: 'A', p: 2, b: 1 }, { c: 'B', p: 1, b: 0, ch: 1 }] },
    ];
    const pendientes: PendienteControl[] = [{ c: 'C', p: 1, b: 0, ch: 0 }];
    const rows = buildControlRows('25/06/2026', 'Jueves', rutas, pendientes);

    expect(rows).toHaveLength(3); // 2 ruteadas + 1 pendiente
    // A ruteada en vuelta 1
    expect(rows).toContainEqual(['25/06/2026', 'Jueves', 'A', 2, 1, 'PAT1', '']);
    // B: ch suma a bultos (0+1=1)
    expect(rows).toContainEqual(['25/06/2026', 'Jueves', 'B', 1, 1, 'PAT1', '']);
    // C pendiente: sin patente en ninguna vuelta
    expect(rows).toContainEqual(['25/06/2026', 'Jueves', 'C', 1, 0, '', '']);
  });

  it('2ª vuelta (tlbd) pone la patente en la columna v2', () => {
    const rutas: RutaControl[] = [
      { patente: 'V1', tlbd: false, ts: [{ c: 'A', p: 1, b: 0 }] },
      { patente: 'V2', tlbd: true,  ts: [{ c: 'A', p: 1, b: 0 }] }, // misma tienda, 2ª vuelta
    ];
    const rows = buildControlRows('25/06/2026', 'Jueves', rutas, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['25/06/2026', 'Jueves', 'A', 1, 0, 'V1', 'V2']);
  });

  it('una pendiente NO pisa a una tienda ya ruteada', () => {
    const rutas: RutaControl[] = [{ patente: 'PAT', tlbd: false, ts: [{ c: 'A', p: 3, b: 2 }] }];
    const rows = buildControlRows('25/06/2026', 'Jueves', rutas, [{ c: 'A', p: 3, b: 2, ch: 0 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['25/06/2026', 'Jueves', 'A', 3, 2, 'PAT', '']); // conserva patente
  });
});
