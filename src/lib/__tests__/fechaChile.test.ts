import { describe, it, expect } from 'vitest';
import { fechaChile, fechaChileDe, fmtHoraChile, fmtFechaChile, fmtFechaHoraChile, odooDateToISO, limitesDiaChile } from '@/lib/fechaChile';

// Instantes escritos en UTC: el resultado no puede depender del huso donde corra el test.
describe('fechaChileDe — el día del CD de un instante', () => {
  it('a las 21:30 de Chile todavía es el mismo día (el bug de C-04)', () => {
    // 12-sep 00:30 UTC = 11-sep 21:30 en Chile. Con el día UTC daba 12 → Actividad mostraba mañana.
    expect(fechaChileDe(new Date('2026-09-12T00:30:00Z'))).toBe('2026-09-11');
  });

  it('cruza al día siguiente recién a la medianoche de Chile', () => {
    expect(fechaChileDe(new Date('2026-09-12T02:59:00Z'))).toBe('2026-09-11'); // 23:59
    expect(fechaChileDe(new Date('2026-09-12T03:01:00Z'))).toBe('2026-09-12'); // 00:01
  });

  it('resuelve el horario de verano solo (invierno UTC-4, verano UTC-3)', () => {
    expect(fechaChileDe(new Date('2026-06-15T03:30:00Z'))).toBe('2026-06-14'); // 23:30 invierno
    expect(fechaChileDe(new Date('2026-01-15T02:30:00Z'))).toBe('2026-01-14'); // 23:30 verano
  });

  it('acepta string y epoch, y devuelve vacío con basura', () => {
    expect(fechaChileDe('2026-09-12T00:30:00Z')).toBe('2026-09-11');
    expect(fechaChileDe(Date.parse('2026-09-12T00:30:00Z'))).toBe('2026-09-11');
    expect(fechaChileDe('no es fecha')).toBe('');
  });

  it('el mismo instante da el mismo día llamado de cualquier forma', () => {
    const iso = '2026-09-12T00:30:00Z';
    expect(fechaChileDe(iso)).toBe(fechaChileDe(new Date(iso)));
  });
});

describe('fechaChile', () => {
  it('devuelve formato YYYY-MM-DD', () => {
    expect(fechaChile()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('el offset positivo da un día posterior y el negativo uno anterior', () => {
    const hoy = fechaChile(0);
    const manana = fechaChile(1);
    const ayer = fechaChile(-1);
    expect(manana > hoy).toBe(true);
    expect(ayer < hoy).toBe(true);
  });

  it('avanza correctamente cruzando fin de mes', () => {
    // No podemos fijar "hoy", pero sí verificar que ±1 son días calendario válidos
    // y consecutivos respecto a hoy.
    const hoy = fechaChile(0);
    const manana = fechaChile(1);
    const dHoy = new Date(hoy + 'T12:00:00Z').getTime();
    const dManana = new Date(manana + 'T12:00:00Z').getTime();
    expect(Math.round((dManana - dHoy) / 86400000)).toBe(1);
  });
});

describe('fmtHoraChile / fmtFechaChile / fmtFechaHoraChile', () => {
  // Junio = invierno en Chile → UTC-4. 18:21 UTC = 14:21 Chile.
  const inviernoUTC = '2026-06-16T18:21:15Z';
  // Enero = verano con horario de verano → UTC-3. 18:21 UTC = 15:21 Chile.
  const veranoUTC = '2026-01-15T18:21:00Z';

  it('convierte UTC a hora de Chile (invierno UTC-4)', () => {
    expect(fmtHoraChile(inviernoUTC)).toBe('14:21');
  });

  it('respeta el horario de verano (UTC-3)', () => {
    expect(fmtHoraChile(veranoUTC)).toBe('15:21');
  });

  it('agrega segundos cuando se pide', () => {
    expect(fmtHoraChile(inviernoUTC, true)).toBe('14:21:15');
  });

  it('fmtFechaChile devuelve la fecha local de Chile', () => {
    // 16-jun 18:21 UTC sigue siendo 16-jun en Chile (14:21).
    expect(fmtFechaChile(inviernoUTC)).toBe('16-06-2026');
  });

  it('fmtFechaChile retrocede un día si en UTC ya pasó medianoche pero en Chile no', () => {
    // 17-jun 02:00 UTC = 16-jun 22:00 en Chile.
    expect(fmtFechaChile('2026-06-17T02:00:00Z')).toBe('16-06-2026');
  });

  it('fmtFechaHoraChile combina fecha y hora de Chile', () => {
    expect(fmtFechaHoraChile(inviernoUTC)).toBe('16-06-2026 14:21');
  });

  it('maneja valores nulos/ inválidos con guion', () => {
    expect(fmtHoraChile(null)).toBe('—');
    expect(fmtFechaChile(undefined)).toBe('—');
    expect(fmtFechaHoraChile('no-es-fecha')).toBe('—');
  });
});

describe('odooDateToISO', () => {
  it('marca la Z en un datetime naive de Odoo (UTC sin zona)', () => {
    expect(odooDateToISO('2026-07-29 14:32:11')).toBe('2026-07-29T14:32:11Z');
  });

  it('con la Z marcada, fmtHoraChile convierte UTC → Chile una sola vez', () => {
    // 14:32 UTC (invierno, UTC-4) = 10:32 Chile
    expect(fmtHoraChile(odooDateToISO('2026-06-16 14:32:11'))).toBe('10:32');
  });

  it('null/undefined/vacío → null', () => {
    expect(odooDateToISO(null)).toBeNull();
    expect(odooDateToISO(undefined)).toBeNull();
    expect(odooDateToISO('')).toBeNull();
  });

  it('formato ya ISO se pasa tal cual (no lo toca)', () => {
    expect(odooDateToISO('2026-07-29T14:32:11Z')).toBe('2026-07-29T14:32:11Z');
  });
});

describe('limitesDiaChile', () => {
  it('invierno (UTC−4): el día va de 04:00Z a 04:00Z del siguiente', () => {
    expect(limitesDiaChile('2026-06-15')).toEqual({ desde: '2026-06-15T04:00:00.000Z', hasta: '2026-06-16T04:00:00.000Z' });
  });
  it('verano (UTC−3): el día va de 03:00Z a 03:00Z del siguiente', () => {
    expect(limitesDiaChile('2026-10-16')).toEqual({ desde: '2026-10-16T03:00:00.000Z', hasta: '2026-10-17T03:00:00.000Z' });
  });
  it('un cambio a las 21:30 de Chile (00:30Z del día siguiente) cae dentro de su día', () => {
    const { desde, hasta } = limitesDiaChile('2026-10-16');
    const t = '2026-10-17T00:30:00.000Z';
    expect(t >= desde && t < hasta).toBe(true);
  });
  it('cada instante del rango es ese día en Chile, y el borde de afuera ya no', () => {
    for (const f of ['2026-04-04', '2026-04-05', '2026-09-05', '2026-09-06', '2026-12-31']) {
      const { desde, hasta } = limitesDiaChile(f);
      expect(fechaChileDe(desde)).toBe(f);
      expect(fechaChileDe(new Date(new Date(hasta).getTime() - 1))).toBe(f);
      expect(fechaChileDe(hasta)).not.toBe(f);
      expect(fechaChileDe(new Date(new Date(desde).getTime() - 1))).not.toBe(f);
    }
  });
});
