import { describe, it, expect } from 'vitest';
import { fechaSalida, ultimoDiaHabil, esFinDeSemana } from '../fechaSalida';

// Semana de referencia: 2026-09-07 lunes … 2026-09-13 domingo.
describe('fechaSalida', () => {
  it('seco sale al día siguiente, fin de semana incluido: lo mueve una empresa externa', () => {
    expect(fechaSalida('2026-09-10', 'seco')).toBe('2026-09-11'); // jueves → viernes
    expect(fechaSalida('2026-09-11', 'seco')).toBe('2026-09-12'); // viernes → SÁBADO
  });

  it('congelados no sale el fin de semana: lo del viernes sale el lunes', () => {
    expect(fechaSalida('2026-09-10', 'congelados')).toBe('2026-09-11');
    expect(fechaSalida('2026-09-11', 'congelados')).toBe('2026-09-14'); // viernes → LUNES
  });

  it('el caso real: la ruta RUTA-110926 se armó el 11 y salió el 12', () => {
    expect(fechaSalida('2026-09-11', 'seco')).toBe('2026-09-12');
  });

  it('una fecha vacía no inventa nada', () => {
    expect(fechaSalida('', 'seco')).toBe('');
    expect(fechaSalida('', 'congelados')).toBe('');
  });
});

describe('ultimoDiaHabil', () => {
  it('desde el fin de semana apunta al viernes, no a "ayer"', () => {
    expect(ultimoDiaHabil('2026-09-12')).toBe('2026-09-11'); // sábado → viernes
    expect(ultimoDiaHabil('2026-09-13')).toBe('2026-09-11'); // DOMINGO → viernes, no sábado
  });

  it('desde el lunes también apunta al viernes', () => {
    expect(ultimoDiaHabil('2026-09-14')).toBe('2026-09-11');
  });

  it('entre semana es el día anterior', () => {
    expect(ultimoDiaHabil('2026-09-10')).toBe('2026-09-09');
  });

  it('con incluirHoy, un día hábil se devuelve a sí mismo', () => {
    expect(ultimoDiaHabil('2026-09-10', true)).toBe('2026-09-10');
    expect(ultimoDiaHabil('2026-09-13', true)).toBe('2026-09-11'); // domingo no es hábil
  });
});

describe('esFinDeSemana', () => {
  it('sábado y domingo sí, el resto no', () => {
    expect(esFinDeSemana('2026-09-12')).toBe(true);
    expect(esFinDeSemana('2026-09-13')).toBe(true);
    expect(esFinDeSemana('2026-09-11')).toBe(false);
    expect(esFinDeSemana('2026-09-14')).toBe(false);
  });
});
