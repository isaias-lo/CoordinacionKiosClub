import { describe, it, expect } from 'vitest';
import { coherenciaCatalogo, grupoEsperado, type TiendaCatalogo, type CalendarioPorDia } from '../coherenciaCatalogo';

const t = (codigo: string, extra: Partial<TiendaCatalogo> = {}): TiendaCatalogo =>
  ({ codigo, nombre: codigo, sector_comuna: 'Corredor Norte', region: 'RM', activo: true, ...extra });

const CAL: CalendarioPorDia = { LU: { rm: ['22LGN'], fal: ['57CAS'], costa: ['33CON'] } };
const soloOficina = (_c: string, tipo?: string | null) => (tipo ?? '').toLowerCase() === 'oficina';

const tipos = (r: ReturnType<typeof coherenciaCatalogo>) => r.map(i => i.tipo);
const items = (r: ReturnType<typeof coherenciaCatalogo>, tipo: string) => r.find(i => i.tipo === tipo)?.items;

describe('grupoEsperado', () => {
  it('mapea el sector a su grupo del calendario', () => {
    expect(grupoEsperado('Corredor Norte')).toBe('rm');
    expect(grupoEsperado('Las Condes')).toBe('rm');
    expect(grupoEsperado('Costa')).toBe('costa');
    expect(grupoEsperado('Región Sur')).toBe('fal');
    expect(grupoEsperado('Región Norte')).toBe('fal');
  });

  // 'Región' a secas no dice norte ni sur, pero para el GRUPO alcanza: es Regiones igual.
  it('"Región" a secas basta para el grupo', () => {
    expect(grupoEsperado('Región')).toBe('fal');
  });

  it('sin sector no se afirma nada', () => {
    expect(grupoEsperado('')).toBeNull();
    expect(grupoEsperado(null)).toBeNull();
  });
});

describe('coherenciaCatalogo', () => {
  it('un catálogo sano no reporta nada', () => {
    const r = coherenciaCatalogo(
      [t('22LGN'), t('57CAS', { sector_comuna: 'Región', region: 'Los Lagos' }), t('33CON', { sector_comuna: 'Costa', region: 'Valparaíso' })],
      CAL, soloOficina);
    expect(r).toEqual([]);
  });

  // El caso 59EGN (Plaza Egaña): MALL activa con el sector vacío → se queda sin zona.
  it('encuentra una tienda activa sin sector', () => {
    const r = coherenciaCatalogo([t('59EGN', { sector_comuna: '' })], CAL, soloOficina);
    expect(items(r, 'sin-sector')).toEqual(['59EGN']);
  });

  // El caso 60PBL: region = "Araucanía " con un espacio al final.
  it('encuentra espacios sobrantes y dice en qué campo', () => {
    const r = coherenciaCatalogo([t('60PBL', { region: 'Araucanía ' })], CAL, soloOficina);
    expect(items(r, 'espacios-sobrantes')).toEqual(['60PBL · región: "Araucanía "']);
  });

  it('encuentra un código del calendario que no existe en el catálogo', () => {
    const r = coherenciaCatalogo([t('22LGN')], { LU: { rm: ['22LGN', '99XXX'] } }, soloOficina);
    expect(items(r, 'huerfana-en-calendario')).toEqual(['99XXX (LU)']);
  });

  it('encuentra una tienda apagada que sigue en el calendario', () => {
    const r = coherenciaCatalogo([t('22LGN', { activo: false })], { LU: { rm: ['22LGN'] } }, soloOficina);
    expect(items(r, 'inactiva-en-calendario')).toEqual(['22LGN (LU)']);
  });

  it('encuentra una tienda en un grupo que no le corresponde', () => {
    const r = coherenciaCatalogo([t('57CAS', { sector_comuna: 'Región' })], { LU: { rm: ['57CAS'] } }, soloOficina);
    expect(items(r, 'grupo-no-calza')).toEqual(['57CAS · está en "rm", su sector dice "fal"']);
  });

  it('encuentra una tienda repetida en dos grupos', () => {
    const r = coherenciaCatalogo([t('22LGN')], { LU: { rm: ['22LGN'] }, MA: { costa: ['22LGN'] } }, soloOficina);
    expect(items(r, 'dos-grupos')).toEqual(['22LGN (costa + rm)']);
  });

  it('encuentra una tienda activa que no está en ningún día', () => {
    const r = coherenciaCatalogo([t('22LGN'), t('GD')], CAL, soloOficina);
    expect(items(r, 'fuera-del-calendario')).toEqual(['GD']);
  });

  // La oficina no despacha por calendario: exigírselo sería un aviso permanente y falso.
  it('la oficina no se reporta por estar fuera del calendario', () => {
    const r = coherenciaCatalogo([t('OFIKC', { tipo: 'oficina' })], CAL, soloOficina);
    expect(tipos(r)).not.toContain('fuera-del-calendario');
  });

  it('las tiendas inactivas no se revisan como activas', () => {
    const r = coherenciaCatalogo([t('VIEJA', { activo: false, sector_comuna: '', region: '' })], {}, soloOficina);
    expect(r).toEqual([]);
  });

  // Un sector del que no se puede deducir el grupo no debe generar un falso positivo.
  it('sin sector no inventa un desajuste de grupo', () => {
    const r = coherenciaCatalogo([t('59EGN', { sector_comuna: '' })], { LU: { rm: ['59EGN'] } }, soloOficina);
    expect(tipos(r)).not.toContain('grupo-no-calza');
  });

  it('lo más grave va primero', () => {
    const r = coherenciaCatalogo(
      [t('SINSEC', { sector_comuna: '' }), t('CONESP', { region: 'RM ' })],
      { LU: { rm: ['99XXX'] } }, soloOficina);
    expect(tipos(r)).toEqual(['huerfana-en-calendario', 'sin-sector', 'fuera-del-calendario', 'espacios-sobrantes']);
  });

  it('el código se compara normalizado y sin distinguir mayúsculas', () => {
    const r = coherenciaCatalogo([t('22lgn')], { LU: { rm: [' 22LGN '] } }, soloOficina);
    expect(tipos(r)).not.toContain('fuera-del-calendario');
    expect(tipos(r)).not.toContain('huerfana-en-calendario');
  });

  it('sin calendario no se inventan huérfanas', () => {
    expect(coherenciaCatalogo([t('22LGN')], null, () => true)).toEqual([]);
  });
});
