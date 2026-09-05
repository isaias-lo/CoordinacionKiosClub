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
import type { ConfigZonas } from '@/features/despacho/rutas/utils/zonasTransporte';

// Los datos de Sendu se piden segun QUIEN transporta la zona, no segun geografia. Estas dos
// configuraciones son las que separan un caso del otro, y van explicitas en cada test: apoyarse
// en ZONAS_DEFAULT haria que pasaran por la razon equivocada (su `sur` es una foto del 29/08,
// anterior al traspaso a Luis Fica).
const ZONA = (empresas: string[]): ConfigZonas => ({
  sur:      { zona: 'sur',      modo: 'consolidacion', empresas,                             orden: 1, activo: true },
  norte:    { zona: 'norte',    modo: 'consolidacion', empresas: ['Falabella'],              orden: 2, activo: true },
  costa:    { zona: 'costa',    modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 3, activo: true },
  santiago: { zona: 'santiago', modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 4, activo: true },
});
const SUR_FALABELLA = ZONA(['Falabella']);   // como era antes del traspaso
const SUR_LUIS      = ZONA(['Luis Fica']);   // la realidad desde el 31/08/2026

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
    ], SUR_FALABELLA);
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
    ], SUR_FALABELLA);
    expect(incompletas.map(i => i.cod)).not.toContain('94FUL');
  });

  // El caso 60PBL: la tienda se agrega igual —tiene que aparecer en Bodega— pero desde que
  // Luis Fica lleva el sur no se le exigen datos que ya no alimentan ningun Excel.
  it('si la zona ya no la lleva Falabella, no se piden datos de Sendu', () => {
    const { agregadas, incompletas } = registrarTiendasBD([
      fila('95SUR', 'Tienda Del Sur'),
    ], SUR_LUIS);
    expect(agregadas).toContain('95SUR');          // igual entra al catalogo
    expect(incompletas.map(i => i.cod)).not.toContain('95SUR');
  });

  it('la misma tienda SI se reporta mientras la zona la lleve Falabella', () => {
    const { incompletas } = registrarTiendasBD([
      fila('96SUR', 'Otra Del Sur'),
    ], SUR_FALABELLA);
    expect(incompletas.map(i => i.cod)).toContain('96SUR');
  });
});
