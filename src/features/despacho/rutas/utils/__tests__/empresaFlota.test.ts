import { describe, it, expect } from 'vitest';
import { empresaCanonica, empresaColor, agruparCamionesPorEmpresa, filtrarVehiculosFlota, resumenEmpresasFlota, SIN_EMPRESA } from '../empresaFlota';

describe('empresaCanonica', () => {
  it('vacío / null / solo espacios → "Sin empresa"', () => {
    expect(empresaCanonica('')).toBe(SIN_EMPRESA);
    expect(empresaCanonica(null)).toBe(SIN_EMPRESA);
    expect(empresaCanonica(undefined)).toBe(SIN_EMPRESA);
    expect(empresaCanonica('   ')).toBe(SIN_EMPRESA);
  });
  it('normaliza variantes de marcas conocidas', () => {
    expect(empresaCanonica('kios')).toBe('Kios Club');
    expect(empresaCanonica('KiosClub')).toBe('Kios Club');
    expect(empresaCanonica('  Kios   Club ')).toBe('Kios Club');
    expect(empresaCanonica('LUIS FICA')).toBe('Luis Fica');
    expect(empresaCanonica('falabella')).toBe('Falabella');
  });
  it('empresa desconocida → el texto tal cual (con trim)', () => {
    expect(empresaCanonica('Ortiz')).toBe('Ortiz');
    expect(empresaCanonica('  Inverpadsol ')).toBe('Inverpadsol');
    expect(empresaCanonica('CAM')).toBe('CAM');
  });
});

describe('empresaColor', () => {
  it('marcas conocidas → color de marca fijo', () => {
    expect(empresaColor('Kios Club')).toBe('#2563EB');
    expect(empresaColor('Luis Fica')).toBe('#16A34A');
    expect(empresaColor('Falabella')).toBe('#7C3AED');
  });
  it('"Sin empresa" → gris', () => {
    expect(empresaColor(SIN_EMPRESA)).toBe('#64748B');
  });
  it('desconocida → color determinista y estable (mismo nombre = mismo color)', () => {
    expect(empresaColor('Ortiz')).toBe(empresaColor('Ortiz'));
    expect(empresaColor('Ortiz')).toMatch(/^#[0-9A-F]{6}$/i);
  });
  it('distintas desconocidas no colisionan necesariamente con las marcas', () => {
    const brandColors = ['#2563EB', '#16A34A', '#7C3AED'];
    // No garantiza unicidad global, pero la paleta no incluye los colores de marca.
    expect(brandColors).not.toContain(empresaColor('Ortiz'));
  });
});

describe('agruparCamionesPorEmpresa', () => {
  const flota = [
    { p: 'A', empresa: 'Luis Fica' },
    { p: 'B', empresa: '' },
    { p: 'C', empresa: 'Falabella' },
    { p: 'D', empresa: 'Ortiz' },
    { p: 'E', empresa: 'kios' },
    { p: 'F', empresa: 'Luis Fica' },
    { p: 'G', empresa: null },
  ];
  const grupos = agruparCamionesPorEmpresa(flota, v => v.empresa);

  it('ordena: marcas conocidas → otras (alfabético) → "Sin empresa" al final', () => {
    expect(grupos.map(g => g.empresa)).toEqual(['Kios Club', 'Luis Fica', 'Falabella', 'Ortiz', SIN_EMPRESA]);
  });
  it('agrupa correctamente y preserva el orden de entrada dentro del grupo', () => {
    const luis = grupos.find(g => g.empresa === 'Luis Fica')!;
    expect(luis.items.map(v => v.p)).toEqual(['A', 'F']);
  });
  it('empresa vacía y null caen juntas en "Sin empresa"', () => {
    const sin = grupos.find(g => g.empresa === SIN_EMPRESA)!;
    expect(sin.items.map(v => v.p)).toEqual(['B', 'G']);
  });
  it('cada grupo trae su color', () => {
    expect(grupos.find(g => g.empresa === 'Kios Club')!.color).toBe('#2563EB');
    expect(grupos.find(g => g.empresa === SIN_EMPRESA)!.color).toBe('#64748B');
  });
  it('lista vacía → sin grupos', () => {
    expect(agruparCamionesPorEmpresa([], (v: { empresa: string }) => v.empresa)).toEqual([]);
  });

  it('con getRecencia: la empresa de la patente activada más reciente va primero', () => {
    const f = [
      { p: 'K1', empresa: 'kios' },
      { p: 'L1', empresa: 'Luis Fica' },
      { p: 'O1', empresa: 'Ortiz' },
    ];
    // Ortiz activada última (timestamp mayor) → su grupo va primero, pese al rank fijo.
    const rec: Record<string, number> = { K1: 100, L1: 200, O1: 300 };
    const g = agruparCamionesPorEmpresa(f, v => v.empresa, v => rec[v.p] ?? 0);
    expect(g[0].empresa).toBe('Ortiz');
  });

  it('sin getRecencia: mantiene el orden por rank (marcas primero)', () => {
    const f = [{ p: 'O1', empresa: 'Ortiz' }, { p: 'K1', empresa: 'kios' }];
    const g = agruparCamionesPorEmpresa(f, v => v.empresa);
    expect(g[0].empresa).toBe('Kios Club');
  });
});

describe('filtrarVehiculosFlota', () => {
  const flota = [
    { p: 'TYKK42', empresa: 'Luis Fica' },
    { p: 'VSDR91', empresa: 'luis fica' },   // variante → misma empresa canónica
    { p: 'PTFZ21', empresa: 'Ortiz' },
    { p: 'RZBL80', empresa: '' },            // sin empresa
  ];

  it('sin filtros devuelve todos con su índice original', () => {
    const r = filtrarVehiculosFlota(flota, '', 'all');
    expect(r.map(x => x.i)).toEqual([0, 1, 2, 3]);
  });

  it('filtra por patente (case-insensitive, substring)', () => {
    expect(filtrarVehiculosFlota(flota, 'ptf', 'all').map(x => x.v.p)).toEqual(['PTFZ21']);
  });

  it('filtra por empresa canónica (agrupa variantes) y preserva el índice original', () => {
    const r = filtrarVehiculosFlota(flota, '', 'Luis Fica');
    expect(r.map(x => x.v.p)).toEqual(['TYKK42', 'VSDR91']);
    expect(r.map(x => x.i)).toEqual([0, 1]); // índices originales, no 0..n del subconjunto
  });

  it('empresa "Sin empresa" agrupa los de empresa vacía', () => {
    expect(filtrarVehiculosFlota(flota, '', SIN_EMPRESA).map(x => x.v.p)).toEqual(['RZBL80']);
  });

  it('combina patente + empresa', () => {
    expect(filtrarVehiculosFlota(flota, 'vs', 'Luis Fica').map(x => x.v.p)).toEqual(['VSDR91']);
    expect(filtrarVehiculosFlota(flota, 'tykk', 'Ortiz')).toEqual([]); // no matchea ambas
  });
});

describe('resumenEmpresasFlota', () => {
  it('cuenta por empresa canónica en orden (marcas → otras → Sin empresa) con su color', () => {
    const flota = [
      { empresa: 'Ortiz' }, { empresa: 'kios' }, { empresa: 'Luis Fica' },
      { empresa: 'luisfica' }, { empresa: '' },
    ];
    const r = resumenEmpresasFlota(flota);
    expect(r.map(x => [x.empresa, x.count])).toEqual([
      ['Kios Club', 1], ['Luis Fica', 2], ['Ortiz', 1], [SIN_EMPRESA, 1],
    ]);
    expect(r.find(x => x.empresa === 'Kios Club')!.color).toBe(empresaColor('Kios Club'));
  });
});
