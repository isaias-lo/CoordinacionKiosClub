import { describe, it, expect } from 'vitest';
import { elegirRuta, ESTADOS_RUTA_FINALES, type RutaCandidata } from '@/lib/rutaGuiaMatch';

describe('elegirRuta', () => {
  it('devuelve null si no hay candidatas', () => {
    expect(elegirRuta([])).toBeNull();
  });

  it('elige la única candidata', () => {
    const c: RutaCandidata[] = [{ ruta_id: 7, fecha: '2026-06-16', estado: 'pendiente' }];
    expect(elegirRuta(c)).toBe(7);
  });

  it('prefiere la ruta de fecha más reciente (armado hoy / sale mañana)', () => {
    const c: RutaCandidata[] = [
      { ruta_id: 1, fecha: '2026-06-15', estado: 'pendiente' },
      { ruta_id: 2, fecha: '2026-06-17', estado: 'pendiente' },
      { ruta_id: 3, fecha: '2026-06-16', estado: 'pendiente' },
    ];
    expect(elegirRuta(c)).toBe(2);
  });

  it('desempata por id mayor cuando la fecha es igual', () => {
    const c: RutaCandidata[] = [
      { ruta_id: 5, fecha: '2026-06-16', estado: 'pendiente' },
      { ruta_id: 9, fecha: '2026-06-16', estado: 'pendiente' },
    ];
    expect(elegirRuta(c)).toBe(9);
  });

  it('prefiere rutas no finalizadas aunque otra finalizada sea más reciente', () => {
    const c: RutaCandidata[] = [
      { ruta_id: 1, fecha: '2026-06-17', estado: 'recibido' },
      { ruta_id: 2, fecha: '2026-06-16', estado: 'pendiente' },
    ];
    expect(elegirRuta(c)).toBe(2);
  });

  it('usa la finalizada si es la única opción', () => {
    const c: RutaCandidata[] = [{ ruta_id: 4, fecha: '2026-06-16', estado: 'recibido' }];
    expect(elegirRuta(c)).toBe(4);
  });

  it('considera "recibido" como estado final', () => {
    expect(ESTADOS_RUTA_FINALES.has('recibido')).toBe(true);
    expect(ESTADOS_RUTA_FINALES.has('pendiente')).toBe(false);
  });
});
