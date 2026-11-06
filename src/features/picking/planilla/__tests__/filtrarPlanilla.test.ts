import { describe, it, expect } from 'vitest';
import {
  calza, contarPorZona, describirFiltro, filtrarMovimientos, filtrarPlanilla,
  FILTRO_VACIO, sinFiltro, sumaRegistros, type FiltroPlanilla,
} from '../filtrarPlanilla';
import { armarPlanilla, type MovimientoPlanilla } from '../armarPlanilla';
import type { ZonaPlanilla } from '../zonaPlanilla';

function f(p: Partial<FiltroPlanilla> = {}): FiltroPlanilla {
  return { texto: '', zonas: new Set(), ...p };
}

function mov(p: Partial<MovimientoPlanilla> = {}): MovimientoPlanilla {
  return {
    cod: '38SP2', seccion: 'Hogar', registros: 10, picker: 'Marcelo Vergara',
    asignadoEn: '2026-11-05 11:00:00', validadoEn: null, estado: 'assigned', ...p,
  };
}

// Un día chico con una tienda por zona, más una segunda de la RM para poder distinguir
// «una zona» de «una tienda».
const TIENDAS: Array<{ cod: string; zona: ZonaPlanilla }> = [
  { cod: '24SPP', zona: 'norte' },
  { cod: '31TLC', zona: 'sur' },
  { cod: '27MCH', zona: 'costa' },
  { cod: '23PEÑ', zona: 'mall' },
  { cod: '38SP2', zona: 'rm' },
  { cod: '75PUC', zona: 'rm' },
];

const NOMBRES = new Map([
  ['24SPP', 'San Pedro'],
  ['23PEÑ', 'Mall Peñalolén'],
  ['38SP2', 'San Pablo 2'],
]);

const ZONA_POR_COD = new Map(TIENDAS.map(t => [t.cod, t.zona]));

function dia() {
  return armarPlanilla([
    mov({ cod: '24SPP', seccion: 'Comida', registros: 111 }),
    mov({ cod: '31TLC', seccion: 'Hogar',  registros: 100 }),
    mov({ cod: '27MCH', seccion: 'Comida', registros: 134 }),
    mov({ cod: '23PEÑ', seccion: 'Aseo',   registros: 24 }),
    mov({ cod: '38SP2', seccion: 'Hogar',  registros: 63 }),
    mov({ cod: '75PUC', seccion: 'Hogar',  registros: 7 }),
    // Dos descartados y uno de una tienda que no es del día: los contadores del pie.
    mov({ cod: '38SP2', seccion: 'Comida', estado: 'cancel' }),
    mov({ cod: '38SP2', seccion: 'Comida', estado: 'confirmed' }),
    mov({ cod: '99XXX', seccion: 'Comida' }),
  ], TIENDAS);
}

describe('sinFiltro', () => {
  it('el filtro vacío no filtra', () => {
    expect(sinFiltro(FILTRO_VACIO)).toBe(true);
  });

  it('solo espacios tampoco filtra', () => {
    expect(sinFiltro(f({ texto: '   ' }))).toBe(true);
  });

  it('una zona elegida sí filtra', () => {
    expect(sinFiltro(f({ zonas: new Set<ZonaPlanilla>(['norte']) }))).toBe(false);
  });
});

describe('calza: el texto', () => {
  it('encuentra por código completo', () => {
    expect(calza(f({ texto: '38SP2' }), { cod: '38SP2', zona: 'rm' })).toBe(true);
  });

  it('encuentra por un trozo del código', () => {
    expect(calza(f({ texto: 'sp2' }), { cod: '38SP2', zona: 'rm' })).toBe(true);
    expect(calza(f({ texto: '38' }), { cod: '38SP2', zona: 'rm' })).toBe(true);
  });

  it('no encuentra lo que no está', () => {
    expect(calza(f({ texto: 'ZZZ' }), { cod: '38SP2', zona: 'rm' })).toBe(false);
  });

  it('da igual mayúsculas y espacios al borde', () => {
    expect(calza(f({ texto: '  sP2  ' }), { cod: '38SP2', zona: 'rm' })).toBe(true);
  });

  it('escribir «pen» encuentra 23PEÑ', () => {
    // Es el punto del buscador: nadie va a ir a buscar la Ñ al teclado para filtrar una fila.
    expect(calza(f({ texto: 'pen' }), { cod: '23PEÑ', zona: 'mall' })).toBe(true);
  });

  it('escribir «PEÑ» también encuentra 23PEÑ', () => {
    expect(calza(f({ texto: 'PEÑ' }), { cod: '23PEÑ', zona: 'mall' })).toBe(true);
  });

  it('encuentra por el nombre de la tienda, con y sin tilde', () => {
    expect(calza(f({ texto: 'peñalolen' }), { cod: '23PEÑ', zona: 'mall', nombre: 'Mall Peñalolén' })).toBe(true);
    expect(calza(f({ texto: 'penalolen' }), { cod: '23PEÑ', zona: 'mall', nombre: 'Mall Peñalolén' })).toBe(true);
    expect(calza(f({ texto: 'san pablo' }), { cod: '38SP2', zona: 'rm', nombre: 'San Pablo 2' })).toBe(true);
  });

  it('sin nombre, busca solo por código y no se cae', () => {
    expect(calza(f({ texto: 'pablo' }), { cod: '38SP2', zona: 'rm' })).toBe(false);
    expect(calza(f({ texto: 'pablo' }), { cod: '38SP2', zona: 'rm', nombre: null })).toBe(false);
  });
});

describe('calza: las zonas', () => {
  it('vacío es TODAS, no ninguna', () => {
    for (const z of ['norte', 'sur', 'costa', 'mall', 'rm'] as ZonaPlanilla[]) {
      expect(calza(f(), { cod: 'X', zona: z })).toBe(true);
    }
  });

  it('una zona deja pasar solo esa', () => {
    const solo = f({ zonas: new Set<ZonaPlanilla>(['norte']) });
    expect(calza(solo, { cod: 'X', zona: 'norte' })).toBe(true);
    expect(calza(solo, { cod: 'X', zona: 'sur' })).toBe(false);
  });

  it('dos zonas son la unión de las dos', () => {
    const dos = f({ zonas: new Set<ZonaPlanilla>(['norte', 'costa']) });
    expect(calza(dos, { cod: 'X', zona: 'norte' })).toBe(true);
    expect(calza(dos, { cod: 'X', zona: 'costa' })).toBe(true);
    expect(calza(dos, { cod: 'X', zona: 'rm' })).toBe(false);
  });

  it('una tienda sin zona queda fuera si hay filtro de zona', () => {
    expect(calza(f({ zonas: new Set<ZonaPlanilla>(['norte']) }), { cod: '99XXX' })).toBe(false);
  });

  it('una tienda sin zona entra si solo hay texto', () => {
    expect(calza(f({ texto: '99' }), { cod: '99XXX' })).toBe(true);
  });

  it('texto y zona se exigen LOS DOS', () => {
    const ambos = f({ texto: 'sp2', zonas: new Set<ZonaPlanilla>(['norte']) });
    expect(calza(ambos, { cod: '38SP2', zona: 'rm' })).toBe(false);    // el texto calza, la zona no
    expect(calza(ambos, { cod: '24SPP', zona: 'norte' })).toBe(false); // la zona calza, el texto no
    expect(calza(ambos, { cod: '38SP2', zona: 'norte' })).toBe(true);  // los dos
  });
});

describe('filtrarPlanilla', () => {
  it('sin filtro devuelve EL MISMO objeto', () => {
    // Una copia nueva en cada render volvería a dibujar la tabla sin que nada haya cambiado.
    const p = dia();
    expect(filtrarPlanilla(p, FILTRO_VACIO)).toBe(p);
  });

  it('una zona deja solo sus tiendas', () => {
    const out = filtrarPlanilla(dia(), f({ zonas: new Set<ZonaPlanilla>(['rm']) }));
    expect(out.filas.map(x => x.cod)).toEqual(['38SP2', '75PUC']);
  });

  it('el texto deja solo las que calzan, por código o por nombre', () => {
    expect(filtrarPlanilla(dia(), f({ texto: 'sp' })).filas.map(x => x.cod))
      .toEqual(['24SPP', '38SP2']);
    expect(filtrarPlanilla(dia(), f({ texto: 'penalolen' }), NOMBRES).filas.map(x => x.cod))
      .toEqual(['23PEÑ']);
  });

  it('los TOTALES se recalculan con lo que queda a la vista', () => {
    const todo = dia();
    expect(todo.totales.Hogar).toBe(100 + 63 + 7);
    const out = filtrarPlanilla(todo, f({ zonas: new Set<ZonaPlanilla>(['rm']) }));
    expect(out.totales.Hogar).toBe(63 + 7);
    expect(out.totales.Comida).toBe(0);
  });

  it('los contadores del pie NO se tocan: son del día entero', () => {
    // Si se filtrara antes de armar, las tiendas escondidas aparecerían como «fuera del
    // calendario», que es justo el contador que avisa de un problema real.
    const todo = dia();
    const out = filtrarPlanilla(todo, f({ zonas: new Set<ZonaPlanilla>(['norte']) }));
    expect(out.descartados).toEqual(todo.descartados);
    expect(out.descartados.anulados).toBe(1);
    expect(out.descartados.sinLiberar).toBe(1);
    expect(out.fueraDelCalendario).toBe(todo.fueraDelCalendario);
    expect(out.fueraDelCalendario).toBe(1);
  });

  it('un filtro que no calza nada da cero filas, no la hoja entera', () => {
    const out = filtrarPlanilla(dia(), f({ texto: 'nada-de-esto' }));
    expect(out.filas).toHaveLength(0);
    expect(sumaRegistros(out)).toBe(0);
  });
});

describe('filtrarMovimientos', () => {
  const movs = [
    mov({ cod: '24SPP', seccion: 'Comida' }),
    mov({ cod: '38SP2', seccion: 'Hogar' }),
    mov({ cod: '23PEÑ', seccion: 'Aseo' }),
    mov({ cod: '99XXX', seccion: 'Comida' }),
  ];

  it('sin filtro devuelve la misma lista', () => {
    expect(filtrarMovimientos(movs, FILTRO_VACIO, ZONA_POR_COD)).toBe(movs);
  });

  it('filtra por zona con el mapa de tiendas', () => {
    const out = filtrarMovimientos(movs, f({ zonas: new Set<ZonaPlanilla>(['rm']) }), ZONA_POR_COD);
    expect(out.map(m => m.cod)).toEqual(['38SP2']);
  });

  it('filtra por texto sin acentos', () => {
    const out = filtrarMovimientos(movs, f({ texto: 'pen' }), ZONA_POR_COD);
    expect(out.map(m => m.cod)).toEqual(['23PEÑ']);
  });

  it('un movimiento de una tienda que no es del día: fuera con zona, dentro con texto', () => {
    expect(filtrarMovimientos(movs, f({ zonas: new Set<ZonaPlanilla>(['rm']) }), ZONA_POR_COD)
      .some(m => m.cod === '99XXX')).toBe(false);
    expect(filtrarMovimientos(movs, f({ texto: '99XXX' }), ZONA_POR_COD)
      .map(m => m.cod)).toEqual(['99XXX']);
  });
});

describe('describirFiltro', () => {
  it('sin filtro, texto vacío', () => {
    expect(describirFiltro(FILTRO_VACIO)).toBe('');
  });

  it('nombra la zona con la misma etiqueta de la pastilla', () => {
    expect(describirFiltro(f({ zonas: new Set<ZonaPlanilla>(['norte']) }))).toBe('Ruta Norte');
  });

  it('el orden de las zonas NO depende del orden en que se tocaron', () => {
    // Un Set conserva el orden de inserción: sin ordenar por ZONAS, el mismo filtro se
    // describiría distinto según en qué orden se hizo clic, y eso va impreso en el papel.
    const a = describirFiltro(f({ zonas: new Set<ZonaPlanilla>(['rm', 'norte']) }));
    const b = describirFiltro(f({ zonas: new Set<ZonaPlanilla>(['norte', 'rm']) }));
    expect(a).toBe(b);
    expect(a).toBe('Ruta Norte + Stripcenter');
  });

  it('junta zona y texto', () => {
    expect(describirFiltro(f({ texto: ' sp2 ', zonas: new Set<ZonaPlanilla>(['rm']) })))
      .toBe('Stripcenter · «sp2»');
  });

  it('solo texto', () => {
    expect(describirFiltro(f({ texto: 'peñ' }))).toBe('«peñ»');
  });
});

describe('contarPorZona', () => {
  it('cuenta las tiendas de cada zona y deja en cero las que no hay', () => {
    expect(contarPorZona(dia())).toEqual({ norte: 1, sur: 1, costa: 1, mall: 1, rm: 2 });
  });

  it('las cinco zonas están siempre, aunque el día no tenga ninguna', () => {
    const vacia = armarPlanilla([], []);
    expect(contarPorZona(vacia)).toEqual({ norte: 0, sur: 0, costa: 0, mall: 0, rm: 0 });
  });
});

describe('sumaRegistros', () => {
  it('suma las cuatro secciones', () => {
    expect(sumaRegistros(dia())).toBe(111 + 100 + 134 + 24 + 63 + 7);
  });
});

describe('calza: por nombre del picker', () => {
  it('encuentra por el nombre de quien pickeó', () => {
    expect(calza(f({ texto: 'marcelo' }),
      { cod: '50PTM', zona: 'rm', pickers: ['Marcelo Vergara'] })).toBe(true);
  });

  it('también por el apellido, y sin tilde', () => {
    // «simon» tiene que encontrar a «Simón Sabathier»: nadie va a buscar la tilde en el teclado.
    expect(calza(f({ texto: 'sabathier' }), { cod: '43CUR', pickers: ['Simón Sabathier'] })).toBe(true);
    expect(calza(f({ texto: 'simon' }),     { cod: '43CUR', pickers: ['Simón Sabathier'] })).toBe(true);
  });

  it('una fila con varios pickers calza con cualquiera de ellos', () => {
    const c = { cod: '50PTM', zona: 'rm' as const, pickers: ['Zervens Louissant', 'Marcelo Vergara'] };
    expect(calza(f({ texto: 'zervens' }), c)).toBe(true);
    expect(calza(f({ texto: 'vergara' }), c)).toBe(true);
    expect(calza(f({ texto: 'juliette' }), c)).toBe(false);
  });

  it('sin pickers no se cae', () => {
    expect(calza(f({ texto: 'marcelo' }), { cod: '75PUC' })).toBe(false);
    expect(calza(f({ texto: 'marcelo' }), { cod: '75PUC', pickers: [] })).toBe(false);
  });

  it('el filtro de zona se sigue exigiendo igual', () => {
    const solo = f({ texto: 'marcelo', zonas: new Set<ZonaPlanilla>(['norte']) });
    expect(calza(solo, { cod: '50PTM', zona: 'rm',    pickers: ['Marcelo Vergara'] })).toBe(false);
    expect(calza(solo, { cod: '24SPP', zona: 'norte', pickers: ['Marcelo Vergara'] })).toBe(true);
  });
});

describe('filtrarPlanilla: buscar un picker trae la fila entera', () => {
  // La pregunta real es «qué tiendas tocó Marcelo», así que la fila va completa: recortada a su
  // celda no se podría comparar con el resto del día.
  const dia = () => armarPlanilla([
    mov({ cod: '24SPP', seccion: 'Comida', picker: 'Marcelo Vergara', registros: 111 }),
    mov({ cod: '24SPP', seccion: 'Hogar',  picker: 'Juliette Mendoza', registros: 40 }),
    mov({ cod: '31TLC', seccion: 'Hogar',  picker: 'Marcelo Vergara', registros: 100 }),
    mov({ cod: '27MCH', seccion: 'Comida', picker: 'Simón Sabathier', registros: 134 }),
  ], TIENDAS);

  it('deja las tiendas donde trabajó, y solo esas', () => {
    const out = filtrarPlanilla(dia(), f({ texto: 'marcelo' }));
    expect(out.filas.map(x => x.cod)).toEqual(['24SPP', '31TLC']);
  });

  it('la fila trae TODAS sus secciones, no solo la del picker buscado', () => {
    const out = filtrarPlanilla(dia(), f({ texto: 'marcelo' }));
    const spp = out.filas.find(x => x.cod === '24SPP')!;
    expect(spp.celdas.Comida[0].picker).toBe('Marcelo Vergara');
    expect(spp.celdas.Hogar[0].picker).toBe('Juliette Mendoza');
  });

  it('los totales se recalculan con las filas que quedan, enteras', () => {
    const out = filtrarPlanilla(dia(), f({ texto: 'marcelo' }));
    expect(out.totales.Comida).toBe(111);
    expect(out.totales.Hogar).toBe(40 + 100);   // incluye la celda de Juliette: la fila va entera
  });

  it('buscar por picker sin acento encuentra igual', () => {
    expect(filtrarPlanilla(dia(), f({ texto: 'simon' })).filas.map(x => x.cod)).toEqual(['27MCH']);
  });
});

describe('filtrarMovimientos: por picker', () => {
  it('deja solo los movimientos de esa persona', () => {
    const movs = [
      mov({ cod: '24SPP', picker: 'Marcelo Vergara' }),
      mov({ cod: '31TLC', picker: 'Juliette Mendoza' }),
      mov({ cod: '27MCH', picker: 'Marcelo Vergara' }),
    ];
    const out = filtrarMovimientos(movs, f({ texto: 'vergara' }), ZONA_POR_COD);
    expect(out.map(m => m.cod)).toEqual(['24SPP', '27MCH']);
  });
});
