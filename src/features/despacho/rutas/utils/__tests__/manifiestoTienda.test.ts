import { describe, it, expect } from 'vitest';
import { buildManifiestoTiendaHTML, guiasDeItems, type ItemDetalle, type TiendaManifiesto } from '../manifiestoTienda';

function item(overrides: Partial<ItemDetalle> = {}): ItemDetalle {
  return {
    id: 4030,
    canonical_id: 'P201TPS07072026P',
    tipo: 'P',
    seq: 1,
    contenido: 'hogar',
    peso_kg: 12.5,
    alto: null,
    largo: null,
    ancho: null,
    refs: 'F123+F456',
    ...overrides,
  };
}

const TIENDA: TiendaManifiesto = {
  store_cod: '37MAI',
  nombre: 'Maipú',
  ventana: '09:00-11:00',
  orden: 1,
  pallets: 1,
  bultos: 0,
  chocolates: 0,
  contenedores: 0,
};

const META = {
  fecha: '2026-07-08',
  codigo_ruta: 'RUTA-080726-01',
  chofer: 'Juan Pérez',
  patente: 'AB1234',
  supervisor: 'María Soto',
  origin: 'https://enrutador.kiosclub.cl',
};

describe('guiasDeItems', () => {
  it('separa por "+", recorta espacios y descarta vacíos', () => {
    expect(guiasDeItems([item({ refs: ' F1 + F2+F3 ' })])).toEqual(['F1', 'F2', 'F3']);
  });

  it('deduplica guías repetidas entre distintos ítems', () => {
    const items = [item({ refs: 'F1+F2' }), item({ id: 2, refs: 'F2+F3' })];
    expect(guiasDeItems(items)).toEqual(['F1', 'F2', 'F3']);
  });

  it('devuelve [] cuando no hay ítems ni refs', () => {
    expect(guiasDeItems([])).toEqual([]);
    expect(guiasDeItems([item({ refs: '' })])).toEqual([]);
  });
});

describe('buildManifiestoTiendaHTML', () => {
  it('muestra el número de etiqueta física (#id) en vez del canonical_id', () => {
    const html = buildManifiestoTiendaHTML(TIENDA, undefined, [item({ id: 4030 })], META);
    expect(html).toContain('#4030');
    expect(html).not.toContain('P201TPS07072026P');
  });

  it('arma el header con TIENDA · FECHA · PATENTE arriba y COMUNA · VENTANA al centro', () => {
    const info = { n: 'Maipú', z: 'Maipú (RM)', v: '09:00-11:00' };
    const html = buildManifiestoTiendaHTML(TIENDA, info, [item()], META);
    const topMatch = html.match(/tienda-hdr-top">([\s\S]*?)<\/div>/);
    const centerMatch = html.match(/tienda-hdr-center">([\s\S]*?)<\/div>/);
    expect(topMatch?.[1]).toContain('Maipú');
    expect(topMatch?.[1]).toContain('AB1234'); // patente
    expect(topMatch?.[1]).toContain('julio'); // fecha formateada
    expect(centerMatch?.[1]).toContain('Maipú (RM)'); // comuna/zona
    expect(centerMatch?.[1]).toContain('09:00-11:00'); // ventana horaria
  });

  it('no incluye el campo Supervisor en el header', () => {
    const html = buildManifiestoTiendaHTML(TIENDA, undefined, [item()], META);
    expect(html.toLowerCase()).not.toContain('supervisor');
  });

  it('ubica el QR dentro del bloque de header (a la derecha)', () => {
    const html = buildManifiestoTiendaHTML(TIENDA, undefined, [item()], META);
    const hdrIdx = html.indexOf('tienda-hdr"');
    const qrIdx = html.indexOf('tienda-hdr-qr"');
    const tableIdx = html.indexOf('<table>');
    expect(hdrIdx).toBeGreaterThan(-1);
    expect(qrIdx).toBeGreaterThan(hdrIdx);
    expect(qrIdx).toBeLessThan(tableIdx);
    expect(html).toContain('api.qrserver.com');
  });

  it('ordena guías → observaciones → firmas debajo del detalle de carga', () => {
    const html = buildManifiestoTiendaHTML(TIENDA, undefined, [item()], META);
    const guiasIdx = html.indexOf('Guías / DTE asociadas');
    const observacionesIdx = html.indexOf('>Observaciones<');
    const firmasIdx = html.indexOf('>Firmas<');
    expect(guiasIdx).toBeGreaterThan(-1);
    expect(observacionesIdx).toBeGreaterThan(guiasIdx);
    expect(firmasIdx).toBeGreaterThan(observacionesIdx);
  });

  it('muestra placeholder cuando no hay ítems', () => {
    const html = buildManifiestoTiendaHTML(TIENDA, undefined, [], META);
    expect(html).toContain('Sin detalle de ítems etiquetados para esta tienda.');
  });
});
