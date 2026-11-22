import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// La ruta crea una solicitud con service role. Lo que se prueba acá es lo que NO se puede
// comprobar en producción sin dejar filas que no se pueden borrar (trigger `mant_prohibir_borrado`):
// quién puede pedir para qué tienda, el orden fotos → fila, la limpieza y la idempotencia.

type Op = { tipo: string; tabla?: string; datos?: unknown };
let ops: Op[] = [];
let persona: { id: string; role: string; name: string } | null = null;
let tiendas: { codigo: string; nombre: string; zona: string }[] = [];
let existente: { id: string; codigo_tienda: string } | null = null;
let fallaSubida = false;
let errorInsert: { code?: string; message: string } | null = null;
let fotosYaColgadas = 0;

vi.mock('@/lib/apiAuth', () => ({ verifyPersona: async () => persona }));

vi.mock('@/lib/mantencionServer', async (original) => ({
  ...(await original<typeof import('@/lib/mantencionServer')>()),
  tiendasDe: async () => tiendas,
}));

vi.mock('@/lib/supabaseServer', () => ({
  supabaseServer: () => ({
    from(tabla: string) {
      let insertado: unknown = null;
      const q = {
        select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, range: () => q,
        insert(datos: unknown) {
          insertado = datos;
          ops.push({ tipo: 'insert', tabla, datos });
          return q;
        },
        maybeSingle: async () => ({ data: tabla === 'mant_solicitudes' ? existente : null, error: null }),
        then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
          let r: unknown = { data: null, error: null };
          if (tabla === 'mant_solicitudes' && insertado) r = { data: null, error: errorInsert };
          if (tabla === 'mant_fotos' && !insertado) r = { data: null, error: null, count: fotosYaColgadas };
          return Promise.resolve(r).then(ok, ko);
        },
      };
      return q;
    },
    storage: {
      from: () => ({
        upload: async (ruta: string) => {
          ops.push({ tipo: 'upload', datos: ruta });
          return { error: fallaSubida ? { message: 'caído' } : null };
        },
        remove: async (rutas: string[]) => { ops.push({ tipo: 'remove', datos: rutas }); return { error: null }; },
      }),
    },
  }),
}));

const { POST } = await import('../solicitudes/route');

const FOTO = `data:image/jpeg;base64,${Buffer.alloc(2000, 1).toString('base64')}`;
const post = (cuerpo: unknown) => POST(new NextRequest('http://x/api/mantencion/solicitudes', {
  method: 'POST', body: JSON.stringify(cuerpo), headers: { 'content-type': 'application/json' },
}));
const cuerpo = (extra: Record<string, unknown> = {}) =>
  ({ codigoTienda: '26ALC', descripcion: 'La vitrina no enfría', fotos: [FOTO, FOTO], clientOpId: 'op-1', ...extra });
const inserts = (tabla: string) => ops.filter(o => o.tipo === 'insert' && o.tabla === tabla);

beforeEach(() => {
  ops = [];
  persona = { id: 'u-sup', role: 'supervisor-tienda', name: 'Ingri' };
  tiendas = [{ codigo: '26ALC', nombre: 'Alcántara', zona: 'RM' }];
  existente = null;
  fallaSubida = false;
  errorInsert = null;
  fotosYaColgadas = 0;
});

describe('POST /api/mantencion/solicitudes', () => {
  it('sin sesión, 401 y no toca nada', async () => {
    persona = null;
    expect((await post(cuerpo())).status).toBe(401);
    expect(ops).toEqual([]);
  });

  it('una tienda que no es suya: 400, sin subir ni escribir nada', async () => {
    const r = await post(cuerpo({ codigoTienda: '31TLC' }));
    expect(r.status).toBe(400);
    expect(ops).toEqual([]);
  });

  it('sin fotos o con un PDF: 400, sin escribir', async () => {
    expect((await post(cuerpo({ fotos: [] }))).status).toBe(400);
    expect((await post(cuerpo({ fotos: ['data:application/pdf;base64,AAAA'] }))).status).toBe(400);
    expect(ops).toEqual([]);
  });

  it('crea: sube las fotos ANTES de la fila, después registra fotos y bitácora', async () => {
    const r = await post(cuerpo());
    expect(r.status).toBe(200);
    const { id } = await r.json();
    expect(ops.map(o => o.tipo === 'insert' ? `insert:${o.tabla}` : o.tipo)).toEqual([
      'upload', 'upload', 'insert:mant_solicitudes', 'insert:mant_fotos', 'insert:mant_eventos',
    ]);
    const fila = inserts('mant_solicitudes')[0].datos as Record<string, unknown>;
    expect(fila).toMatchObject({ id, codigo_tienda: '26ALC', origen: 'app', creada_por: 'u-sup', client_op_id: 'op-1' });
    expect(fila).not.toHaveProperty('urgencia'); // la tienda no clasifica
    for (const o of ops.filter(x => x.tipo === 'upload')) {
      expect(String(o.datos)).toMatch(new RegExp(`^\\d{4}/\\d{2}/26ALC/${id}/[0-9a-f-]+\\.jpg$`));
    }
  });

  it('el supervisor no puede cargar «por WhatsApp»: el origen queda app', async () => {
    await post(cuerpo({ origen: 'whatsapp' }));
    expect((inserts('mant_solicitudes')[0].datos as { origen: string }).origen).toBe('app');
  });

  it('Mantención sí puede cargarla por WhatsApp', async () => {
    persona = { id: 'u-jesus', role: 'encargado-mantencion', name: 'Jesús' };
    await post(cuerpo({ origen: 'whatsapp' }));
    expect((inserts('mant_solicitudes')[0].datos as { origen: string }).origen).toBe('whatsapp');
  });

  it('si la subida falla, no se crea la solicitud (no se podría borrar después)', async () => {
    fallaSubida = true;
    const r = await post(cuerpo());
    expect(r.status).toBe(502);
    expect(inserts('mant_solicitudes')).toEqual([]);
  });

  it('si el INSERT falla, se borran las fotos ya subidas', async () => {
    errorInsert = { message: 'columna inexistente' };
    const r = await post(cuerpo());
    expect(r.status).toBe(500);
    const subidas = ops.filter(o => o.tipo === 'upload').map(o => o.datos);
    expect(ops.find(o => o.tipo === 'remove')?.datos).toEqual(subidas);
  });

  it('reenvío con el mismo clientOpId: devuelve la que ya existe, sin crear otra', async () => {
    existente = { id: 'ya-esta', codigo_tienda: '26ALC' };
    fotosYaColgadas = 2;
    const r = await post(cuerpo());
    expect(await r.json()).toEqual({ id: 'ya-esta', yaExistia: true });
    expect(inserts('mant_solicitudes')).toEqual([]);
    expect(ops.filter(o => o.tipo === 'upload')).toEqual([]);
  });

  it('reenvío de una que quedó sin fotos: se las cuelga, sin crear otra solicitud', async () => {
    existente = { id: 'ya-esta', codigo_tienda: '26ALC' };
    fotosYaColgadas = 0;
    await post(cuerpo());
    expect(inserts('mant_solicitudes')).toEqual([]);
    expect(ops.filter(o => o.tipo === 'upload')).toHaveLength(2);
    expect((inserts('mant_fotos')[0].datos as { solicitud_id: string }[]).every(f => f.solicitud_id === 'ya-esta')).toBe(true);
  });
});
