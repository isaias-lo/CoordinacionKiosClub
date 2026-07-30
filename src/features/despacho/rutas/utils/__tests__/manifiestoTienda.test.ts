import { describe, it, expect } from 'vitest';
import { buildManifiestoTiendaHTML, guiasDeItems, buildRecepcionQrUrl, type ItemDetalle, type TiendaManifiesto } from '../manifiestoTienda';

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

describe('buildRecepcionQrUrl', () => {
  const base = { origin: 'https://x.cl', store_cod: '37MAI', nP: 2, nBch: 3, guias: [] as string[] };

  it('arma la URL base con cod, p y b', () => {
    expect(buildRecepcionQrUrl(base)).toBe('https://x.cl/recepcion?cod=37MAI&p=2&b=3');
  });

  it('incluye &g cuando hay guías (codificadas)', () => {
    expect(buildRecepcionQrUrl({ ...base, guias: ['F1', 'F2'] })).toContain('&g=F1%2CF2');
  });

  it('incluye &drv con el link de Drive codificado (#9 guías SII)', () => {
    const url = buildRecepcionQrUrl({ ...base, driveUrl: 'https://drive.google.com/file/d/ABC/view' });
    expect(url).toContain('&drv=https%3A%2F%2Fdrive.google.com%2Ffile%2Fd%2FABC%2Fview');
  });

  it('NO incluye &drv cuando no hay driveUrl', () => {
    expect(buildRecepcionQrUrl(base)).not.toContain('drv=');
  });
});

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

  it('arma el header con campos etiquetados (Tienda, Código, Fecha, Patente, Corredor, Ventana)', () => {
    const info = { n: 'Maipú', z: 'Poniente', v: '09:00-11:00' };
    const html = buildManifiestoTiendaHTML(TIENDA, info, [item()], META);
    // El header va desde la grilla de campos hasta la tabla de detalle.
    const header = html.slice(html.indexOf('tienda-hdr-grid'), html.indexOf('<table>'));
    // etiquetas
    expect(header).toContain('>Tienda<');
    expect(header).toContain('>Código de tienda<');
    expect(header).toContain('>Fecha<');
    expect(header).toContain('>Patente<');
    expect(header).toContain('>Corredor<');
    expect(header).toContain('>Ventana horaria<');
    // valores
    expect(header).toContain('Maipú');       // nombre tienda
    expect(header).toContain('37MAI');        // código de tienda
    expect(header).toContain('AB1234');       // patente
    expect(header).toContain('Poniente');     // corredor (zona)
    expect(header).toContain('09:00-11:00');  // ventana horaria
    expect(header).toContain('julio');        // fecha formateada
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
    // El QR se genera localmente (data URI), sin depender de servicios externos.
    expect(html).toContain('data:image/gif;base64,');
    expect(html).not.toContain('api.qrserver.com');
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

  it('marca la copia ORIGINAL vs CEDIBLE en el comprobante', () => {
    const orig = buildManifiestoTiendaHTML(TIENDA, undefined, [item()], META, 'ORIGINAL');
    const ced  = buildManifiestoTiendaHTML(TIENDA, undefined, [item()], META, 'CEDIBLE');
    expect(orig).toContain('>ORIGINAL<');
    expect(orig).not.toContain('>CEDIBLE<');
    expect(ced).toContain('>CEDIBLE<');
    expect(ced).not.toContain('>ORIGINAL<');
  });

  it('por defecto (sin copia) es ORIGINAL', () => {
    expect(buildManifiestoTiendaHTML(TIENDA, undefined, [item()], META)).toContain('>ORIGINAL<');
  });

  it('muestra placeholder cuando no hay ítems', () => {
    const html = buildManifiestoTiendaHTML(TIENDA, undefined, [], META);
    expect(html).toContain('Sin detalle de ítems etiquetados para esta tienda.');
  });
});
