import { describe, it, expect } from 'vitest';
import { claveDeCuenta, buscadorDeNombres, personaDeCuenta } from '../nombreDeCuenta';

/** La tabla real, recortada. «control interno» en minúscula es como está en la base. */
const TABLA: Record<string, string> = {
  'Pickers 15': 'Cristobal Labra',
  'Pickers 16': 'Christian Flores',
  'control interno': 'Francisca Farias',
  'Congelado 1': 'Joe Idrovo',
  'Sofia Sanchez': '',
};

describe('claveDeCuenta', () => {
  it('normaliza mayúsculas y espacios de los bordes', () => {
    expect(claveDeCuenta('  Control Interno ')).toBe('control interno');
    expect(claveDeCuenta('PICKERS 15')).toBe('pickers 15');
  });

  it('no toca los espacios de adentro: «Pickers 15» no es «Pickers15»', () => {
    expect(claveDeCuenta('Pickers 15')).not.toBe(claveDeCuenta('Pickers15'));
  });
});

describe('buscadorDeNombres: EL caso que motivó esto', () => {
  const buscar = buscadorDeNombres(TABLA);

  it('Odoo dice «Control Interno» y la tabla «control interno»: ahora calza', () => {
    // 54 tandas y 139,1 h en octubre. Con la comparación exacta el nombre no llegaba nunca.
    expect(buscar('Control Interno')).toBe('Francisca Farias');
  });

  it('también con espacios de sobra, que es lo que deja un copiar y pegar', () => {
    expect(buscar('  CONTROL INTERNO  ')).toBe('Francisca Farias');
  });

  it('el acierto exacto sigue andando igual', () => {
    expect(buscar('Pickers 15')).toBe('Cristobal Labra');
    expect(buscar('Congelado 1')).toBe('Joe Idrovo');
  });

  it('«pickers 3» de Odoo contra «Pickers 3» de la tabla: el caso del comentario de PickingScreen', () => {
    expect(buscadorDeNombres({ 'Pickers 3': 'Jhon Negrete' })('pickers 3')).toBe('Jhon Negrete');
  });
});

describe('buscadorDeNombres: lo que NO tiene nombre', () => {
  const buscar = buscadorDeNombres(TABLA);

  it('una pistola sin nombre da vacío, no el nombre de otra', () => {
    // Sin asignar es un estado normal. Ver `ajustes/nombresDePicker.ts`.
    expect(buscar('Sofia Sanchez')).toBe('');
  });

  it('una cuenta que no está en la tabla da vacío', () => {
    expect(buscar('Mario Patiño')).toBe('');
  });

  it('sin tabla no rompe', () => {
    expect(buscadorDeNombres(undefined)('Pickers 15')).toBe('');
    expect(buscadorDeNombres({})('Pickers 15')).toBe('');
  });
});

describe('buscadorDeNombres: dos claves que normalizan igual', () => {
  it('gana la que tiene nombre, venga en el orden que venga', () => {
    const a = buscadorDeNombres({ 'Control Interno': '', 'control interno': 'Francisca Farias' });
    const b = buscadorDeNombres({ 'control interno': 'Francisca Farias', 'Control Interno': '' });
    expect(a('CONTROL INTERNO')).toBe('Francisca Farias');
    expect(b('CONTROL INTERNO')).toBe('Francisca Farias');
  });

  it('si ninguna tiene nombre, da vacío', () => {
    const buscar = buscadorDeNombres({ 'Control Interno': '', 'control interno': '  ' });
    expect(buscar('control interno')).toBe('');
  });
});

describe('personaDeCuenta', () => {
  const buscar = buscadorDeNombres(TABLA);

  it('con nombre devuelve la persona', () => {
    expect(personaDeCuenta(buscar, 'Control Interno')).toBe('Francisca Farias');
  });

  it('sin nombre devuelve la cuenta TAL COMO LA ESCRIBIÓ ODOO, no normalizada', () => {
    // Lo que se muestra es lo que Odoo manda: normalizar acá dejaría «mario patiño» en pantalla.
    expect(personaDeCuenta(buscar, 'Mario Patiño')).toBe('Mario Patiño');
    expect(personaDeCuenta(buscar, 'Sofia Sanchez')).toBe('Sofia Sanchez');
  });
});

describe('por qué esto decide la AGRUPACIÓN y no solo el texto', () => {
  it('dos cuentas que difieren en una mayúscula son la MISMA persona', () => {
    // En `rendimientoPorPicker` el nombre es la clave con la que se fusionan las filas. Si las
    // dos no resuelven al mismo nombre, la persona sale en dos filas y su ritmo queda partido.
    const buscar = buscadorDeNombres({ 'control interno': 'Francisca Farias' });
    expect(personaDeCuenta(buscar, 'Control Interno'))
      .toBe(personaDeCuenta(buscar, 'control interno'));
  });

  it('dos cuentas distintas de la misma persona también', () => {
    const buscar = buscadorDeNombres({ 'Pickers 15': 'Cristobal Labra', 'PICKERS 20': 'Cristobal Labra' });
    expect(personaDeCuenta(buscar, 'pickers 15')).toBe(personaDeCuenta(buscar, 'Pickers 20'));
  });
});
