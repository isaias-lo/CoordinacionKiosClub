import { describe, it, expect } from 'vitest';
import { tipoCodeSantiago, pkgCodeNacional, botonDeTipoCode } from '../tipoCode';

describe('tipoCodeSantiago', () => {
  it('mapea cada tipo a su letra', () => {
    expect(tipoCodeSantiago('Pallet')).toBe('P');
    expect(tipoCodeSantiago('Bulto')).toBe('B');
    expect(tipoCodeSantiago('Contenedor')).toBe('C');
    expect(tipoCodeSantiago('Chocolate')).toBe('CH');
  });
  it('desconocido → P (pallet) por defecto', () => {
    expect(tipoCodeSantiago('otro')).toBe('P');
  });
});

describe('pkgCodeNacional', () => {
  it('mapea cada pkg a su letra', () => {
    expect(pkgCodeNacional('pallet')).toBe('P');
    expect(pkgCodeNacional('box')).toBe('B');
    expect(pkgCodeNacional('contenedor')).toBe('C');
    expect(pkgCodeNacional('chocolate')).toBe('CH');
  });
  it('desconocido → P por defecto', () => {
    expect(pkgCodeNacional('x')).toBe('P');
  });
});

describe('la adquisición y el web/retiro tienen su letra', () => {
  it('EL BUG: caían en el default y se guardaban como PALLET', () => {
    // En Nacional pasaba SIEMPRE —`pkgCodeNacional` no los conocía—, así que una adquisición se
    // creaba como slot 'P' y contaba entre los pallets del día. En RM/Costa pasaba a veces: el
    // formulario se había hecho dos mapas propios en línea con A y W, pero seguía llamando a
    // `tipoCodeSantiago` —sin A ni W— en otros tres sitios.
    expect(tipoCodeSantiago('Adquisicion')).toBe('A');
    expect(tipoCodeSantiago('WebRetiro')).toBe('W');
    expect(pkgCodeNacional('adquisicion')).toBe('A');
    expect(pkgCodeNacional('web-retiro')).toBe('W');
  });

  it('los cuatro envases de siempre no cambian', () => {
    expect(tipoCodeSantiago('Pallet')).toBe('P');
    expect(tipoCodeSantiago('Bulto')).toBe('B');
    expect(tipoCodeSantiago('Contenedor')).toBe('C');
    expect(tipoCodeSantiago('Chocolate')).toBe('CH');
    expect(pkgCodeNacional('pallet')).toBe('P');
    expect(pkgCodeNacional('box')).toBe('B');
    expect(pkgCodeNacional('contenedor')).toBe('C');
    expect(pkgCodeNacional('chocolate')).toBe('CH');
  });

  it('los dos espejos dan la MISMA letra para el mismo envase', () => {
    // La duplicación es lo que dejó entrar el bug: hay que poder comparar los dos lados.
    expect(tipoCodeSantiago('Adquisicion')).toBe(pkgCodeNacional('adquisicion'));
    expect(tipoCodeSantiago('WebRetiro')).toBe(pkgCodeNacional('web-retiro'));
    expect(tipoCodeSantiago('Chocolate')).toBe(pkgCodeNacional('chocolate'));
  });

  it('el botón que hay que apretar para volver a crearlo', () => {
    expect(botonDeTipoCode('A')).toBe('+ Adquisición');
    expect(botonDeTipoCode('W')).toBe('+ Web / retiro');
  });
});
