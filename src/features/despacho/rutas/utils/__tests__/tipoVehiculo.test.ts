import { describe, it, expect } from 'vitest';
import { etiquetaTipoVehiculo } from '../tipoVehiculo';

describe('etiquetaTipoVehiculo', () => {
  it('las cinco formas de escribir "chico" que hay hoy en la flota dan lo mismo', () => {
    for (const v of ['Camion chico', 'Camion Chico', 'camion chico', 'Camión Chico', 'Camion Pequeño']) {
      expect(etiquetaTipoVehiculo(v)).toEqual({ texto: 'Chico', definido: true });
    }
  });

  it('mediano, incluido el dedazo "Medano" y el suelto "Mediano"', () => {
    for (const v of ['Camion Mediano', 'Camión mediano', 'Mediano', 'Camion Medano']) {
      expect(etiquetaTipoVehiculo(v).texto).toBe('Mediano');
    }
  });

  it('grande, incluido el que tiene un espacio al final', () => {
    for (const v of ['Camión Grande', 'Camion Grande', 'Camión grande', 'Camión Grande ']) {
      expect(etiquetaTipoVehiculo(v).texto).toBe('Grande');
    }
  });

  it('furgón, con y sin acento, y el "FurgónTLBD"', () => {
    for (const v of ['Furgón', 'Furgon', 'FurgónTLBD']) {
      expect(etiquetaTipoVehiculo(v).texto).toBe('Furgón');
    }
  });

  it('"Por confirmar" no es un tipo: es que falta el dato', () => {
    expect(etiquetaTipoVehiculo('Por confirmar')).toEqual({ texto: 'Tipo por confirmar', definido: false });
    expect(etiquetaTipoVehiculo('')).toEqual({ texto: 'Tipo por confirmar', definido: false });
    expect(etiquetaTipoVehiculo(null)).toEqual({ texto: 'Tipo por confirmar', definido: false });
  });

  it('una combinación se respeta tal cual: elegir una de las dos sería inventar', () => {
    expect(etiquetaTipoVehiculo('Camion Grande /Mediano')).toEqual({ texto: 'Camion Grande /Mediano', definido: true });
    expect(etiquetaTipoVehiculo('Camión mediano chico').texto).toBe('Camión mediano chico');
  });
});
