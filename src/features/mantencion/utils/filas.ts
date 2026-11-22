// De la fila de la base (snake_case) a lo que viaja a la pantalla (camelCase). Módulo puro.
//
// Los valores que la base restringe con `check` igual se revisan acá: si mañana alguien agrega un
// estado en SQL y no en `tipos.ts`, la pantalla recibe `pendiente` en vez de un texto que no sabe
// pintar, y el desajuste queda a la vista en un test en vez de en un celular.

import {
  ESTADOS_SOLICITUD, URGENCIAS, TIPOS_COMENTARIO,
  type ComentarioMant, type EstadoSolicitud, type FotoMant, type SolicitudMant, type Urgencia,
  type TipoComentario,
} from '../tipos';

export interface FilaSolicitud {
  id: string;
  codigo_tienda: string;
  categoria: string | null;
  descripcion: string;
  urgencia: string | null;
  estado: string;
  origen: string;
  duplicada_de: string | null;
  espera_material: boolean | null;
  creada_por_nombre: string | null;
  created_at: string;
}

export interface FilaComentario {
  id: number;
  solicitud_id: string;
  tipo: string;
  texto: string;
  autor_nombre: string | null;
  created_at: string;
}

const de = <T extends string>(lista: readonly T[], v: unknown): T | null =>
  (lista as readonly string[]).includes(v as string) ? (v as T) : null;

export function comentarioDeFila(f: FilaComentario): ComentarioMant | null {
  const tipo = de<TipoComentario>(TIPOS_COMENTARIO, f.tipo);
  if (!tipo) return null;
  return {
    id: f.id, solicitudId: f.solicitud_id, tipo, texto: f.texto,
    autorNombre: f.autor_nombre ?? null, creadoEn: f.created_at,
  };
}

export function solicitudDeFila(
  f: FilaSolicitud,
  extra: { nombreTienda?: string; fotos?: FotoMant[]; comentarios?: ComentarioMant[] } = {},
): SolicitudMant {
  return {
    id: f.id,
    codigoTienda: f.codigo_tienda,
    nombreTienda: extra.nombreTienda || f.codigo_tienda,
    categoria: f.categoria?.trim() ? f.categoria.trim() : null,
    descripcion: f.descripcion,
    urgencia: de<Urgencia>(URGENCIAS, f.urgencia),
    estado: de<EstadoSolicitud>(ESTADOS_SOLICITUD, f.estado) ?? 'pendiente',
    origen: f.origen === 'whatsapp' ? 'whatsapp' : 'app',
    duplicadaDe: f.duplicada_de ?? null,
    esperaMaterial: !!f.espera_material,
    creadaPorNombre: f.creada_por_nombre ?? null,
    creadaEn: f.created_at,
    fotos: extra.fotos ?? [],
    comentarios: extra.comentarios ?? [],
  };
}
