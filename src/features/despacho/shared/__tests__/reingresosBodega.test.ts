import { describe, it, expect } from 'vitest';
import { repetidosDelDia, medirDia, medirDias, type RegistroBodega } from '../reingresosBodega';

const D = '2026-09-17';
const reg = (
  slotId: number | null, actor: string, hora: string,
  peso: number | null = 100, tienda = '04PDG',
): RegistroBodega => ({
  fecha: D, tienda, actor, slotId, peso, createdAt: `${D}T${hora}-03:00`,
});

describe('el caso real que destapó la medición mal hecha', () => {
  // 17/09: el slot 13938 (59EGN, P1, 193,5 kg) lo registró Sebastián a las 10:33:32 y otra
  // persona a las 10:33:49. Mismo slot, mismo peso, 17 segundos, dos personas.
  const caso = [
    reg(13938, 'Sebastian Jimenez', '10:33:32', 193.5, '59EGN'),
    reg(13938, 'Isaias Lozada',     '10:33:49', 193.5, '59EGN'),
  ];

  it('lo cuenta como trabajo rehecho', () => {
    expect(repetidosDelDia(caso)).toEqual([{ clase: 'rehecho', tienda: '59EGN', minutos: 0 }]);
  });

  it('es UNA unidad, no dos', () => {
    expect(medirDia(D, caso).unidades).toBe(1);
  });
});

describe('rehacer no es lo mismo que corregir', () => {
  it('otra persona con el MISMO peso: se pesó dos veces', () => {
    const r = repetidosDelDia([reg(1, 'Ana', '10:00:00', 83), reg(1, 'Beto', '10:06:00', 83)]);
    expect(r[0].clase).toBe('rehecho');
  });

  it('otra persona con OTRO peso: corrigió un dato, es trabajo útil', () => {
    const r = repetidosDelDia([reg(1, 'Ana', '10:00:00', 83), reg(1, 'Beto', '10:06:00', 91)]);
    expect(r[0].clase).toBe('corregido');
  });

  it('la MISMA persona: está editando lo suyo, no es duplicado entre dos', () => {
    const r = repetidosDelDia([reg(1, 'Ana', '10:00:00', 83), reg(1, 'Ana', '10:06:00', 83)]);
    expect(r[0].clase).toBe('repetidoMismaPersona');
  });

  it('el nombre se compara sin espacios ni mayúsculas', () => {
    const r = repetidosDelDia([reg(1, 'Ana Pérez', '10:00:00'), reg(1, '  ana pérez ', '10:06:00')]);
    expect(r[0].clase).toBe('repetidoMismaPersona');
  });

  it('un peso ausente no se confunde con un peso igual', () => {
    const r = repetidosDelDia([reg(1, 'Ana', '10:00:00', null), reg(1, 'Beto', '10:06:00', 83)]);
    expect(r[0].clase).toBe('corregido');
  });
});

describe('qué cuenta y qué no', () => {
  it('un solo registro por unidad no es nada', () => {
    expect(repetidosDelDia([reg(1, 'Ana', '10:00:00'), reg(2, 'Beto', '10:05:00')])).toEqual([]);
  });

  it('no cruza unidades distintas', () => {
    expect(repetidosDelDia([reg(1, 'Ana', '10:00:00'), reg(2, 'Beto', '10:00:30')])).toEqual([]);
  });

  it('una fila sin slot se descarta: no hay con qué emparejarla', () => {
    expect(repetidosDelDia([reg(null, 'Ana', '10:00:00'), reg(null, 'Beto', '10:06:00')])).toEqual([]);
  });

  it('el tercer registro se compara contra el PRIMERO, no contra el anterior', () => {
    // Lo que se quiere saber es si se rehizo la carga original, no si hubo una cadena de ediciones.
    const r = repetidosDelDia([
      reg(1, 'Ana',  '10:00:00', 83),
      reg(1, 'Beto', '10:05:00', 83),
      reg(1, 'Caro', '10:20:00', 83),
    ]);
    expect(r.map(x => x.clase)).toEqual(['rehecho', 'rehecho']);
    expect(r.map(x => x.minutos)).toEqual([5, 20]);
  });

  it('ordena por hora aunque lleguen desordenados', () => {
    const r = repetidosDelDia([reg(1, 'Beto', '10:06:00'), reg(1, 'Ana', '10:00:00')]);
    expect(r[0].clase).toBe('rehecho');   // Ana fue la primera
    expect(r[0].minutos).toBe(6);
  });
});

describe('medirDia', () => {
  const dia = () => medirDia(D, [
    reg(1, 'Ana',  '09:00:00', 100), reg(2, 'Ana', '09:01:00', 100),
    reg(3, 'Beto', '09:02:00', 100), reg(4, 'Beto', '09:03:00', 100, '09LEO'),
    reg(1, 'Beto', '09:00:30', 100),                    // rehecho, 0 min
    reg(2, 'Beto', '09:06:00', 100),                    // rehecho, 5 min
    reg(4, 'Ana',  '10:03:00', 100, '09LEO'),           // rehecho, 60 min
    reg(3, 'Ana',  '09:30:00', 175),                    // corregido (otro peso)
  ]);

  it('el denominador son unidades distintas, no registros', () => {
    const d = dia();
    expect({ unidades: d.unidades, registros: d.registros }).toEqual({ unidades: 4, registros: 8 });
  });

  it('separa rehecho de corregido', () => {
    const d = dia();
    expect({ rehecho: d.rehecho, corregido: d.corregido }).toEqual({ rehecho: 3, corregido: 1 });
  });

  it('el porcentaje se mide sobre las unidades', () => {
    expect(dia().porcentaje).toBe(75);            // 3 de 4
  });

  it('separa las brechas: segundos es ruido de sincronía, minutos es alguien rehaciéndolo', () => {
    expect(dia().brechas).toEqual({ hastaUnMinuto: 1, hastaDiezMinutos: 1, masDeDiezMinutos: 1 });
  });

  it('ordena las tiendas por cuánto se rehizo', () => {
    expect(dia().tiendas).toEqual([{ cod: '04PDG', rehecho: 2 }, { cod: '09LEO', rehecho: 1 }]);
  });

  it('un día sin unidades no divide por cero', () => {
    expect(medirDia(D, []).porcentaje).toBe(0);
  });

  it('solo mira los registros de SU fecha', () => {
    const otro = { ...reg(1, 'Ana', '09:00:00'), fecha: '2026-09-16' };
    expect(medirDia(D, [otro]).unidades).toBe(0);
  });
});

describe('casos de borde', () => {
  it('una hora ilegible en el primer registro descarta la unidad', () => {
    const e: RegistroBodega[] = [
      { ...reg(1, 'Ana', '10:00:00'), createdAt: 'no es una fecha' },
      reg(1, 'Beto', '10:06:00'),
    ];
    expect(repetidosDelDia(e)).toEqual([]);
  });

  it('un actor nulo no rompe la comparación', () => {
    const r = repetidosDelDia([reg(1, 'Ana', '10:00:00'), { ...reg(1, 'x', '10:06:00'), actor: null }]);
    expect(r).toHaveLength(1);
  });

  it('medirDias devuelve el más reciente primero', () => {
    const e = ['2026-09-15', '2026-09-17', '2026-09-16'].map((f, i) => ({ ...reg(i + 1, 'Ana', '09:00:00'), fecha: f }));
    expect(medirDias(e).map(d => d.fecha)).toEqual(['2026-09-17', '2026-09-16', '2026-09-15']);
  });
});
