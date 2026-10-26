import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { decidirDiaDeTrabajo, type DiaFijado } from '../diaDeTrabajo';

const HOY = '2026-10-19';   // lunes
const VIERNES = '2026-10-16';
const JUEVES = '2026-10-15';

describe('decidirDiaDeTrabajo · la primera pieza fija el día', () => {
  it('sin `?dia=`, fija hoy', () => {
    const d = decidirDiaDeTrabajo(null, null, HOY);
    expect(d).toEqual({ dia: HOY, fijar: { dia: HOY, pedido: null }, recargar: false });
  });

  it('con un `?dia=` admisible, fija ese día', () => {
    const d = decidirDiaDeTrabajo(null, VIERNES, HOY);
    expect(d).toEqual({ dia: VIERNES, fijar: { dia: VIERNES, pedido: VIERNES }, recargar: false });
  });

  it('un día del futuro cae en hoy, y el pedido crudo queda guardado tal cual', () => {
    const d = decidirDiaDeTrabajo(null, '2026-10-25', HOY);
    expect(d.dia).toBe(HOY);
    expect(d.fijar).toEqual({ dia: HOY, pedido: '2026-10-25' });
    expect(d.recargar).toBe(false);
  });
});

describe('decidirDiaDeTrabajo · las demás piezas heredan', () => {
  const fijado: DiaFijado = { dia: VIERNES, pedido: VIERNES };

  it('con la misma URL, devuelve el fijado y no vuelve a fijar', () => {
    expect(decidirDiaDeTrabajo(fijado, VIERNES, HOY))
      .toEqual({ dia: VIERNES, fijar: null, recargar: false });
  });

  it('EL BUG DEL 19/10: un módulo que se evalúa después, ya sin `?dia=`, NO se lleva hoy', () => {
    // Es el caso exacto que escribió seis filas con fecha de hoy y los conteos del viernes:
    // `AppContext` se fijó en el viernes y `TiendasPage` —chunk dinámico— se evaluó con la URL
    // ya sin el día. Antes devolvía HOY y `pushCounts` escribía ahí.
    const d = decidirDiaDeTrabajo(fijado, null, HOY);
    expect(d.dia).toBe(VIERNES);
    expect(d.recargar).toBe(true);
  });

  it('y al revés: fijado en hoy, un módulo tardío con `?dia=` viejo tampoco se mueve solo', () => {
    const enHoy: DiaFijado = { dia: HOY, pedido: null };
    const d = decidirDiaDeTrabajo(enHoy, VIERNES, HOY);
    expect(d.dia).toBe(HOY);
    expect(d.recargar).toBe(true);
  });

  it('cambiar de un día viejo a otro también recarga', () => {
    const d = decidirDiaDeTrabajo(fijado, JUEVES, HOY);
    expect(d.dia).toBe(VIERNES);
    expect(d.recargar).toBe(true);
  });
});

describe('decidirDiaDeTrabajo · sin bucles de recarga', () => {
  it('un pedido distinto que RESUELVE al mismo día no recarga', () => {
    // Fijado en hoy sin `?dia=`. Llega un `?dia=` del futuro: resuelve a hoy igual. Si se
    // comparara el crudo, recargaría; y tras recargar volvería a diferir, para siempre.
    const enHoy: DiaFijado = { dia: HOY, pedido: null };
    expect(decidirDiaDeTrabajo(enHoy, '2026-12-01', HOY).recargar).toBe(false);
    expect(decidirDiaDeTrabajo(enHoy, 'basura', HOY).recargar).toBe(false);
    expect(decidirDiaDeTrabajo(enHoy, '2026-01-01', HOY).recargar).toBe(false);  // fuera de ventana
  });

  it('el mismo día escrito con espacios de más no es un cambio', () => {
    const f: DiaFijado = { dia: VIERNES, pedido: VIERNES };
    expect(decidirDiaDeTrabajo(f, `  ${VIERNES}  `, HOY).recargar).toBe(false);
  });

  it('`null`, cadena vacía y solo espacios son el mismo «sin pedido»', () => {
    const f: DiaFijado = { dia: HOY, pedido: null };
    for (const vacio of [null, undefined, '', '   ']) {
      expect(decidirDiaDeTrabajo(f, vacio, HOY).recargar).toBe(false);
    }
  });
});

describe('decidirDiaDeTrabajo · la medianoche no recarga', () => {
  it('una pestaña abierta que cruza el día se queda en el suyo', () => {
    // Quedó abierta el domingo; ahora «hoy» es lunes. La URL no cambió, así que no se recarga:
    // de eso avisa `AvisoDiaViejo` (#722). Recargar le borraría la pantalla a quien esté pesando.
    const f: DiaFijado = { dia: '2026-10-18', pedido: null };
    const d = decidirDiaDeTrabajo(f, null, HOY);
    expect(d.dia).toBe('2026-10-18');
    expect(d.recargar).toBe(false);
  });
});

describe('diaDeTrabajoActual · el singleton del navegador', () => {
  let mod: typeof import('../diaDeTrabajoActual');
  const recargar = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    // El singleton toma «hoy» del reloj. Sin fijarlo, VIERNES quedó fuera de los días hacia atrás
    // que se aceptan y la prueba empezó a fallar sola el 26/10/2026.
    vi.setSystemTime(new Date(`${HOY}T15:00:00Z`));
    recargar.mockClear();
    vi.stubGlobal('window', { location: { search: '', reload: recargar } });
    mod = await import('../diaDeTrabajoActual');
    mod.__reiniciarDiaFijado();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  const conURL = (search: string) => { (globalThis as { window: { location: { search: string } } }).window.location.search = search; };

  it('la segunda llamada hereda el día de la primera, aunque la URL ya no lo traiga', () => {
    conURL(`?dia=${VIERNES}`);
    const primero = mod.diaDeTrabajoActual();
    conURL('');
    expect(mod.diaDeTrabajoActual()).toBe(primero);
  });

  it('y pide recargar una sola vez, por más veces que se pregunte', () => {
    conURL(`?dia=${VIERNES}`);
    mod.diaDeTrabajoActual();
    conURL('');
    mod.diaDeTrabajoActual();
    mod.diaDeTrabajoActual();
    mod.diaDeTrabajoActual();
    vi.runAllTimers();
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('no recarga mientras la URL no cambie', () => {
    conURL(`?dia=${VIERNES}`);
    mod.diaDeTrabajoActual();
    mod.diaDeTrabajoActual();
    vi.runAllTimers();
    expect(recargar).not.toHaveBeenCalled();
  });

  it('«lo eligió alguien» sale del valor fijado, no de la URL del momento', () => {
    conURL(`?dia=${VIERNES}`);
    expect(mod.diaDeTrabajoEsDeliberado()).toBe(true);
    conURL('');
    expect(mod.diaDeTrabajoEsDeliberado()).toBe(true);   // la banda sigue diciendo la verdad
  });
});
