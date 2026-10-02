import { describe, it, expect } from 'vitest';
import {
  tiendaRegistrada, marcarTiendaRegistrada, fusionarRegistroTiendas,
  puedeRegistrarTienda, rotuloBoton, registroDeBlob } from '../registroPorTienda';

const admin = { rol: 'admin', terminada: true, unidades: 3 };

describe('puedeRegistrarTienda — LAS DOS CONDICIONES QUE EVITAN DUPLICAR', () => {
  it('la tienda tiene que estar TERMINADA', () => {
    // No es burocracia. Con la tienda abierta el `orden` se puede mover —unir dos pallets
    // renumera— y el id de la fila es `${orden}${cod}${stamp}${prefijo}`. Un `orden` distinto es un
    // id distinto, y un id distinto SÍ duplicaría cuando después se registre el día entero.
    const r = puedeRegistrarTienda({ ...admin, terminada: false });
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('TERMINADA');
    expect(r.visible).toBe(true);   // se ve, apagado y con el motivo
  });

  it('sin carga no hay nada que registrar', () => {
    const r = puedeRegistrarTienda({ ...admin, unidades: 0 });
    expect(r.puede).toBe(false);
    expect(r.motivo).toContain('carga');
  });

  it('terminada y con carga, se puede', () => {
    expect(puedeRegistrarTienda(admin)).toMatchObject({ puede: true, motivo: null, visible: true });
  });
});

describe('SOLO ADMIN — pedido explícito', () => {
  it('ningún otro rol lo ve siquiera', () => {
    // No se dibuja una puerta cerrada: misma decisión que con las pestañas de Bodega en el #577.
    for (const rol of ['supervisor', 'despachador', 'supervisor-picking', 'auditor', '', undefined, null]) {
      const r = puedeRegistrarTienda({ ...admin, rol });
      expect(r.visible, String(rol)).toBe(false);
      expect(r.puede, String(rol)).toBe(false);
    }
  });

  it('admin sí, sin importar mayúsculas ni espacios', () => {
    expect(puedeRegistrarTienda({ ...admin, rol: 'ADMIN' }).visible).toBe(true);
    expect(puedeRegistrarTienda({ ...admin, rol: '  admin ' }).visible).toBe(true);
  });

  it('el permiso se mira ANTES que todo lo demás', () => {
    // Un no-admin con la tienda sin terminar tampoco tiene que ver el motivo: no es asunto suyo.
    const r = puedeRegistrarTienda({ rol: 'supervisor', terminada: false, unidades: 0 });
    expect(r.visible).toBe(false);
    expect(r.motivo).toBeNull();
  });
});

describe('volver a registrar la misma tienda', () => {
  it('se deja: es inofensivo y sirve para empujar un peso corregido', () => {
    // Los ids ya existen, así que la hoja los actualiza en su lugar en vez de agregarlos.
    expect(puedeRegistrarTienda({ ...admin, yaRegistrada: '11:42' }).puede).toBe(true);
  });

  it('pero el rótulo dice que ya se hizo, y cuándo', () => {
    expect(rotuloBoton('11:42')).toBe('Registrada 11:42');
    expect(rotuloBoton(null)).toBe('Registrar');
  });
});

describe('el mapa por día y tienda', () => {
  it('marca una sin tocar las demás ni los otros días', () => {
    let m = marcarTiendaRegistrada({}, '2026-09-30', '01TPS', '11:42');
    m = marcarTiendaRegistrada(m, '2026-09-30', '29CFL', '12:10');
    m = marcarTiendaRegistrada(m, '2026-09-29', '01TPS', '09:00');
    expect(tiendaRegistrada(m, '2026-09-30', '01TPS')).toBe('11:42');
    expect(tiendaRegistrada(m, '2026-09-30', '29CFL')).toBe('12:10');
    expect(tiendaRegistrada(m, '2026-09-29', '01TPS')).toBe('09:00');
  });

  it('el código no distingue mayúsculas', () => {
    const m = marcarTiendaRegistrada({}, '2026-09-30', '01tps', '11:42');
    expect(tiendaRegistrada(m, '2026-09-30', '01TPS')).toBe('11:42');
  });

  it('sin dato, no está registrada', () => {
    expect(tiendaRegistrada(null, '2026-09-30', '01TPS')).toBeNull();
    expect(tiendaRegistrada({}, '2026-09-30', '01TPS')).toBeNull();
    expect(tiendaRegistrada({ '2026-09-30': {} }, '2026-09-30', '01TPS')).toBeNull();
  });

  it('no muta el mapa que recibe', () => {
    const original = { '2026-09-30': { '01TPS': '11:42' } };
    marcarTiendaRegistrada(original, '2026-09-30', '29CFL', '12:00');
    expect(Object.keys(original['2026-09-30'])).toEqual(['01TPS']);
  });
});

describe('fusionarRegistroTiendas — una marca NUNCA se pierde', () => {
  it('une lo de los dos equipos', () => {
    // Dos personas trabajan el mismo día desde equipos distintos: la que todavía no registró una
    // tienda no puede desmarcársela a la que sí.
    const a = { '2026-09-30': { '01TPS': '11:42' } };
    const b = { '2026-09-30': { '29CFL': '12:10' } };
    expect(fusionarRegistroTiendas(a, b)).toEqual({
      '2026-09-30': { '01TPS': '11:42', '29CFL': '12:10' },
    });
  });

  it('ante dos horas para la misma tienda gana la PRIMERA', () => {
    // Es cuando de verdad se registró; la segunda es un re-registro.
    const a = { '2026-09-30': { '01TPS': '14:00' } };
    const b = { '2026-09-30': { '01TPS': '11:42' } };
    expect(fusionarRegistroTiendas(a, b)['2026-09-30']['01TPS']).toBe('11:42');
    expect(fusionarRegistroTiendas(b, a)['2026-09-30']['01TPS']).toBe('11:42');
  });

  it('respeta los días por separado', () => {
    const a = { '2026-09-29': { '01TPS': '09:00' } };
    const b = { '2026-09-30': { '01TPS': '11:42' } };
    const u = fusionarRegistroTiendas(a, b);
    expect(Object.keys(u).sort()).toEqual(['2026-09-29', '2026-09-30']);
  });

  it('con uno vacío devuelve el otro', () => {
    const a = { '2026-09-30': { '01TPS': '11:42' } };
    expect(fusionarRegistroTiendas(a, null)).toEqual(a);
    expect(fusionarRegistroTiendas(null, a)).toEqual(a);
    expect(fusionarRegistroTiendas(null, null)).toEqual({});
  });
});

// ── LO QUE PASÓ EL 02/10/2026, Y POR QUÉ ESTAS PROPIEDADES IMPORTAN ────────────────────────────
//
// El coordinador registró una tienda desde un equipo y en el otro el botón siguió en rojo. Con la
// MISMA cuenta, desde otro dispositivo, también. E Isaías lo veía en rojo antes, durante y después
// de que alguien lo apretara. La marca vivía solo en el `localStorage` de cada navegador.
//
// Ahora viaja por `shared_session_state`, y el hook se apoya en que esta unión sea MONÓTONA: por
// eso no hace falta un merge de tres vías, ni base, ni corta-ecos, ni carrera de arranque. Estos
// tres tests son esa garantía.
describe('fusionarRegistroTiendas — las propiedades en las que se apoya el hook', () => {
  const dia = '2026-10-02';

  it('IDEMPOTENTE: unir dos veces da lo mismo que unir una', () => {
    // Por esto un eco de realtime no puede desordenar nada.
    const a = { [dia]: { '01TPS': '11:42' } };
    const b = { [dia]: { '29CFL': '12:10' } };
    const una = fusionarRegistroTiendas(a, b);
    expect(fusionarRegistroTiendas(una, b)).toEqual(una);
    expect(fusionarRegistroTiendas(una, una)).toEqual(una);
  });

  it('CONMUTATIVA: no importa en qué orden lleguen los eventos', () => {
    const a = { [dia]: { '01TPS': '11:42', '46TRE': '13:05' } };
    const b = { [dia]: { '29CFL': '12:10', '01TPS': '14:00' } };
    expect(fusionarRegistroTiendas(a, b)).toEqual(fusionarRegistroTiendas(b, a));
  });

  it('NUNCA DECRECE: unir no puede quitar una marca que ya estaba', () => {
    const mio = { [dia]: { '01TPS': '11:42', '46TRE': '13:05' } };
    for (const otro of [{}, null, { [dia]: {} }, { '2026-10-01': { '08RNC': '09:00' } }]) {
      const u = fusionarRegistroTiendas(mio, otro as never);
      expect(Object.keys(u[dia])).toEqual(expect.arrayContaining(['01TPS', '46TRE']));
    }
  });

  it('EL CASO: dos equipos marcan tiendas distintas y los dos terminan viéndolas', () => {
    // Erick marca 01TPS en su teléfono; Isaías marca 46TRE en el suyo. Cada uno empuja la unión de
    // lo que leyó con lo suyo, así que la fila termina con las dos y los dos las ven.
    const erick  = { [dia]: { '01TPS': '17:38' } };
    const isaias = { [dia]: { '46TRE': '17:41' } };
    const enLaFila = fusionarRegistroTiendas(
      fusionarRegistroTiendas({}, erick),   // Erick leyó vacío y empujó lo suyo
      isaias,                                // Isaías leyó vacío y empujó lo suyo
    );
    expect(enLaFila[dia]).toEqual({ '01TPS': '17:38', '46TRE': '17:41' });
  });
});

describe('registroDeBlob — un blob raro no borra las marcas', () => {
  it('deja pasar un registro con forma', () => {
    const r = { '2026-10-02': { '01TPS': '11:42' } };
    expect(registroDeBlob(r)).toEqual(r);
  });

  it('todo lo demás es {} — y unir contra {} no quita nada', () => {
    for (const basura of [null, undefined, 'texto', 42, true, ['a'], []]) {
      expect(registroDeBlob(basura)).toEqual({});
    }
    const mio = { '2026-10-02': { '01TPS': '11:42' } };
    expect(fusionarRegistroTiendas(mio, registroDeBlob(null))).toEqual(mio);
    expect(fusionarRegistroTiendas(mio, registroDeBlob(['raro']))).toEqual(mio);
  });

  it('un objeto vacío también pasa, y no hace nada', () => {
    expect(registroDeBlob({})).toEqual({});
  });
});
