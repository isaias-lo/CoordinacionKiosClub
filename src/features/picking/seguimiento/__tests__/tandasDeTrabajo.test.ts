import { describe, it, expect } from 'vitest';
import { minutosTrabajados, type OperacionConTanda } from '../tandasDeTrabajo';

const op = (p: Partial<OperacionConTanda> = {}): OperacionConTanda => ({
  tanda: 'BATCH/1',
  asignadoEn: '2026-10-01 14:00:00',
  validadoEn: '2026-10-01 15:00:00',
  ...p,
});

describe('minutosTrabajados: la tanda se cuenta una sola vez', () => {
  it('EL caso real: tres pedidos de la misma tanda son UN lapso, no tres', () => {
    // BATCH/54939 en Odoo: los tres asignados 14:07, los tres validados 15:26.
    // Sumando cada pedido daban 3,95 h por una tanda de 1,32 h.
    const r = minutosTrabajados([
      op({ tanda: 'BATCH/54939', asignadoEn: '2026-09-15 14:07:00', validadoEn: '2026-09-15 15:26:00' }),
      op({ tanda: 'BATCH/54939', asignadoEn: '2026-09-15 14:07:00', validadoEn: '2026-09-15 15:26:00' }),
      op({ tanda: 'BATCH/54939', asignadoEn: '2026-09-15 14:07:00', validadoEn: '2026-09-15 15:26:01' }),
    ]);
    expect(r.minutos).toBe(79);      // 14:07 → 15:26
    expect(r.tandas).toBe(1);
    expect(r.medidas).toBe(3);       // las tres aportaron, aunque el lapso sea uno
  });

  it('dos tandas distintas sí suman', () => {
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 09:00:00' }),
      op({ tanda: 'B', asignadoEn: '2026-10-01 10:00:00', validadoEn: '2026-10-01 10:30:00' }),
    ]);
    expect(r.minutos).toBe(90);
    expect(r.tandas).toBe(2);
  });

  it('toma el asignado MÁS TEMPRANO y el validado MÁS TARDÍO de la tanda', () => {
    // No «el primero que llegó»: así el número no depende del orden en que Odoo devolvió las filas.
    const filas = [
      op({ tanda: 'A', asignadoEn: '2026-10-01 09:00:00', validadoEn: '2026-10-01 09:30:00' }),
      op({ tanda: 'A', asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 11:00:00' }),
      op({ tanda: 'A', asignadoEn: '2026-10-01 10:00:00', validadoEn: '2026-10-01 10:15:00' }),
    ];
    expect(minutosTrabajados(filas).minutos).toBe(180);           // 08:00 → 11:00
    expect(minutosTrabajados([...filas].reverse()).minutos).toBe(180);
  });

  it('el pedido sin tanda cuenta con su propia duración', () => {
    const r = minutosTrabajados([
      op({ tanda: null, asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 08:45:00' }),
      op({ tanda: '',   asignadoEn: '2026-10-01 09:00:00', validadoEn: '2026-10-01 09:20:00' }),
    ]);
    expect(r.minutos).toBe(65);
    expect(r.tandas).toBe(0);
  });

  it('sueltos y tandas se suman juntos', () => {
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 09:00:00' }),
      op({ tanda: 'A', asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 09:00:00' }),
      op({ tanda: null, asignadoEn: '2026-10-01 10:00:00', validadoEn: '2026-10-01 10:30:00' }),
    ]);
    expect(r.minutos).toBe(90);   // 60 de la tanda (una vez) + 30 del suelto
  });
});

describe('minutosTrabajados: lo que no se puede medir', () => {
  it('sin hora de asignación no se mide, y se informa', () => {
    const r = minutosTrabajados([op({ asignadoEn: false }), op({ validadoEn: false })]);
    expect(r.minutos).toBe(0);
    expect(r.medidas).toBe(0);
    expect(r.sinMedir).toBe(2);
  });

  it('una operación sin medir NO arrastra a su tanda', () => {
    // La tanda igual se mide con las operaciones que sí tienen las dos horas.
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: false }),
      op({ tanda: 'A', asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 09:00:00' }),
    ]);
    expect(r.minutos).toBe(60);
    expect(r.medidas).toBe(1);
    expect(r.sinMedir).toBe(1);
  });

  it('validado antes que asignado no se mide: es un dato roto, no un tiempo negativo', () => {
    const r = minutosTrabajados([
      op({ asignadoEn: '2026-10-01 15:00:00', validadoEn: '2026-10-01 14:00:00' }),
    ]);
    expect(r.minutos).toBe(0);
    expect(r.sinMedir).toBe(1);
  });

  it('sin operaciones da cero y no rompe', () => {
    expect(minutosTrabajados([])).toEqual({
      minutos: 0, minutosSumados: 0, tandasSolapadas: 0, medidas: 0, sinMedir: 0, tandas: 0,
    });
  });
});

describe('minutosTrabajados: los segundos se truncan', () => {
  it('59 segundos no son un minuto', () => {
    const r = minutosTrabajados([
      op({ tanda: null, asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 08:00:59' }),
    ]);
    expect(r.minutos).toBe(0);
  });

  it('el mismo lapso da el mismo número al recargar', () => {
    const a = minutosTrabajados([op({ tanda: 'A', asignadoEn: '2026-10-01 08:00:10', validadoEn: '2026-10-01 09:00:50' })]);
    const b = minutosTrabajados([op({ tanda: 'A', asignadoEn: '2026-10-01 08:00:40', validadoEn: '2026-10-01 09:00:20' })]);
    expect(a.minutos).toBe(b.minutos);
  });
});

describe('la inflación que esto corrige, medida', () => {
  it('una cuenta compartida por dos personas es el caso extremo', () => {
    // «Mario Patiño»: dos personas en el mismo usuario, con las tandas casi superpuestas. Sumando
    // cada pedido la inflación llegaba a 10 veces.
    const mismaTanda = Array.from({ length: 10 }, () =>
      op({ tanda: 'BATCH/CONG', asignadoEn: '2026-10-01 08:00:00', validadoEn: '2026-10-01 10:00:00' }));
    const r = minutosTrabajados(mismaTanda);
    expect(r.minutos).toBe(120);        // dos horas, no veinte
    expect(r.medidas).toBe(10);
    expect(r.tandas).toBe(1);
  });
});

describe('minutosTrabajados: las tandas que se pisan entre sí se UNEN', () => {
  it('EL caso de Diego Farr: tres tandas encadenadas son el rato que marcó el reloj', () => {
    // Se le asigna la siguiente mientras cierra la anterior. Sumadas dan 5,37 h; de 09:14 a
    // 12:18 pasaron 3,07 h. Es lo que hacía que 150 tandas con 118 solapes dieran 14,9 h/día.
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-11-11 09:14:00', validadoEn: '2026-11-11 11:02:00' }),
      op({ tanda: 'B', asignadoEn: '2026-11-11 09:51:00', validadoEn: '2026-11-11 11:40:00' }),
      op({ tanda: 'C', asignadoEn: '2026-11-11 10:33:00', validadoEn: '2026-11-11 12:18:00' }),
    ]);
    expect(r.minutos).toBe(184);              // 09:14 → 12:18
    expect(r.minutosSumados).toBe(108 + 109 + 105);   // 322: lo que daba antes
    expect(r.tandasSolapadas).toBe(2);
    expect(r.tandas).toBe(3);                 // siguen siendo tres tandas distintas
  });

  it('una tanda metida ENTERA dentro de otra no agrega nada', () => {
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-11-11 08:00:00', validadoEn: '2026-11-11 12:00:00' }),
      op({ tanda: 'B', asignadoEn: '2026-11-11 09:00:00', validadoEn: '2026-11-11 10:00:00' }),
    ]);
    expect(r.minutos).toBe(240);
    expect(r.tandasSolapadas).toBe(1);
  });

  it('dos tandas que se tocan justo en el límite son trabajo continuo', () => {
    // 09:00 cierra una y abre la otra: no hubo pausa, así que es un solo lapso de dos horas.
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-11-11 08:00:00', validadoEn: '2026-11-11 09:00:00' }),
      op({ tanda: 'B', asignadoEn: '2026-11-11 09:00:00', validadoEn: '2026-11-11 10:00:00' }),
    ]);
    expect(r.minutos).toBe(120);
    expect(r.minutosSumados).toBe(120);       // acá los dos métodos coinciden
    expect(r.tandasSolapadas).toBe(1);
  });

  it('con un hueco en medio NO se une: el hueco es tiempo que no se trabajó', () => {
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-11-11 08:00:00', validadoEn: '2026-11-11 09:00:00' }),
      op({ tanda: 'B', asignadoEn: '2026-11-11 13:00:00', validadoEn: '2026-11-11 14:00:00' }),
    ]);
    expect(r.minutos).toBe(120);
    expect(r.tandasSolapadas).toBe(0);
  });

  it('un pedido suelto trabajado DENTRO de una tanda no se cuenta aparte', () => {
    // Antes el suelto se sumaba por su cuenta, aunque cayera en medio de la tanda.
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-11-11 08:00:00', validadoEn: '2026-11-11 10:00:00' }),
      op({ tanda: null, asignadoEn: '2026-11-11 08:30:00', validadoEn: '2026-11-11 09:00:00' }),
    ]);
    expect(r.minutos).toBe(120);
    expect(r.minutosSumados).toBe(150);
    expect(r.tandas).toBe(1);                 // el suelto no es una tanda
  });

  it('no depende del orden en que Odoo devolvió las filas', () => {
    const filas = [
      op({ tanda: 'C', asignadoEn: '2026-11-11 10:33:00', validadoEn: '2026-11-11 12:18:00' }),
      op({ tanda: 'A', asignadoEn: '2026-11-11 09:14:00', validadoEn: '2026-11-11 11:02:00' }),
      op({ tanda: 'B', asignadoEn: '2026-11-11 09:51:00', validadoEn: '2026-11-11 11:40:00' }),
    ];
    expect(minutosTrabajados(filas).minutos).toBe(184);
    expect(minutosTrabajados([...filas].reverse()).minutos).toBe(184);
  });

  it('sin solapes el reloj y la suma dan lo MISMO: las 24 cuentas que no cambian', () => {
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-11-11 08:00:00', validadoEn: '2026-11-11 09:00:00' }),
      op({ tanda: 'B', asignadoEn: '2026-11-11 11:00:00', validadoEn: '2026-11-11 11:30:00' }),
      op({ tanda: null, asignadoEn: '2026-11-11 15:00:00', validadoEn: '2026-11-11 15:10:00' }),
    ]);
    expect(r.minutos).toBe(r.minutosSumados);
    expect(r.minutos).toBe(100);
    expect(r.tandasSolapadas).toBe(0);
  });

  it('el truncado se hace al cerrar el lapso UNIDO, no pedazo por pedazo', () => {
    // Dos tandas que se pisan y que empiezan y terminan con segundos sueltos. Truncar cada
    // pedazo antes de unir perdería minutos: lo que vale es 08:00:30 → 09:30:50.
    const r = minutosTrabajados([
      op({ tanda: 'A', asignadoEn: '2026-11-11 08:00:30', validadoEn: '2026-11-11 09:00:50' }),
      op({ tanda: 'B', asignadoEn: '2026-11-11 08:59:40', validadoEn: '2026-11-11 09:30:50' }),
    ]);
    expect(r.minutos).toBe(90);               // 08:00 → 09:30 truncado
    expect(r.tandasSolapadas).toBe(1);
  });

  it('la cuenta compartida: 20 tandas encadenadas no son 20 jornadas', () => {
    // «Mario Patiño», que hoy usan Joe Idrovo y Haisemberg Garmendia con el mismo usuario de
    // Odoo: 226 tandas en el mes, 201 pisándose con otra, 745,5 h sumadas contra 78,5 de reloj.
    // Acá en chico: 20 tandas de 1 h que arrancan cada 15 minutos.
    const t0 = Date.UTC(2026, 10, 11, 8, 0, 0);
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
    const r = minutosTrabajados(Array.from({ length: 20 }, (_, i) => op({
      tanda: `BATCH/${i}`,
      asignadoEn: iso(t0 + i * 15 * 60000),
      validadoEn: iso(t0 + i * 15 * 60000 + 60 * 60000),
    })));
    expect(r.minutosSumados).toBe(20 * 60);   // 20 h, el número imposible
    expect(r.minutos).toBe(19 * 15 + 60);     // 345 min: de 08:00 a 13:45
    expect(r.tandasSolapadas).toBe(19);
  });
});
