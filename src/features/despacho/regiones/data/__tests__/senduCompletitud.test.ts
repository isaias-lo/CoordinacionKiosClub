import { describe, it, expect } from 'vitest';
import { camposSenduFaltantes, senduCompleta, avisoSendu } from '../senduCompletitud';

// 57CAS tal como está en el catálogo curado: completa.
const castro = {
  region_sendu: 'Los_Lagos', comuna: 'Castro', calle: 'Ignacio Serrano',
  numero: '574', email: 'despachocd@kiosclub.com', celular: '56920159964',
};
// 60PBL tal como viene hoy de Config: la dirección entera en `calle` y el resto vacío.
const losPablos = {
  region_sendu: '', comuna: '', calle: 'Avenida Martín Lutero 2442, Temuco',
  numero: '', email: '', celular: '',
};

describe('camposSenduFaltantes', () => {
  it('una tienda curada no tiene faltantes', () => {
    expect(camposSenduFaltantes(castro)).toEqual([]);
    expect(senduCompleta(castro)).toBe(true);
  });

  it('60PBL: dice exactamente qué le falta', () => {
    expect(camposSenduFaltantes(losPablos))
      .toEqual(['región Sendu', 'comuna', 'número', 'correo', 'teléfono']);
  });

  // El punto de todo el cambio: antes se marcaba por PROCEDENCIA, así que una tienda con todo
  // lleno igual salía en el aviso y este no se apagaba nunca.
  it('una tienda nueva con todo lleno NO se marca', () => {
    expect(senduCompleta({ ...castro, comuna: 'Iquique' })).toBe(true);
  });

  it('los espacios en blanco no cuentan como dato', () => {
    expect(camposSenduFaltantes({ ...castro, comuna: '   ' })).toEqual(['comuna']);
  });

  it('sin ficha, falta todo', () => {
    expect(camposSenduFaltantes(null)).toHaveLength(6);
    expect(camposSenduFaltantes(undefined)).toHaveLength(6);
  });

  // Hay tiendas reales sin número de local: exigirlo las marcaría para siempre.
  it('el complemento NO es obligatorio', () => {
    expect(senduCompleta({ ...castro, ...{ complemento: '' } })).toBe(true);
  });
});

describe('avisoSendu', () => {
  it('sin faltantes no hay aviso', () => {
    expect(avisoSendu([])).toBeNull();
  });

  it('nombra la tienda y qué le falta', () => {
    const msg = avisoSendu([{ cod: '60PBL', falta: ['comuna', 'número'] }])!;
    expect(msg).toContain('60PBL (falta comuna, número)');
    expect(msg).toContain('Una tienda');
  });

  it('con varias, las lista', () => {
    const msg = avisoSendu([
      { cod: '60PBL', falta: ['comuna'] },
      { cod: '61XXX', falta: ['correo'] },
    ])!;
    expect(msg).toContain('2 tiendas');
    expect(msg).toContain('60PBL (falta comuna) · 61XXX (falta correo)');
  });
});
