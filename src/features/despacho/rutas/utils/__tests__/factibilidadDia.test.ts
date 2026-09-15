import { describe, it, expect } from 'vitest';
import {
  diagnosticarDia, cuellosDeBotella, sugerenciasPara, resumenCuello,
} from '../factibilidadDia';

// El lunes de la captura: tres tiendas comparten la ventana 08:30-09:30.
const TIENDAS = {
  '56PZA': { v: '09:00-12:00' },
  '55ITA': { v: '09:00-12:00' },
  '29CFL': { v: '08:30-09:30' },
  '18FLO': { v: '09:30-12:00' },
  '23PEÑ': { v: '09:00-11:00' },
  '49PTA': { v: '08:30-09:30' },
  '17MAI': { v: '08:30-09:30' },
};
const CODS = Object.keys(TIENDAS);
const SALIDA = 8 * 60 + 30;   // 08:30

describe('el día de 40 min/parada: imposible, y se puede demostrar', () => {
  const o = { salidaMin: SALIDA, servicioMin: 40 };

  it('detecta que no cabe', () => {
    expect(diagnosticarDia(CODS, TIENDAS, o).factible).toBe(false);
  });

  it('señala la ventana 08:30-09:30: 60 min disponibles, 3 tiendas × 40 = 120', () => {
    const [peor] = cuellosDeBotella(CODS, TIENDAS, o);
    expect(peor.ventana).toBe('08:30-09:30');
    expect(peor.minutosDisponibles).toBe(60);
    expect(peor.minutosNecesarios).toBe(120);
    expect(peor.cabenMax).toBe(1);      // floor(60/40)
    expect(peor.sobran).toBe(2);
  });

  it('el resumen se explica solo', () => {
    const t = resumenCuello(diagnosticarDia(CODS, TIENDAS, o));
    expect(t).toContain('08:30-09:30');
    expect(t).toContain('3 tiendas');
    expect(t).toContain('solo caben 1');
    expect(t).toContain('60 min disponibles');
  });
});

describe('con 15 min/parada el mismo día sí cabe', () => {
  const o = { salidaMin: SALIDA, servicioMin: 15 };

  it('la ventana temprana deja de ser cuello: floor(60/15) = 4 ≥ 3', () => {
    expect(cuellosDeBotella(CODS, TIENDAS, o)).toEqual([]);
    expect(diagnosticarDia(CODS, TIENDAS, o).factible).toBe(true);
  });

  it('un día factible no trae sugerencias: no hay nada que resolver', () => {
    expect(diagnosticarDia(CODS, TIENDAS, o).sugerencias).toEqual([]);
  });
});

describe('sugerencias con números, no consejos genéricos', () => {
  const o = { salidaMin: SALIDA, servicioMin: 40 };
  const sug = () => diagnosticarDia(CODS, TIENDAS, o).sugerencias;

  it('dice CUÁNTOS minutos de atención harían que entren', () => {
    // 60 disponibles / 3 tiendas = 20 min por parada.
    const s = sug().find(x => x.tipo === 'atencion');
    expect(s?.texto).toContain('20 min/parada');
    expect(s?.texto).toContain('entran las 3');
  });

  it('dice CUÁLES tiendas mover, no "mueve algunas"', () => {
    const s = sug().find(x => x.tipo === 'mover-tiendas');
    expect(s?.texto).toContain('Mover 2 de las 3');
    expect(s?.texto).toMatch(/49PTA|17MAI/);
  });

  it('dice cuántos camiones haría falta para esa ventana', () => {
    expect(sug().find(x => x.tipo === 'segundo-camion')?.texto).toContain('3 camiones');
  });

  it('NO ofrece adelantar la salida cuando ya se sale cuando abren', () => {
    // Salida 08:30 y la ventana abre 08:30: adelantar no gana nada.
    expect(sug().some(x => x.tipo === 'salida')).toBe(false);
  });

  it('SÍ la ofrece cuando se sale tarde, con los minutos que gana', () => {
    const s = sugerenciasPara(
      cuellosDeBotella(CODS, TIENDAS, { salidaMin: 9 * 60, servicioMin: 40 })[0],
      { salidaMin: 9 * 60, servicioMin: 40 },
    ).find(x => x.tipo === 'salida');
    expect(s?.texto).toContain('Saliendo 08:30 en vez de 09:00');
    expect(s?.texto).toContain('30 min');
  });

  it('la más barata va primero: cambiar un parámetro antes que pedir un camión', () => {
    const tipos = sug().map(s => s.tipo);
    expect(tipos.indexOf('atencion')).toBeLessThan(tipos.indexOf('segundo-camion'));
    expect(tipos.indexOf('mover-tiendas')).toBeLessThan(tipos.indexOf('segundo-camion'));
  });
});

describe('la cota no da falsas alarmas', () => {
  it('una tienda sola en su ventana nunca es cuello', () => {
    expect(cuellosDeBotella(['A'], { A: { v: '08:30-09:30' } }, { salidaMin: SALIDA, servicioMin: 55 })).toEqual([]);
  });

  it('justo en el límite NO se avisa: 2 tiendas × 30 min en 60 min caben', () => {
    const t = { A: { v: '08:30-09:30' }, B: { v: '08:30-09:30' } };
    expect(cuellosDeBotella(['A', 'B'], t, { salidaMin: SALIDA, servicioMin: 30 })).toEqual([]);
  });

  it('un minuto más de atención y ya no caben', () => {
    const t = { A: { v: '08:30-09:30' }, B: { v: '08:30-09:30' } };
    expect(cuellosDeBotella(['A', 'B'], t, { salidaMin: SALIDA, servicioMin: 31 })).toHaveLength(1);
  });

  it('las tiendas SIN ventana no compiten por minutos', () => {
    const t = { A: { v: '' }, B: { v: null }, C: { v: 'a convenir' } };
    expect(cuellosDeBotella(['A', 'B', 'C'], t, { salidaMin: SALIDA, servicioMin: 60 })).toEqual([]);
  });

  it('si el camión sale DESPUÉS de que cierra, no quedan minutos', () => {
    const t = { A: { v: '08:00-09:00' }, B: { v: '08:00-09:00' } };
    const [peor] = cuellosDeBotella(['A', 'B'], t, { salidaMin: 10 * 60, servicioMin: 15 });
    expect(peor.minutosDisponibles).toBe(0);
    expect(peor.cabenMax).toBe(0);
  });

  it('con cabenMax 0 la sugerencia del camión no miente: ninguna entra', () => {
    const t = { A: { v: '08:00-09:00' }, B: { v: '08:00-09:00' } };
    const o = { salidaMin: 10 * 60, servicioMin: 15 };
    const s = sugerenciasPara(cuellosDeBotella(['A', 'B'], t, o)[0], o).find(x => x.tipo === 'segundo-camion');
    expect(s?.texto).toContain('NINGUNA');
  });
});

describe('varios cuellos', () => {
  it('el más grave va primero: es el que hay que resolver', () => {
    const t = {
      A: { v: '08:30-09:30' }, B: { v: '08:30-09:30' },                      // sobra 1
      C: { v: '10:00-11:00' }, D: { v: '10:00-11:00' }, E: { v: '10:00-11:00' }, // sobran 2
    };
    const c = cuellosDeBotella(['A','B','C','D','E'], t, { salidaMin: SALIDA, servicioMin: 40 });
    expect(c[0].ventana).toBe('10:00-11:00');
    expect(c[0].sobran).toBe(2);
  });

  it('sin paradas no hay cuello', () => {
    expect(diagnosticarDia([], {}, { salidaMin: SALIDA, servicioMin: 40 })).toMatchObject({ factible: true, cuellos: [] });
  });
});
