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
    expect(minutosTrabajados([])).toEqual({ minutos: 0, medidas: 0, sinMedir: 0, tandas: 0 });
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
