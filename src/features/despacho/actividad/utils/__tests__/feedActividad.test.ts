import { describe, it, expect } from 'vitest';
import {
  esDiagnostico, esTrabajoDePersona, partirFeed, opcionesDeFiltro,
  avisoDeCorte, filtrarVisibles, porPersona, accionesPedidas, ACCIONES_DIAGNOSTICO,
} from '../feedActividad';
import { ACCIONES_ACTIVIDAD, type ActividadRow } from '@/lib/actividad';

let id = 0;
const fila = (p: Partial<ActividadRow>): ActividadRow => ({
  id: ++id, created_at: '2026-09-29T17:00:00Z', fecha: '2026-09-29',
  actor_id: 'u1', actor_name: 'Camila González', fuente: 'rmcosta',
  accion: 'registrar_item', tienda_cod: '01TPS', tienda_nombre: 'Trapenses',
  mensaje: '', detalle: null, ...p,
});

describe('qué es trabajo de una persona y qué es el sistema', () => {
  it('merge_descarte es del sistema, no de nadie', () => {
    // `lib/actividad.ts` lo dice en su propio comentario: "No es una acción de la persona — es el
    // sistema contándose a sí mismo". El 29/09 era el 68% de lo que se veía en pantalla.
    expect(esDiagnostico('merge_descarte')).toBe(true);
    expect(esTrabajoDePersona('merge_descarte')).toBe(false);
  });

  it('TODO lo demás que el sistema registra es trabajo de persona', () => {
    // Se afirma sobre la lista real, no sobre una copia: si mañana alguien agrega una acción a
    // `ACCIONES_ACTIVIDAD`, entra al feed sola. Solo el diagnóstico hay que declararlo a propósito.
    for (const a of ACCIONES_ACTIVIDAD) {
      if (ACCIONES_DIAGNOSTICO.includes(a)) continue;
      expect(esTrabajoDePersona(a)).toBe(true);
    }
  });

  it('las de diagnóstico son acciones que existen de verdad', () => {
    // Un nombre mal escrito acá no filtraría nada y nadie se enteraría.
    for (const a of ACCIONES_DIAGNOSTICO) {
      expect(ACCIONES_ACTIVIDAD as readonly string[]).toContain(a);
    }
  });
});

describe('partirFeed', () => {
  it('separa sin perder ni duplicar una fila', () => {
    const rows = [
      fila({ accion: 'registrar_item' }), fila({ accion: 'merge_descarte' }),
      fila({ accion: 'eliminar_item' }),  fila({ accion: 'merge_descarte' }),
    ];
    const { trabajo, diagnostico } = partirFeed(rows);
    expect(trabajo).toHaveLength(2);
    expect(diagnostico).toHaveLength(2);
    expect(trabajo.length + diagnostico.length).toBe(rows.length);
  });

  it('conserva el orden dentro de cada grupo', () => {
    const rows = [fila({ id: 10 }), fila({ id: 11 }), fila({ id: 12 })];
    expect(partirFeed(rows).trabajo.map(r => r.id)).toEqual([10, 11, 12]);
  });
});

describe('opcionesDeFiltro', () => {
  it('incluye a quien SOLO aparece en una fila de diagnóstico', () => {
    // Si se armaran solo con lo visible, esa persona no existiría para el filtro y no habría forma
    // de llegar a ella. El desplegable es para buscar, no para reflejar lo que ya se ve.
    const rows = [
      fila({ actor_name: 'Camila González', accion: 'registrar_item' }),
      fila({ actor_name: 'Mildred', accion: 'merge_descarte', tienda_cod: '33CON' }),
    ];
    const { usuarios, tiendas } = opcionesDeFiltro(rows);
    expect(usuarios).toContain('Mildred');
    expect(tiendas).toContain('33CON');
  });

  it('no repite y ordena en español', () => {
    const rows = [
      fila({ actor_name: 'Ñuñoa' }), fila({ actor_name: 'Ana' }),
      fila({ actor_name: 'Ana' }),   fila({ actor_name: 'Bayron' }),
    ];
    expect(opcionesDeFiltro(rows).usuarios).toEqual(['Ana', 'Bayron', 'Ñuñoa']);
  });

  it('ignora los vacíos en vez de ofrecer una opción en blanco', () => {
    const rows = [fila({ actor_name: null, tienda_cod: null }), fila({})];
    const { usuarios, tiendas } = opcionesDeFiltro(rows);
    expect(usuarios).toEqual(['Camila González']);
    expect(tiendas).toEqual(['01TPS']);
  });
});

describe('avisoDeCorte — el modo de falla real', () => {
  it('avisa cuando hay más de lo que se muestra', () => {
    // El 29/09: 672 eventos, 200 en pantalla. La lista terminaba sola y eso se lee como
    // "no hubo más", que es falso.
    const a = avisoDeCorte(200, 672);
    expect(a).not.toBeNull();
    expect(a).toContain('200');
    expect(a).toContain('672');
    expect(a).toContain('472');   // los que faltan, dichos explícitamente
  });

  it('no molesta cuando está completo', () => {
    expect(avisoDeCorte(250, 250)).toBeNull();
    expect(avisoDeCorte(250, 3)).toBeNull();
  });

  it('sin total conocido no inventa un aviso', () => {
    expect(avisoDeCorte(200, null)).toBeNull();
  });
});

describe('filtrarVisibles', () => {
  const rows = [
    fila({ actor_name: 'Camila González', tienda_cod: '01TPS', accion: 'registrar_item' }),
    fila({ actor_name: 'Mildred',         tienda_cod: '33CON', accion: 'registrar_item' }),
    fila({ actor_name: 'Camila González', tienda_cod: '01TPS', accion: 'merge_descarte' }),
  ];
  const base = { usuario: '', tienda: '', verDiagnostico: false };

  it('por defecto el diagnóstico NO se ve', () => {
    expect(filtrarVisibles(rows, base)).toHaveLength(2);
  });

  it('con el interruptor puesto, se ve todo', () => {
    expect(filtrarVisibles(rows, { ...base, verDiagnostico: true })).toHaveLength(3);
  });

  it('los filtros se combinan, no se pisan', () => {
    expect(filtrarVisibles(rows, { ...base, usuario: 'Camila González' })).toHaveLength(1);
    expect(filtrarVisibles(rows, { ...base, tienda: '33CON' })).toHaveLength(1);
    expect(filtrarVisibles(rows, { ...base, usuario: 'Mildred', tienda: '01TPS' })).toHaveLength(0);
  });

  it('el diagnóstico sigue oculto aunque se filtre por su autor', () => {
    expect(filtrarVisibles(rows, { ...base, usuario: 'Camila González' })).toHaveLength(1);
  });
});

describe('porPersona', () => {
  it('cuenta solo el trabajo, no el diagnóstico', () => {
    // Si contara los merge_descarte, una persona con mala señal parecería la más productiva.
    const rows = [
      fila({ actor_name: 'Ana' }), fila({ actor_name: 'Ana' }),
      fila({ actor_name: 'Bayron' }),
      fila({ actor_name: 'Bayron', accion: 'merge_descarte' }),
      fila({ actor_name: 'Bayron', accion: 'merge_descarte' }),
      fila({ actor_name: 'Bayron', accion: 'merge_descarte' }),
    ];
    expect(porPersona(rows)).toEqual([{ nombre: 'Ana', n: 2 }, { nombre: 'Bayron', n: 1 }]);
  });

  it('sin nombre no desaparece del conteo', () => {
    expect(porPersona([fila({ actor_name: null })])).toEqual([{ nombre: 'Sin nombre', n: 1 }]);
  });
});

describe('accionesPedidas — lo que se le pide al servidor', () => {
  it('sin diagnóstico, no lo trae siquiera', () => {
    // El filtro es del SERVIDOR: traer 672 filas para mostrar 250 gastaría el cupo en lo que no se
    // va a ver, que es exactamente lo que dejaba la mañana afuera.
    const pedidas = accionesPedidas(ACCIONES_ACTIVIDAD, false);
    expect(pedidas).not.toContain('merge_descarte');
    expect(pedidas).toContain('registrar_item');
  });

  it('con diagnóstico, las pide todas', () => {
    expect(accionesPedidas(ACCIONES_ACTIVIDAD, true)).toHaveLength(ACCIONES_ACTIVIDAD.length);
  });
});
