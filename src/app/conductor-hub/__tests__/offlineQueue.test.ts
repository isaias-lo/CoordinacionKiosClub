import { describe, it, expect } from 'vitest';
import { fotosSinSubir, entregaListaParaPatch, type EntregaPendiente, type FotoQueued } from '../offlineQueue';

function foto(url: string | null, blob: Blob | null = null): FotoQueued {
  return { path: `p-${url ?? 'sinurl'}-${Math.random()}`, blob, url };
}

function item(fotos: FotoQueued[]): EntregaPendiente {
  return {
    id: 'x', rutaTiendaId: 1, rutaId: 1, storeCod: '01ABC', tipo: 'seco',
    horaEntregaLocal: '2026-09-10T12:00:00Z', fotos, intentos: 0, createdAt: Date.now(),
    receptor: 'Juana Pérez', rut: '12.345.678-9',
    otpToken: 'tok', otpEmail: 'tienda@ejemplo.cl', otpCodigo: '123456',
  };
}

describe('fotosSinSubir', () => {
  it('devuelve solo las fotos sin url', () => {
    const fotos = [foto('https://x/1.jpg'), foto(null), foto(null)];
    expect(fotosSinSubir(item(fotos))).toHaveLength(2);
  });

  it('devuelve vacío si todas ya tienen url', () => {
    const fotos = [foto('https://x/1.jpg'), foto('https://x/2.jpg')];
    expect(fotosSinSubir(item(fotos))).toEqual([]);
  });
});

describe('entregaListaParaPatch', () => {
  it('false sin fotos (nunca debería pasar, pero no se marca lista por defecto)', () => {
    expect(entregaListaParaPatch(item([]))).toBe(false);
  });

  it('false si falta subir alguna', () => {
    expect(entregaListaParaPatch(item([foto('https://x/1.jpg'), foto(null)]))).toBe(false);
  });

  it('true cuando todas tienen url', () => {
    expect(entregaListaParaPatch(item([foto('https://x/1.jpg'), foto('https://x/2.jpg')]))).toBe(true);
  });
});
