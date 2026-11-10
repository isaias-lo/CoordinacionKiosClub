import { describe, it, expect } from 'vitest';
import { avanceAsignacion } from '../avanceAsignacion';
import type { MovimientoPlanilla, SeccionPlanilla } from '../armarPlanilla';

function mov(p: Partial<MovimientoPlanilla> = {}): MovimientoPlanilla {
  return {
    cod: '57CAS', seccion: 'Comida', registros: 12, picker: 'Diego Farr',
    cuenta: 'Pickers 11', asignadoEn: '2026-11-10 09:00:00', validadoEn: null,
    estado: 'assigned', ...p,
  };
}
/** Un movimiento sin dueño: es lo que la pantalla cuenta como «falta por asignar». */
function libre(p: Partial<MovimientoPlanilla> = {}): MovimientoPlanilla {
  return mov({ picker: '', cuenta: undefined, asignadoEn: null, ...p });
}

describe('avanceAsignacion: la cuenta', () => {
  it('separa los que tienen dueño de los que no', () => {
    const a = avanceAsignacion([mov(), mov(), libre()]);
    expect(a.total).toBe(3);
    expect(a.asignados).toBe(2);
    expect(a.sinAsignar).toBe(1);
  });

  it('un nombre de puros espacios no es un dueño', () => {
    // Odoo puede devolver el responsable vacío y `desdeOdoo` lo deja en ''. Un espacio suelto
    // haría que el movimiento se cuente como asignado y desaparezca de lo que falta.
    expect(avanceAsignacion([mov({ picker: '   ' })]).sinAsignar).toBe(1);
    expect(avanceAsignacion([mov({ picker: '\t' })]).sinAsignar).toBe(1);
  });

  it('el estado no decide: lo que decide es si tiene nombre', () => {
    // Medido en Odoo el 10/11/2026: los 18 sin responsable del día estaban TODOS en `assigned`,
    // y los 2 del 09/11 también. Un `done` sin nombre no se vio nunca — pero si apareciera hay
    // que verlo, porque una celda sin nombre tampoco se puede escribir en la hoja de olas.
    const a = avanceAsignacion([libre({ estado: 'done' }), libre({ estado: 'assigned' })]);
    expect(a.sinAsignar).toBe(2);
  });

  it('sin movimientos no explota', () => {
    const a = avanceAsignacion([]);
    expect(a).toMatchObject({ total: 0, asignados: 0, sinAsignar: 0 });
    expect(a.porSeccion).toEqual([]);
    expect(a.tiendas).toBe(0);
  });
});

describe('avanceAsignacion: el porcentaje', () => {
  it('todo asignado es 100', () => {
    expect(avanceAsignacion([mov(), mov()]).pct).toBe(100);
  });

  it('nada asignado es 0', () => {
    expect(avanceAsignacion([libre(), libre()]).pct).toBe(0);
  });

  it('NUNCA llega a 100 si todavía falta uno', () => {
    // 499 de 500 redondea a 100 y la barra se vería llena con trabajo sin repartir. Es el
    // error que vuelve inútil a un contador: decir que terminaste cuando no.
    const movs = [...Array(499).fill(0).map(() => mov()), libre()];
    const a = avanceAsignacion(movs);
    expect(a.sinAsignar).toBe(1);
    expect(a.pct).toBe(99);
    expect(a.pct).toBeLessThan(100);
  });

  it('NUNCA se queda en 0 si ya hay uno asignado', () => {
    // El espejo del anterior: 1 de 500 trunca a 0 y la barra se ve sin empezar.
    const movs = [mov(), ...Array(499).fill(0).map(() => libre())];
    const a = avanceAsignacion(movs);
    expect(a.asignados).toBe(1);
    expect(a.pct).toBe(1);
    expect(a.pct).toBeGreaterThan(0);
  });

  it('un día real: 171 de 189', () => {
    // Los números del 10/11/2026 a las 10:30, medidos contra Odoo.
    const movs = [...Array(171).fill(0).map(() => mov()), ...Array(18).fill(0).map(() => libre())];
    const a = avanceAsignacion(movs);
    expect(a).toMatchObject({ total: 189, asignados: 171, sinAsignar: 18, pct: 90 });
  });

  it('sin movimientos el porcentaje es 100, no 0', () => {
    // Un día vacío no es un día con todo por repartir. La pantalla igual muestra otra cosa.
    expect(avanceAsignacion([]).pct).toBe(100);
  });
});

describe('avanceAsignacion: dónde falta', () => {
  it('cuenta los que faltan por sección, en el orden de la hoja', () => {
    const a = avanceAsignacion([
      libre({ seccion: 'Hogar' }), libre({ seccion: 'Comida' }), libre({ seccion: 'Comida' }),
      libre({ seccion: 'Chocolates' }), mov({ seccion: 'Aseo' }),
    ]);
    expect(a.porSeccion).toEqual([
      { seccion: 'Comida', faltan: 2 },
      { seccion: 'Hogar', faltan: 1 },
      { seccion: 'Chocolates', faltan: 1 },
    ]);
  });

  it('una sección sin faltantes no aparece', () => {
    const a = avanceAsignacion([mov({ seccion: 'Aseo' }), libre({ seccion: 'Hogar' })]);
    expect(a.porSeccion.map(x => x.seccion)).toEqual(['Hogar']);
  });

  it('cuenta en cuántas TIENDAS distintas falta, no cuántos movimientos', () => {
    // «18 por asignar» y «18 tiendas» no es lo mismo que «18 por asignar en 3 tiendas»:
    // lo segundo dice a cuántos lugares hay que ir.
    const a = avanceAsignacion([
      libre({ cod: '57CAS', seccion: 'Comida' }),
      libre({ cod: '57CAS', seccion: 'Aseo' }),
      libre({ cod: '57CAS', seccion: 'Hogar' }),
      libre({ cod: '28TEM', seccion: 'Comida' }),
      mov({ cod: '60PBL' }),
    ]);
    expect(a.sinAsignar).toBe(4);
    expect(a.tiendas).toBe(2);
  });

  it('la tienda no se cuenta dos veces por diferencias de mayúsculas o espacios', () => {
    const a = avanceAsignacion([libre({ cod: '57CAS' }), libre({ cod: ' 57cas ' })]);
    expect(a.tiendas).toBe(1);
  });

  it('todo asignado: ni secciones ni tiendas', () => {
    const a = avanceAsignacion([mov(), mov({ seccion: 'Aseo' })]);
    expect(a.porSeccion).toEqual([]);
    expect(a.tiendas).toBe(0);
  });
});

describe('avanceAsignacion: no toca lo que recibe', () => {
  it('no reordena ni modifica la lista original', () => {
    const movs: MovimientoPlanilla[] = [libre({ seccion: 'Hogar' }), mov({ seccion: 'Comida' })];
    const copia = JSON.parse(JSON.stringify(movs));
    avanceAsignacion(movs);
    expect(movs).toEqual(copia);
  });

  it('una sección desconocida no rompe la cuenta', () => {
    // La lista de secciones está tipada, pero los datos vienen de Odoo: si algún día llega otra
    // cosa, tiene que sumar al total igual y no desaparecer sin aviso.
    const raro = libre({ seccion: 'Panadería' as unknown as SeccionPlanilla });
    const a = avanceAsignacion([raro, mov()]);
    expect(a.total).toBe(2);
    expect(a.sinAsignar).toBe(1);
  });
});
