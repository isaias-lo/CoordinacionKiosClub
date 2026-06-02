// Tipos para la tabla trazabilidad_unidades
// Espeja TRAZABILIDAD_ABASTECIMIENTO_PROD

export type TrazabilidadEstado =
  | 'CREADO'
  | 'EN_RUTA'
  | 'RECIBIDO_CONFORME'
  | 'RECIBIDO_INCIDENCIA'
  | 'CERRADO';

export type TrazabilidadTipoUnidad = 'Pallet' | 'Bulto' | 'Contenedor';

export type TrazabilidadRegimen = 'Seco' | 'Refrigerado' | 'Congelado';

export type TrazabilidadTipoCarga = 'Alimentos' | 'Hogar' | 'Mixto';

export type TrazabilidadTipoIncidencia =
  | 'Faltante'
  | 'Daño'
  | 'Temperatura'
  | 'Sello roto'
  | 'Exceso'
  | 'Otro';

export type TrazabilidadEstadoResolucion =
  | 'PENDIENTE'
  | 'EN_REVISION'
  | 'RESUELTO'
  | 'RECHAZADO';

export type TrazabilidadIndicadorLlegada = 'OK' | 'TARDE';

export type TrazabilidadAlertaTemp = 'OK' | 'ALERTA' | 'CRITICO';

export interface TrazabilidadUnidad {
  id_unidad_logistica:       string;
  codigo_qr:                 string | null;
  url_qr:                    string | null;
  numero_guia:               string | null;
  tipo_unidad:               TrazabilidadTipoUnidad;
  origen:                    string | null;

  codigo_tienda:             string | null;
  tienda_destino:            string | null;
  tipo_tienda:               string | null;
  comuna_destino:            string | null;
  region_destino:            string | null;
  direccion_tienda:          string | null;

  transportista:             string | null;
  tipo_carga:                TrazabilidadTipoCarga | null;
  regimen:                   TrazabilidadRegimen | null;

  peso_kg:                   number | null;
  alto_cm:                   number | null;
  ancho_cm:                  number | null;
  largo_cm:                  number | null;
  volumen_m3:                number | null;  // generado por DB

  fecha_hora_creacion:       string;
  fecha_hora_despacho:       string | null;
  fecha_tentativa_llegada:   string | null;
  ventana_horaria_recepcion: string | null;
  fecha_hora_real_llegada:   string | null;
  indicador_llegada_tiempo:  TrazabilidadIndicadorLlegada | null;
  minutos_desfase:           number | null;

  temperatura_salida:        number | null;
  temperatura_llegada:       number | null;
  alerta_temperatura:        TrazabilidadAlertaTemp | null;

  estado_actual:             TrazabilidadEstado;

  usuario_creador:           string | null;
  usuario_despacho:          string | null;
  usuario_recepcion:         string | null;
  updated_at:                string;

  tipo_incidencia:           TrazabilidadTipoIncidencia | null;
  descripcion_incidencia:    string | null;
  links_evidencia:           string[] | null;
  estado_resolucion:         TrazabilidadEstadoResolucion | null;
  observaciones:             string | null;

  origen_carga:              'manual' | 'masiva';
  reintentos_recepcion:      number;
  fecha_cierre:              string | null;
  usuario_cierre:            string | null;

  ruta_id:                   number | null;
  recepcion_id:              number | null;
}

// Payload para PUNTO 1 — Creación
export interface TrazabilidadCreatePayload {
  id_unidad_logistica:       string;
  codigo_qr?:                string;
  numero_guia?:              string;
  tipo_unidad:               TrazabilidadTipoUnidad;
  origen?:                   string;
  codigo_tienda:             string;
  tienda_destino:            string;
  tipo_tienda?:              string;
  comuna_destino?:           string;
  region_destino?:           string;
  direccion_tienda?:         string;
  transportista?:            string;
  tipo_carga?:               TrazabilidadTipoCarga;
  regimen?:                  TrazabilidadRegimen;
  peso_kg?:                  number;
  alto_cm?:                  number;
  ancho_cm?:                 number;
  largo_cm?:                 number;
  fecha_tentativa_llegada?:  string;
  ventana_horaria_recepcion?: string;
  usuario_creador?:          string;
  ruta_id?:                  number;
  origen_carga?:             'manual' | 'masiva';
}

// Payload para PUNTO 2 — Despacho / Salida CD
export interface TrazabilidadDespachoPayload {
  ids:                 string[];   // múltiples unidades de la misma ruta
  temperatura_salida?: number;
  usuario_despacho?:   string;
}

// Payload para PUNTO 3 — Recepción en Tienda
export interface TrazabilidadRecepcionPayload {
  id_unidad_logistica:      string;
  fecha_hora_real_llegada:  string;
  temperatura_llegada?:     number;
  estado_actual:            'RECIBIDO_CONFORME' | 'RECIBIDO_INCIDENCIA';
  tipo_incidencia?:         TrazabilidadTipoIncidencia;
  descripcion_incidencia?:  string;
  links_evidencia?:         string[];
  observaciones?:           string;
  usuario_recepcion?:       string;
  recepcion_id?:            number;
}

// Payload para PUNTO 4 — Cierre de incidencia
export interface TrazabilidadCierrePayload {
  id_unidad_logistica:     string;
  estado_resolucion:       TrazabilidadEstadoResolucion;
  observaciones?:          string;
  usuario_cierre?:         string;
}
