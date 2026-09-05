import { describe, it, expect } from 'vitest';
import { isRegionesCod, REGIONES_CODS } from '../tiendas';
import { TIENDAS_SANTIAGO } from '../../../santiago/data/tiendasSantiago';

describe('isRegionesCod', () => {
  it('reconoce tiendas de Regiones', () => {
    expect(isRegionesCod('39PSB')).toBe(true); // La Serena
    expect(isRegionesCod('41ANA')).toBe(true); // Antofagasta
    expect(isRegionesCod('42ANP')).toBe(true); // Antofagasta
    expect(isRegionesCod('76PAN')).toBe(true); // Panguipulli
  });

  it('NO marca como Regiones una tienda de Santiago', () => {
    expect(isRegionesCod('49PTA')).toBe(false); // Los Toros (Puente Alto)
    expect(isRegionesCod('55ITA')).toBe(false); // Barrio Italia
  });

  it('separación limpia: ningún cod de Santiago está en REGIONES_CODS', () => {
    const solapados = TIENDAS_SANTIAGO
      .map(t => t.cod)
      .filter(cod => REGIONES_CODS.has(cod));
    expect(solapados).toEqual([]);
  });
});

// ─── Hidratación desde la BD (60PBL / 38SP2 y toda tienda nueva) ──────────────
import { registrarTiendasBD, esSectorRegiones, TIENDAS } from '../tiendas';

describe('esSectorRegiones', () => {
  it('acepta Región Sur/Norte y "Región" a secas, con o sin tilde', () => {
    for (const s of ['Región Sur', 'Región Norte', 'Región', 'region sur', 'REGIÓN'])
      expect(esSectorRegiones(s)).toBe(true);
  });
  it('rechaza sectores de Santiago/Costa y vacíos', () => {
    for (const s of ['Corredor Oriente', 'Costa', '', null, undefined])
      expect(esSectorRegiones(s as string)).toBe(false);
  });
});

describe('registrarTiendasBD', () => {
  const fila = (codigo: string, nombre: string, extra: Record<string, unknown> = {}) =>
    ({ codigo, nombre, sector_comuna: 'Región Sur', region: 'Araucanía', activo: true, ...extra });

  it('agrega una tienda nueva de Regiones y la vuelve agrupable', () => {
    expect(isRegionesCod('60PBL')).toBe(false);          // antes del registro
    const { agregadas } = registrarTiendasBD([fila('60PBL', 'Los Pablos')]);
    expect(agregadas).toContain('60PBL');
    expect(isRegionesCod('60PBL')).toBe(true);            // ← el bug de "no se agrupa en Regiones"
    expect(TIENDAS['Los Pablos']?.cod).toBe('60PBL');     // ← el bug de "no aparece en Bodega"
  });

  it('es idempotente: llamarla dos veces no duplica', () => {
    const antes = Object.keys(TIENDAS).length;
    registrarTiendasBD([fila('60PBL', 'Los Pablos')]);
    expect(Object.keys(TIENDAS).length).toBe(antes);
  });

  it('NO pisa una tienda ya curada en SENDU_EXTRAS', () => {
    const original = TIENDAS['Valdivia'];
    registrarTiendasBD([fila('53VAL', 'Valdivia', { region: 'OTRA' })]);
    expect(TIENDAS['Valdivia']).toBe(original);          // intacta
    expect(TIENDAS['Valdivia'].region_sendu).toBe('Los_Ríos');
  });

  it('ignora inactivas, sin código/nombre, y las que no son de Regiones', () => {
    const antes = REGIONES_CODS.size;
    registrarTiendasBD([
      fila('90XXX', 'Inactiva',  { activo: false }),
      fila('91XXX', '',          {}),
      { codigo: '', nombre: 'Sin código', sector_comuna: 'Región Sur', activo: true },
      fila('92XXX', 'De Santiago', { sector_comuna: 'Corredor Oriente' }),
    ]);
    expect(REGIONES_CODS.size).toBe(antes);
  });

  it('mapea los datos que la BD sí tiene y reporta la que queda incompleta para Sendu', () => {
    const { incompletas } = registrarTiendasBD([
      fila('93NUE', 'Tienda Nueva', { correos: 'nueva@kiosclub.com', tel_encargado: '999', direccion: 'Av. Siempreviva 742' }),
    ]);
    const t = TIENDAS['Tienda Nueva'];
    expect(t.email).toBe('nueva@kiosclub.com');
    expect(t.celular).toBe('999');
    expect(t.calle).toBe('Av. Siempreviva 742');
    expect(t.rut).toBe('76360868-9');
    // Ahora se reporta QUÉ le falta, no solo que vino de la BD.
    expect(incompletas.map(i => i.cod)).toContain('93NUE');
    expect(incompletas.find(i => i.cod === '93NUE')!.falta)
      .toEqual(['región Sendu', 'comuna', 'número']);
  });

  it('una tienda de la BD CON todos los datos de envío no se reporta', () => {
    const { incompletas } = registrarTiendasBD([
      fila('94FUL', 'Tienda Completa', {
        correos: 'full@kiosclub.com', tel_encargado: '999',
        region_sendu: 'Araucanía', comuna: 'Temuco', calle: 'Av. Alemania', numero: '850',
      }),
    ]);
    expect(incompletas.map(i => i.cod)).not.toContain('94FUL');
  });
});
