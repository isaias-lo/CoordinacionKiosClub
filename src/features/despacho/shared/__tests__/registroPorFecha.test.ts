import { describe, it, expect } from 'vitest';
import {
  estaRegistrado, marcarRegistro, fusionarRegistros, migrarRegistroViejo, traeRegistrosNuevos,
  decidir, fusionarDecisiones, aplicarDecisiones,
  type RegistroPorFecha, type DecisionPorFecha,
} from '../registroPorFecha';
import { fechaDespachoBodega } from '../fechaLocal';

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

// ── EL DÍA QUE SE REGISTRÓ Y EL BANNER DIJO QUE NO (30/09/2026) ────────────────────────────────
//
// Los dos registros del 30/09 quedaron en `actividad_bodega` y en la planilla, pero el estado
// compartido siguió diciendo `registrado: false` y `registros: {}`. Al día siguiente el banner
// avisaba «DESPACHO SIN REGISTRAR · 30 SEP» sobre un día que sí se había registrado.
//
// La causa no estaba acá —`marcarRegistro` siempre hizo lo suyo— sino en QUÉ se empujaba: el
// modal llamaba a `flushPending()` en la misma vuelta que el `dispatch`, y `stateRef` todavía
// tenía el estado de antes. En RM/Costa directamente no se empujaba nada.
//
// Estos tests fijan la pieza pura: lo que el modal calcula y empuja es lo mismo que el reducer
// deja en el estado. Si esas dos cuentas se separan, vuelve el bug.

describe('lo que empuja el modal == lo que deja el reducer', () => {
  it('marcar el día de despacho deja ese día, no el de armado', () => {
    // El 30/09 se armaba para despachar el 01/10: el registro va bajo la fecha de DESPACHO.
    const r = marcarRegistro({}, '2026-10-01', true);
    expect(estaRegistrado(r, '2026-10-01')).toBe(true);
    expect(estaRegistrado(r, '2026-09-30')).toBe(false);
  });

  it('calcularlo dos veces da lo mismo — el modal y el reducer no pueden divergir', () => {
    const base = { '2026-09-30': true };
    expect(marcarRegistro(base, '2026-10-01', true))
      .toEqual(marcarRegistro(base, '2026-10-01', true));
  });

  it('no pierde los días anteriores', () => {
    const r = marcarRegistro({ '2026-09-29': true, '2026-09-30': true }, '2026-10-01', true);
    expect(Object.keys(r).sort()).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
  });

  it('sin fecha no inventa una clave vacía', () => {
    expect(marcarRegistro({ '2026-09-30': true }, '', true)).toEqual({ '2026-09-30': true });
  });
});

// ── LA FECHA VACÍA (01/10/2026) ────────────────────────────────────────────────────────────────
//
// Verificado en vivo: después de registrar, `shared_session_state` tenía `fechaDespacho: (VACIO)`
// en los DOS espejos, mientras la pantalla mostraba 02/10/2026 — porque la pantalla CALCULA el día
// hábil siguiente para mostrarlo, y el estado solo guarda algo si alguien toca el selector.
//
// Marcar el registro con esa fecha vacía no hace nada, y el día quedaba como no registrado: el
// botón volvía a rojo y al otro día salía el banner «DESPACHO SIN REGISTRAR» sobre un día que sí
// se había registrado. Es lo que el #643 creyó arreglar y no arregló.

describe('marcar con la fecha CALCULADA, no con la cruda', () => {
  const alMediodia = (iso: string) => new Date(`${iso}T12:00:00`);

  it('la fecha cruda vacía NO marca nada — por eso fallaba', () => {
    expect(marcarRegistro({}, '', true)).toEqual({});
    expect(estaRegistrado(marcarRegistro({}, '', true), '2026-10-02')).toBe(false);
  });

  it('la fecha CALCULADA sí marca, aunque el selector esté sin tocar', () => {
    const calculada = fechaDespachoBodega(undefined, alMediodia('2026-10-01'));
    expect(calculada).toBe('2026-10-02');
    expect(estaRegistrado(marcarRegistro({}, calculada, true), '2026-10-02')).toBe(true);
  });

  it('marcar y leer usan la MISMA cuenta — si divergen, vuelve el bug', () => {
    // El síntoma no era que no se guardara: era que se guardaba bajo una fecha y se leía bajo otra.
    const hoy = alMediodia('2026-10-01');
    const r = marcarRegistro({}, fechaDespachoBodega(undefined, hoy), true);
    expect(estaRegistrado(r, fechaDespachoBodega(undefined, hoy))).toBe(true);
  });

  it('si alguien SÍ tocó el selector, manda esa fecha', () => {
    const elegida = fechaDespachoBodega('2026-10-05', alMediodia('2026-10-01'));
    expect(estaRegistrado(marcarRegistro({}, elegida, true), '2026-10-05')).toBe(true);
  });
});


// ── Reabrir un día ya registrado ──────────────────────────────────────────────────────────────
//
// El caso del 12/10/2026: Reabrir pasaba el botón a REGISTRAR y volvía solo a Completado, porque
// la fila compartida seguía con el `true` y la regla «un true nunca se pierde» lo re-adoptaba.

const DESPACHO = '2026-10-13';
const T1 = 1_760_000_000_000;   // una hora cualquiera
const T2 = T1 + 60_000;         // un minuto después
const T3 = T2 + 60_000;

describe('decidir', () => {
  it('asienta la decisión con su hora', () => {
    expect(decidir({}, DESPACHO, false, T1)).toEqual({ [DESPACHO]: { registrado: false, ts: T1 } });
    expect(decidir({}, DESPACHO, true, T2)).toEqual({ [DESPACHO]: { registrado: true, ts: T2 } });
  });

  it('sin fecha o con hora inválida no inventa nada', () => {
    expect(decidir({}, '', false, T1)).toEqual({});
    expect(decidir({}, DESPACHO, false, NaN)).toEqual({});
  });

  it('no pisa los otros días', () => {
    const antes = decidir({}, '2026-10-12', true, T1);
    expect(decidir(antes, DESPACHO, false, T2)).toEqual({
      '2026-10-12': { registrado: true, ts: T1 },
      [DESPACHO]:   { registrado: false, ts: T2 },
    });
  });
});

describe('fusionarDecisiones', () => {
  it('gana la más nueva, venga de donde venga', () => {
    const mia   = { [DESPACHO]: { registrado: false, ts: T2 } };
    const otra  = { [DESPACHO]: { registrado: true,  ts: T1 } };
    expect(fusionarDecisiones(mia, otra)[DESPACHO]).toEqual({ registrado: false, ts: T2 });
    expect(fusionarDecisiones(otra, mia)[DESPACHO]).toEqual({ registrado: false, ts: T2 });
  });

  it('un registro POSTERIOR a la reapertura vuelve a ganar', () => {
    const reabierto = { [DESPACHO]: { registrado: false, ts: T2 } };
    const registrado = { [DESPACHO]: { registrado: true, ts: T3 } };
    expect(fusionarDecisiones(reabierto, registrado)[DESPACHO]).toEqual({ registrado: true, ts: T3 });
  });

  it('empate: se queda el local', () => {
    const mia  = { [DESPACHO]: { registrado: false, ts: T1 } };
    const otra = { [DESPACHO]: { registrado: true,  ts: T1 } };
    expect(fusionarDecisiones(mia, otra)[DESPACHO]).toEqual({ registrado: false, ts: T1 });
  });

  it('descarta basura de la red sin tumbar el resto', () => {
    const basura = {
      [DESPACHO]: { registrado: false, ts: T1 },
      malo1: { registrado: 'si', ts: T1 }, malo2: { registrado: false, ts: 'ayer' },
      malo3: null, malo4: { registrado: false },
    } as unknown as DecisionPorFecha;
    expect(fusionarDecisiones({}, basura)).toEqual({ [DESPACHO]: { registrado: false, ts: T1 } });
    expect(fusionarDecisiones(basura, {})).toEqual({ [DESPACHO]: { registrado: false, ts: T1 } });
  });
});

describe('aplicarDecisiones', () => {
  it('EL CASO DEL 12/10: el `true` de la fila vieja ya no revive el día reabierto', () => {
    const fusionado = fusionarRegistros({}, { [DESPACHO]: true });   // lo remoto gana, como siempre
    expect(fusionado[DESPACHO]).toBe(true);
    const decisiones = decidir({}, DESPACHO, false, T2);
    expect(aplicarDecisiones(fusionado, decisiones)).toEqual({});
    expect(estaRegistrado(aplicarDecisiones(fusionado, decisiones), DESPACHO)).toBe(false);
  });

  it('también le gana al booleano viejo que migra desde el estado remoto', () => {
    const migrado = migrarRegistroViejo({}, true, DESPACHO);
    expect(migrado[DESPACHO]).toBe(true);
    expect(aplicarDecisiones(migrado, decidir({}, DESPACHO, false, T2))).toEqual({});
  });

  it('registrar de nuevo después de reabrir vuelve a marcarlo', () => {
    const decisiones = decidir(decidir({}, DESPACHO, false, T2), DESPACHO, true, T3);
    expect(aplicarDecisiones({}, decisiones)).toEqual({ [DESPACHO]: true });
  });

  it('no toca los días sobre los que nadie decidió nada', () => {
    const registros: RegistroPorFecha = { '2026-10-12': true, [DESPACHO]: true };
    expect(aplicarDecisiones(registros, decidir({}, DESPACHO, false, T2))).toEqual({ '2026-10-12': true });
  });

  it('sin decisiones devuelve el mapa igual', () => {
    const registros: RegistroPorFecha = { [DESPACHO]: true };
    expect(aplicarDecisiones(registros, undefined)).toEqual(registros);
    expect(aplicarDecisiones(registros, {})).toEqual(registros);
  });
});

describe('traeRegistrosNuevos con una reapertura', () => {
  it('el `true` remoto del día reabierto NO es una novedad — si no, se re-adopta en bucle', () => {
    expect(traeRegistrosNuevos({}, { [DESPACHO]: true })).toBe(true);
    expect(traeRegistrosNuevos({}, { [DESPACHO]: true }, decidir({}, DESPACHO, false, T2))).toBe(false);
  });

  it('otro día registrado por el compañero sí sigue llegando', () => {
    const decisiones = decidir({}, DESPACHO, false, T2);
    expect(traeRegistrosNuevos({}, { '2026-10-14': true }, decisiones)).toBe(true);
  });
});

describe('lo que NO cambia: un equipo que no registró no desregistra al que sí', () => {
  it('ausencia sigue sin ser borrado', () => {
    // B nunca registró: su mapa vacío y sin decisiones no puede apagar el día de A.
    const deA: RegistroPorFecha = { [DESPACHO]: true };
    const fusionado = fusionarRegistros(deA, {});
    expect(aplicarDecisiones(fusionado, {})).toEqual({ [DESPACHO]: true });
    expect(estaRegistrado(aplicarDecisiones(fusionado, undefined), DESPACHO)).toBe(true);
  });
});
