import { describe, it, expect } from 'vitest';
import { fechaDDMM, serializarParadas, buildSalidaRow, SALIDA_HEADERS, type SalidaVehiculo } from '../flotaInterna';

describe('fechaDDMM', () => {
  it('ISO → dd/mm/yyyy', () => {
    expect(fechaDDMM('2026-08-07')).toBe('07/08/2026');
  });
  it('deja tal cual si no es ISO', () => {
    expect(fechaDDMM('07/08/2026')).toBe('07/08/2026');
    expect(fechaDDMM('')).toBe('');
  });
});

describe('serializarParadas', () => {
  it('concatena tiendas y observaciones por parada', () => {
    const { tiendas, observaciones } = serializarParadas([
      { ref: 'TPS', obs: '' },
      { ref: 'ALC', obs: 'retiro resto' },
      { ref: 'Oficina', obs: 'merma y clorox' },
    ]);
    expect(tiendas).toBe('TPS, ALC, Oficina');
    expect(observaciones).toBe('ALC: retiro resto · Oficina: merma y clorox');
  });
  it('ignora paradas sin ref y hace trim', () => {
    const { tiendas } = serializarParadas([{ ref: ' MQH ', obs: '' }, { ref: '', obs: 'x' }]);
    expect(tiendas).toBe('MQH');
  });
});

describe('buildSalidaRow', () => {
  const base: SalidaVehiculo = {
    fecha: '2026-08-07', conductor: 'Luciano Ponce', vehiculo: 'Furgón Frío', patente: 'PKZW-16',
    tipo: 'Entrega', contenido: 'congelados', obsGeneral: 'ruta congelados',
    horaSalida: '08:30', horaRegreso: '14:00',
    paradas: [{ ref: 'PZA', obs: '' }, { ref: 'SMB', obs: '' }, { ref: 'MQH', obs: 'retiro mueble' }],
  };
  it('arma la fila con N° puntos automático (nº de paradas)', () => {
    const row = buildSalidaRow(base, '2026-08-07T12:00:00Z');
    // índices por SALIDA_HEADERS
    expect(row[0]).toBe('07/08/2026');            // Fecha
    expect(row[1]).toBe('Luciano Ponce');         // Conductor
    expect(row[3]).toBe('PKZW-16');               // Patente
    expect(row[6]).toBe(3);                        // N° Puntos = 3 paradas
    expect(row[7]).toBe('PZA, SMB, MQH');         // Tiendas/Destinos
    expect(row[9]).toBe('08:30');                 // Hora Salida
  });
  it('mezcla observaciones por parada + general con —', () => {
    const row = buildSalidaRow(base, 'x');
    expect(row[8]).toBe('MQH: retiro mueble — ruta congelados'); // Observaciones
  });
  it('la fila tiene el mismo nº de columnas que los headers', () => {
    expect(buildSalidaRow(base, 'x')).toHaveLength(SALIDA_HEADERS.length);
  });
});
