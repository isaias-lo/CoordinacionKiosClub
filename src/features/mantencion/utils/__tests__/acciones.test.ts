import { describe, it, expect } from 'vitest';
import { AccionSchema, efectoDeAccion, motivoParaNo } from '../acciones';
import type { SolicitudMant } from '../../tipos';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const sol = (p: Partial<SolicitudMant> = {}): SolicitudMant => ({
  id: U1, codigoTienda: '26ALC', nombreTienda: 'Alc', categoria: 'Eléctrico', descripcion: 'd',
  urgencia: null, estado: 'pendiente', origen: 'app', duplicadaDe: null, esperaMaterial: false,
  creadaPorNombre: null, creadaEn: '2026-11-21T13:00:00Z', fotos: [], comentarios: [], ...p,
});

describe('AccionSchema', () => {
  it('acepta las cuatro acciones bien formadas', () => {
    expect(AccionSchema.safeParse({ accion: 'clasificar', urgencia: 'media' }).success).toBe(true);
    expect(AccionSchema.safeParse({ accion: 'descartar' }).success).toBe(true);
    expect(AccionSchema.safeParse({ accion: 'unir', originalId: U2 }).success).toBe(true);
    expect(AccionSchema.safeParse({ accion: 'no_duplicado', originalId: U2 }).success).toBe(true);
  });

  it('rechaza una urgencia inventada, un id que no es uuid y acciones de la Fase 2', () => {
    expect(AccionSchema.safeParse({ accion: 'clasificar', urgencia: 'altísima' }).success).toBe(false);
    expect(AccionSchema.safeParse({ accion: 'unir', originalId: 'abc' }).success).toBe(false);
    expect(AccionSchema.safeParse({ accion: 'cerrar' }).success).toBe(false);
    expect(AccionSchema.safeParse({ estado: 'cerrada' }).success).toBe(false);
  });
});

describe('motivoParaNo', () => {
  it('sobre una abierta, clasificar y descartar se pueden', () => {
    expect(motivoParaNo({ accion: 'clasificar', urgencia: 'leve' }, sol())).toBeNull();
    expect(motivoParaNo({ accion: 'descartar' }, sol())).toBeNull();
  });

  it('una cerrada, descartada o unida no se toca', () => {
    expect(motivoParaNo({ accion: 'clasificar', urgencia: 'leve' }, sol({ estado: 'cerrada' }))).toMatch(/abierta/);
    expect(motivoParaNo({ accion: 'descartar' }, sol({ estado: 'descartada' }))).toMatch(/abierta/);
    expect(motivoParaNo({ accion: 'descartar' }, sol({ duplicadaDe: U2 }))).toMatch(/abierta/);
  });

  it('unir exige una original abierta, distinta y de la misma tienda', () => {
    const accion = { accion: 'unir', originalId: U2 } as const;
    expect(motivoParaNo(accion, sol(), sol({ id: U2 }))).toBeNull();
    expect(motivoParaNo(accion, sol(), null)).toMatch(/no existe/);
    expect(motivoParaNo(accion, sol(), sol())).toMatch(/sí misma/);
    expect(motivoParaNo(accion, sol(), sol({ id: U2, codigoTienda: '31TLC' }))).toMatch(/misma tienda/);
    expect(motivoParaNo(accion, sol(), sol({ id: U2, estado: 'cerrada' }))).toMatch(/original/);
  });

  it('«no es duplicado» no exige que la original siga abierta', () => {
    expect(motivoParaNo({ accion: 'no_duplicado', originalId: U2 }, sol(), sol({ id: U2, estado: 'cerrada' }))).toBeNull();
  });
});

describe('efectoDeAccion', () => {
  it('clasificar cambia la urgencia y lo anota', () => {
    expect(efectoDeAccion({ accion: 'clasificar', urgencia: 'urgente' }, sol({ urgencia: 'leve' }))).toEqual({
      cambios: { urgencia: 'urgente' },
      eventos: [{ campo: 'urgencia', anterior: 'leve', nuevo: 'urgente' }],
    });
  });

  it('unir la deja descartada y apuntando a la original', () => {
    const e = efectoDeAccion({ accion: 'unir', originalId: U2 }, sol());
    expect(e.cambios).toEqual({ duplicada_de: U2, estado: 'descartada' });
    expect(e.eventos.map(x => x.campo)).toEqual(['duplicada_de', 'estado']);
  });

  it('«no es duplicado» no toca la fila: solo la bitácora', () => {
    const e = efectoDeAccion({ accion: 'no_duplicado', originalId: U2 }, sol());
    expect(e.cambios).toEqual({});
    expect(e.eventos).toEqual([{ campo: 'no_es_duplicado', anterior: null, nuevo: U2 }]);
  });
});
