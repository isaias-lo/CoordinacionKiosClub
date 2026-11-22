import { describe, it, expect } from 'vitest';
import { solicitudDeFila, comentarioDeFila, type FilaSolicitud } from '../filas';

const fila: FilaSolicitud = {
  id: 's1', codigo_tienda: '26ALC', categoria: ' Eléctrico ', descripcion: 'No hay luz',
  urgencia: null, estado: 'pendiente', origen: 'app', duplicada_de: null, espera_material: null,
  creada_por_nombre: 'Ingri', created_at: '2026-11-21T15:00:00Z',
};

describe('solicitudDeFila', () => {
  it('pasa a camelCase y limpia la categoría', () => {
    expect(solicitudDeFila(fila, { nombreTienda: 'Alcántara' })).toMatchObject({
      id: 's1', codigoTienda: '26ALC', nombreTienda: 'Alcántara', categoria: 'Eléctrico',
      urgencia: null, estado: 'pendiente', esperaMaterial: false, fotos: [], comentarios: [],
    });
  });

  it('sin nombre de tienda usa el código', () => {
    expect(solicitudDeFila(fila).nombreTienda).toBe('26ALC');
  });

  it('categoría vacía es «sin categoría»', () => {
    expect(solicitudDeFila({ ...fila, categoria: '  ' }).categoria).toBeNull();
  });

  it('un estado o una urgencia que la app no conoce no pasan tal cual', () => {
    const s = solicitudDeFila({ ...fila, estado: 'inventado', urgencia: 'altísima' });
    expect(s.estado).toBe('pendiente');
    expect(s.urgencia).toBeNull();
  });

  it('cualquier origen que no sea whatsapp es app', () => {
    expect(solicitudDeFila({ ...fila, origen: 'whatsapp' }).origen).toBe('whatsapp');
    expect(solicitudDeFila({ ...fila, origen: 'otro' }).origen).toBe('app');
  });
});

describe('comentarioDeFila', () => {
  it('pasa a camelCase', () => {
    expect(comentarioDeFila({
      id: 1, solicitud_id: 's1', tipo: 'pregunta', texto: '¿Desde cuándo?', autor_nombre: 'Jesús',
      created_at: '2026-11-21T15:00:00Z',
    })).toEqual({
      id: 1, solicitudId: 's1', tipo: 'pregunta', texto: '¿Desde cuándo?', autorNombre: 'Jesús',
      creadoEn: '2026-11-21T15:00:00Z',
    });
  });

  it('un tipo desconocido se descarta', () => {
    expect(comentarioDeFila({
      id: 1, solicitud_id: 's1', tipo: 'chisme', texto: 'x', autor_nombre: null, created_at: '',
    })).toBeNull();
  });
});
