import { describe, it, expect } from 'vitest';
import { reingresosDelDia, medirDia, medirDias, type EventoBodega } from '../reingresosBodega';

const D = '2026-09-17';
let n = 0;
/** Un evento. `hora` en "HH:MM:SS" del día D. */
const ev = (event_type: string, store_cod: string, hora: string, extra: Partial<EventoBodega> = {}): EventoBodega => ({
  date: D, event_type, store_cod, tipo: 'PA', pallet_id: ++n,
  created_at: `${D}T${hora}-03:00`, ...extra,
});

describe('un reingreso es una baja seguida de un alta en la misma tienda y tipo', () => {
  it('eliminar y volver a crear cuenta uno, con su brecha', () => {
    const r = reingresosDelDia([ev('eliminar', '04PDG', '21:17:20'), ev('crear', '04PDG', '21:22:20')]);
    expect(r).toEqual([{ tienda: '04PDG', tipo: 'PA', minutos: 5 }]);
  });

  it('el caso real del 15/09: borrado y recreado 5 segundos después', () => {
    const r = reingresosDelDia([ev('eliminar', '04PDG', '21:17:20'), ev('crear', '04PDG', '21:17:25')]);
    expect(r).toHaveLength(1);
    expect(r[0].minutos).toBe(0);
  });

  it('crear sin una baja antes es trabajo nuevo, no reingreso', () => {
    expect(reingresosDelDia([ev('crear', '04PDG', '08:00:00'), ev('crear', '04PDG', '08:05:00')])).toEqual([]);
  });

  it('eliminar sin un alta después es una baja definitiva, no reingreso', () => {
    expect(reingresosDelDia([ev('crear', '04PDG', '08:00:00'), ev('eliminar', '04PDG', '08:05:00')])).toEqual([]);
  });
});

describe('el ámbito del emparejamiento', () => {
  it('no cruza tiendas', () => {
    expect(reingresosDelDia([ev('eliminar', '04PDG', '08:00:00'), ev('crear', '09LEO', '08:01:00')])).toEqual([]);
  });

  it('no cruza tipos', () => {
    const e = [ev('eliminar', '04PDG', '08:00:00'), ev('crear', '04PDG', '08:01:00', { tipo: 'CH' })];
    expect(reingresosDelDia(e)).toEqual([]);
  });

  it('el código de tienda se normaliza antes de agrupar', () => {
    const e = [ev('eliminar', ' 04pdg ', '08:00:00'), ev('crear', '04PDG', '08:01:00')];
    expect(reingresosDelDia(e)).toHaveLength(1);
  });
});

describe('restaurar cancela la baja: volvió con su id, nadie la tecleó de nuevo', () => {
  it('la baja restaurada no se empareja con el alta siguiente', () => {
    const e: EventoBodega[] = [
      { ...ev('eliminar', '04PDG', '08:00:00'), pallet_id: 777 },
      { ...ev('restaurar', '04PDG', '08:02:00'), pallet_id: 777 },
      ev('crear', '04PDG', '08:30:00'),
    ];
    expect(reingresosDelDia(e)).toEqual([]);
  });

  it('un restaurar de OTRO pallet no cancela la baja pendiente', () => {
    const e: EventoBodega[] = [
      { ...ev('eliminar', '04PDG', '08:00:00'), pallet_id: 777 },
      { ...ev('restaurar', '04PDG', '08:02:00'), pallet_id: 999 },
      ev('crear', '04PDG', '08:30:00'),
    ];
    expect(reingresosDelDia(e)).toHaveLength(1);
  });
});

describe('emparejado FIFO: la primera que desapareció es la primera que vuelve', () => {
  it('dos bajas y dos altas se emparejan en orden de llegada', () => {
    const e = [
      ev('eliminar', '04PDG', '08:00:00'), ev('eliminar', '04PDG', '08:10:00'),
      ev('crear',    '04PDG', '08:20:00'), ev('crear',    '04PDG', '08:30:00'),
    ];
    expect(reingresosDelDia(e).map(r => r.minutos)).toEqual([20, 20]);
  });

  it('LIFO escondería el caso grave; FIFO no', () => {
    // Con LIFO la primera brecha sería 1 minuto y el problema de 60 min quedaría tapado.
    const e = [
      ev('eliminar', '04PDG', '08:00:00'), ev('eliminar', '04PDG', '08:59:00'),
      ev('crear',    '04PDG', '09:00:00'),
    ];
    expect(reingresosDelDia(e)[0].minutos).toBe(60);
  });

  it('los eventos se ordenan por hora aunque lleguen desordenados', () => {
    const e = [ev('crear', '04PDG', '08:30:00'), ev('eliminar', '04PDG', '08:00:00')];
    expect(reingresosDelDia(e)).toHaveLength(1);
  });
});

describe('medirDia', () => {
  const dia = () => medirDia(D, [
    ev('crear', '04PDG', '08:00:00'), ev('crear', '04PDG', '08:01:00'),
    ev('crear', '09LEO', '08:02:00'), ev('crear', '09LEO', '08:03:00'),
    ev('eliminar', '04PDG', '09:00:00'), ev('crear', '04PDG', '09:00:30'),   // 0 min
    ev('eliminar', '09LEO', '10:00:00'), ev('crear', '09LEO', '10:05:00'),   // 5 min
    ev('eliminar', '09LEO', '11:00:00'), ev('crear', '09LEO', '11:40:00'),   // 40 min
  ]);

  it('cuenta altas, bajas y reingresos', () => {
    const d = dia();
    expect({ creados: d.creados, eliminados: d.eliminados, reingresos: d.reingresos })
      .toEqual({ creados: 7, eliminados: 3, reingresos: 3 });
  });

  it('el porcentaje se mide sobre lo creado', () => {
    expect(dia().porcentaje).toBe(43);            // 3 de 7
  });

  it('separa las brechas: segundos es churn de sincronía, minutos es alguien rehaciéndolo', () => {
    expect(dia().brechas).toEqual({ hastaUnMinuto: 1, hastaDiezMinutos: 1, masDeDiezMinutos: 1 });
  });

  it('ordena las tiendas por cuántos reingresos tuvieron', () => {
    expect(dia().tiendas).toEqual([{ cod: '09LEO', reingresos: 2 }, { cod: '04PDG', reingresos: 1 }]);
  });

  it('un día sin altas no divide por cero', () => {
    expect(medirDia(D, []).porcentaje).toBe(0);
  });

  it('solo mira los eventos de SU fecha', () => {
    const otroDia = { ...ev('crear', '04PDG', '08:00:00'), date: '2026-09-16' };
    expect(medirDia(D, [otroDia]).creados).toBe(0);
  });
});

describe('casos de borde', () => {
  it('una fecha ilegible no inventa un par', () => {
    const e: EventoBodega[] = [
      { ...ev('eliminar', '04PDG', '08:00:00'), created_at: 'no es una fecha' },
      ev('crear', '04PDG', '08:30:00'),
    ];
    expect(reingresosDelDia(e)).toEqual([]);
  });

  it('tienda o tipo nulos se agrupan sin romper', () => {
    const e: EventoBodega[] = [
      { ...ev('eliminar', '04PDG', '08:00:00'), store_cod: null, tipo: null },
      { ...ev('crear', '04PDG', '08:05:00'), store_cod: null, tipo: null },
    ];
    expect(reingresosDelDia(e)).toHaveLength(1);
  });

  it('un tipo de evento desconocido se ignora', () => {
    const e = [ev('eliminar', '04PDG', '08:00:00'), ev('imprimir', '04PDG', '08:01:00'), ev('crear', '04PDG', '08:02:00')];
    expect(reingresosDelDia(e)).toHaveLength(1);
  });

  it('medirDias devuelve el más reciente primero', () => {
    const e = [
      { ...ev('crear', '04PDG', '08:00:00'), date: '2026-09-15' },
      { ...ev('crear', '04PDG', '08:00:00'), date: '2026-09-17' },
      { ...ev('crear', '04PDG', '08:00:00'), date: '2026-09-16' },
    ];
    expect(medirDias(e).map(d => d.fecha)).toEqual(['2026-09-17', '2026-09-16', '2026-09-15']);
  });
});
