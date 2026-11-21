// Las formas que viajan entre la API de Mantención y las pantallas. Las columnas de la base están
// en sql/2026-11-19_mantencion_fase1.sql; acá van en camelCase, como el resto de la app.

export const ESTADOS_SOLICITUD = [
  'pendiente', 'programada', 'en_ejecucion', 'por_cerrar', 'cerrada', 'no_resuelta', 'descartada',
] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export const URGENCIAS = ['leve', 'media', 'urgente'] as const;
export type Urgencia = (typeof URGENCIAS)[number];

export const TIPOS_COMENTARIO = ['pregunta', 'respuesta', 'nota_mantencion'] as const;
export type TipoComentario = (typeof TIPOS_COMENTARIO)[number];

export interface ComentarioMant {
  id: number;
  solicitudId: string;
  tipo: TipoComentario;
  texto: string;
  autorNombre: string | null;
  creadoEn: string;
}

export interface FotoMant {
  id: number;
  tipo: 'antes' | 'despues';
  /** URL firmada, vence en una hora. `null` si no se pudo firmar. */
  url: string | null;
}

export interface SolicitudMant {
  id: string;
  codigoTienda: string;
  nombreTienda: string;
  categoria: string | null;
  descripcion: string;
  /** `null` = sin clasificar: solo Mantención la clasifica. */
  urgencia: Urgencia | null;
  estado: EstadoSolicitud;
  origen: 'app' | 'whatsapp';
  duplicadaDe: string | null;
  esperaMaterial: boolean;
  creadaPorNombre: string | null;
  creadaEn: string;
  fotos: FotoMant[];
  comentarios: ComentarioMant[];
}

export interface TiendaMant {
  codigo: string;
  nombre: string;
  /** Etiqueta de Mantención: RM, Costa, Ruta Sur, Ruta Norte o «Sin zona». */
  zona: string;
}

/** Lo que cada pantalla necesita saber de quién la abre. */
export interface ContextoMant {
  tiendas: TiendaMant[];
  categorias: string[];
  veTodo: boolean;
}
