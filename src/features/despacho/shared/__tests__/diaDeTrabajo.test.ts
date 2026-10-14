import { describe, it, expect } from 'vitest';
import {
  diaPedidoEnURL, diaDeTrabajoAdmitido, resolverDiaDeTrabajo, esOtroDia, diaEnPalabras, urlConDia,
  MAX_DIAS_ATRAS,
} from '../diaDeTrabajo';

const HOY = '2026-10-14';
const AYER = '2026-10-13';

describe('diaPedidoEnURL', () => {
  it('lo saca esté donde esté en la query', () => {
    expect(diaPedidoEnURL('?dia=2026-10-13')).toBe(AYER);
    expect(diaPedidoEnURL('?zona=rm&dia=2026-10-13')).toBe(AYER);
    expect(diaPedidoEnURL('?dia=2026-10-13&otro=1')).toBe(AYER);
  });

  it('sin el parámetro, null', () => {
    expect(diaPedidoEnURL('')).toBeNull();
    expect(diaPedidoEnURL(null)).toBeNull();
    expect(diaPedidoEnURL('?zona=rm')).toBeNull();
    expect(diaPedidoEnURL('?dia=')).toBeNull();
  });

  it('no se confunde con un parámetro que TERMINA en «dia»', () => {
    // `?mediodia=…` no es `?dia=…`. Sin el `[?&]` del principio, lo tomaba igual.
    expect(diaPedidoEnURL('?mediodia=2026-10-13')).toBeNull();
  });

  it('una query rota no tumba la pantalla', () => {
    expect(diaPedidoEnURL('?dia=%E0%A4%A')).toBeNull();
  });
});

describe('diaDeTrabajoAdmitido', () => {
  it('hoy y los días de la ventana', () => {
    expect(diaDeTrabajoAdmitido(HOY, HOY)).toBe(true);
    expect(diaDeTrabajoAdmitido(AYER, HOY)).toBe(true);
    expect(diaDeTrabajoAdmitido('2026-10-07', HOY)).toBe(true);   // justo en el borde: 7 días
  });

  it('EL FUTURO NUNCA', () => {
    // Escribir carga en un día que no llegó es inventarla.
    expect(diaDeTrabajoAdmitido('2026-10-15', HOY)).toBe(false);
    expect(diaDeTrabajoAdmitido('2026-12-31', HOY)).toBe(false);
  });

  it('más atrás que la ventana, no', () => {
    expect(diaDeTrabajoAdmitido('2026-10-06', HOY)).toBe(false);
    expect(diaDeTrabajoAdmitido('2026-09-13', HOY)).toBe(false);
  });

  it('cruza el mes y el año sin equivocarse', () => {
    expect(diaDeTrabajoAdmitido('2026-09-30', '2026-10-01')).toBe(true);
    expect(diaDeTrabajoAdmitido('2025-12-31', '2026-01-02')).toBe(true);
    expect(diaDeTrabajoAdmitido('2026-01-02', '2025-12-31')).toBe(false);  // futuro
  });

  it('lo que no es una fecha, no', () => {
    for (const malo of ['', '13/10/2026', '2026-10-5', 'hoy', null, undefined]) {
      expect(diaDeTrabajoAdmitido(malo, HOY)).toBe(false);
    }
    expect(diaDeTrabajoAdmitido(AYER, 'hoy')).toBe(false);
  });

  it('la ventana se puede acortar', () => {
    expect(diaDeTrabajoAdmitido('2026-10-10', HOY, 2)).toBe(false);
    expect(diaDeTrabajoAdmitido('2026-10-12', HOY, 2)).toBe(true);
    expect(MAX_DIAS_ATRAS).toBe(7);
  });
});

describe('resolverDiaDeTrabajo', () => {
  it('ante cualquier duda, HOY', () => {
    expect(resolverDiaDeTrabajo(null, HOY)).toBe(HOY);
    expect(resolverDiaDeTrabajo('2026-10-15', HOY)).toBe(HOY);   // futuro
    expect(resolverDiaDeTrabajo('cualquiera', HOY)).toBe(HOY);
    expect(resolverDiaDeTrabajo('2026-01-01', HOY)).toBe(HOY);   // fuera de la ventana
  });

  it('un día admitido se respeta', () => {
    expect(resolverDiaDeTrabajo(AYER, HOY)).toBe(AYER);
    expect(resolverDiaDeTrabajo(` ${AYER} `, HOY)).toBe(AYER);
  });
});

describe('esOtroDia', () => {
  it('solo cuando de verdad es otro', () => {
    expect(esOtroDia(AYER, HOY)).toBe(true);
    expect(esOtroDia(HOY, HOY)).toBe(false);
  });

  it('sin fecha válida no se avisa nada', () => {
    expect(esOtroDia(null, HOY)).toBe(false);
    expect(esOtroDia('', HOY)).toBe(false);
    expect(esOtroDia(AYER, '')).toBe(false);
  });
});

describe('diaEnPalabras', () => {
  it('lo dice como lo dice la gente', () => {
    // Se parte el ISO a mediodía: `new Date('2026-10-13')` es UTC y en Chile da el día anterior.
    expect(diaEnPalabras('2026-10-13')).toContain('13');
    expect(diaEnPalabras('2026-10-13').toLowerCase()).toContain('octubre');
  });

  it('lo que no es fecha, vacío', () => {
    expect(diaEnPalabras('')).toBe('');
    expect(diaEnPalabras('13/10/2026')).toBe('');
  });
});

describe('urlConDia', () => {
  it('pone el día y lo saca', () => {
    expect(urlConDia('/despacho/santiago', AYER)).toBe('/despacho/santiago?dia=2026-10-13');
    expect(urlConDia('/despacho/santiago', null)).toBe('/despacho/santiago');
  });

  it('no acumula parámetros al cambiar de día', () => {
    expect(urlConDia('/despacho/santiago?dia=2026-10-12', AYER)).toBe('/despacho/santiago?dia=2026-10-13');
    expect(urlConDia('/despacho/santiago?dia=2026-10-12', null)).toBe('/despacho/santiago');
  });
});
