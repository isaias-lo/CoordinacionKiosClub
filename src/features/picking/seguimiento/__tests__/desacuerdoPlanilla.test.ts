import { describe, it, expect } from 'vitest';
import {
  desacuerdoConLaPlanilla, explicacionDesacuerdo, UMBRAL_DESACUERDO, type FilaConTiempo,
} from '../desacuerdoPlanilla';

const fila = (p: Partial<FilaConTiempo> = {}): FilaConTiempo => ({
  totalMinutes: 4608, totalMinutesSumados: 14328, tandasSolapadas: 118, cph: 995, ...p,
});

describe('desacuerdoConLaPlanilla: las seis cuentas que se separan', () => {
  it('Diego Farr: 76,8 h de reloj contra 238,8 de la hoja', () => {
    const d = desacuerdoConLaPlanilla(fila())!;
    expect(d.minutos).toBe(14328);                 // 238,8 h
    expect(d.factor).toBe(3.11);
    expect(d.solapadas).toBe(118);
    expect(d.cph).toBe(320);                       // 995 × 76,8 / 238,8
  });

  it('Mario Patiño, el caso extremo', () => {
    // 78,5 h de reloj contra 745,5 de la hoja · 528 u/h contra 56.
    const d = desacuerdoConLaPlanilla(fila({
      totalMinutes: 4710, totalMinutesSumados: 44730, tandasSolapadas: 201, cph: 528,
    }))!;
    expect(d.factor).toBe(9.5);
    expect(d.cph).toBe(56);
  });

  it('el ritmo se ESCALA, no se recalcula desde las unidades', () => {
    // cph × minutos / minutosSumados. Con el doble de horas, la mitad del ritmo, exacto.
    const d = desacuerdoConLaPlanilla(fila({ totalMinutes: 100, totalMinutesSumados: 200, cph: 800 }))!;
    expect(d.cph).toBe(400);
  });
});

describe('desacuerdoConLaPlanilla: cuándo NO se muestra nada', () => {
  it('las 24 cuentas que coinciden no muestran nada', () => {
    // Pickers 15: 64,3 h de reloj contra 67,4 → 1,05×.
    expect(desacuerdoConLaPlanilla(fila({ totalMinutes: 3858, totalMinutesSumados: 4044 }))).toBeNull();
  });

  it('sin solape las dos cuentas son el mismo número', () => {
    expect(desacuerdoConLaPlanilla(fila({ totalMinutes: 3306, totalMinutesSumados: 3306, tandasSolapadas: 0 }))).toBeNull();
  });

  it('una fila de un cache anterior al #816 no trae el dato y no inventa nada', () => {
    expect(desacuerdoConLaPlanilla(fila({ totalMinutesSumados: undefined }))).toBeNull();
  });

  it('sin horas medidas no hay nada que comparar', () => {
    expect(desacuerdoConLaPlanilla(fila({ totalMinutes: 0 }))).toBeNull();
    expect(desacuerdoConLaPlanilla(fila({ totalMinutesSumados: 0 }))).toBeNull();
  });

  it('no divide por cero ni devuelve infinito', () => {
    const d = desacuerdoConLaPlanilla(fila({ totalMinutes: 0, totalMinutesSumados: 100 }));
    expect(d).toBeNull();
  });
});

describe('desacuerdoConLaPlanilla: el umbral, contra los datos reales', () => {
  it('el umbral es 1,1 y cae en el hueco de la medición', () => {
    expect(UMBRAL_DESACUERDO).toBe(1.1);
    // La que más se acerca por abajo: 1,07. La que menos por arriba: 1,15.
    expect(desacuerdoConLaPlanilla(fila({ totalMinutes: 100, totalMinutesSumados: 107 }))).toBeNull();
    expect(desacuerdoConLaPlanilla(fila({ totalMinutes: 100, totalMinutesSumados: 115 }))).not.toBeNull();
  });

  it('se puede mover para probar', () => {
    const f = fila({ totalMinutes: 100, totalMinutesSumados: 105 });
    expect(desacuerdoConLaPlanilla(f, 1.01)).not.toBeNull();
    expect(desacuerdoConLaPlanilla(f, 1.10)).toBeNull();
  });

  it('justo en el umbral SÍ se muestra', () => {
    expect(desacuerdoConLaPlanilla(fila({ totalMinutes: 100, totalMinutesSumados: 110 }))).not.toBeNull();
  });
});

describe('explicacionDesacuerdo', () => {
  it('dice el número de la hoja, cuántas veces y por qué', () => {
    expect(explicacionDesacuerdo({ minutos: 14328, cph: 320, factor: 3.11, solapadas: 118 }))
      .toBe('La hoja del bono le cuenta 238,8 h —3,11 veces estas— porque suma 118 lapsos que se pisan con otro.');
  });

  it('el singular no queda feo', () => {
    expect(explicacionDesacuerdo({ minutos: 120, cph: 100, factor: 1.2, solapadas: 1 }))
      .toContain('porque suma 1 lapso que se pisa con otro');
  });
});
