import { describe, it, expect } from 'vitest';
import {
  estaRegistrado, marcarRegistro, fusionarRegistros, migrarRegistroViejo,
  type RegistroPorFecha,
} from '../registroPorFecha';

const HOY = '2026-09-28';
const MANANA = '2026-09-29';

describe('estaRegistrado', () => {
  it('true solo para el día marcado', () => {
    const mapa: RegistroPorFecha = { [HOY]: true };
    expect(estaRegistrado(mapa, HOY)).toBe(true);
    expect(estaRegistrado(mapa, MANANA)).toBe(false);
  });

  it('sin mapa o sin fecha, no', () => {
    expect(estaRegistrado(undefined, HOY)).toBe(false);
    expect(estaRegistrado(null, HOY)).toBe(false);
    expect(estaRegistrado({ [HOY]: true }, '')).toBe(false);
  });
});

describe('marcarRegistro', () => {
  it('EL CASO DEL 28/09: pasar a la fecha de mañana no borra el registro de hoy', () => {
    // Antes esto era `registrado: false` en el reducer al cambiar la fecha, y ese false se empujaba
    // a todos los equipos. Acá mover la fecha no llama a nada: el mapa queda intacto.
    const mapa = marcarRegistro({}, HOY, true);
    expect(estaRegistrado(mapa, HOY)).toBe(true);
    // El coordinador cambia la fecha de despacho a mañana: el mapa no se toca.
    expect(estaRegistrado(mapa, MANANA)).toBe(false);
    // Y al volver a hoy, sigue registrado.
    expect(estaRegistrado(mapa, HOY)).toBe(true);
  });

  it('desmarcar borra la llave en vez de dejar un false', () => {
    // Si no, el mapa crecería con un `false` por cada fecha que alguien abrió.
    const mapa = marcarRegistro({ [HOY]: true, [MANANA]: true }, HOY, false);
    expect(mapa).toEqual({ [MANANA]: true });
  });

  it('no muta el mapa que recibe', () => {
    const original: RegistroPorFecha = { [HOY]: true };
    marcarRegistro(original, MANANA, true);
    expect(original).toEqual({ [HOY]: true });
  });

  it('sin fecha no inventa una llave', () => {
    expect(marcarRegistro({ [HOY]: true }, '', true)).toEqual({ [HOY]: true });
  });
});

describe('fusionarRegistros — dos equipos el mismo día', () => {
  it('un true del otro equipo se adopta', () => {
    expect(fusionarRegistros({}, { [HOY]: true })).toEqual({ [HOY]: true });
  });

  it('un equipo que NO registró no puede desregistrar al que sí', () => {
    // Es la regla que ya existía con el booleano, y es la que evita el bug original: el remoto
    // solo puede sumar registros, nunca quitarlos.
    expect(fusionarRegistros({ [HOY]: true }, {})).toEqual({ [HOY]: true });
    expect(fusionarRegistros({ [HOY]: true }, { [HOY]: false })).toEqual({ [HOY]: true });
  });

  it('suma días distintos de cada lado', () => {
    expect(fusionarRegistros({ [HOY]: true }, { [MANANA]: true }))
      .toEqual({ [HOY]: true, [MANANA]: true });
  });

  it('tolera que falte cualquiera de los dos lados', () => {
    expect(fusionarRegistros(undefined, undefined)).toEqual({});
    expect(fusionarRegistros(null, { [HOY]: true })).toEqual({ [HOY]: true });
  });
});

describe('migrarRegistroViejo — lo que ya está guardado', () => {
  it('un true viejo se conserva bajo la fecha que lo acompañaba', () => {
    expect(migrarRegistroViejo({}, true, HOY)).toEqual({ [HOY]: true });
  });

  it('sin fecha se descarta: no se puede saber a qué día se refería', () => {
    // El lado seguro. Mostrar "sin registrar" un día que sí se registró hace revisar de más;
    // al revés se despacharía sin registrar.
    expect(migrarRegistroViejo({}, true, undefined)).toEqual({});
  });

  it('un false viejo no agrega nada', () => {
    expect(migrarRegistroViejo({ [MANANA]: true }, false, HOY)).toEqual({ [MANANA]: true });
    expect(migrarRegistroViejo({}, undefined, HOY)).toEqual({});
  });
});
