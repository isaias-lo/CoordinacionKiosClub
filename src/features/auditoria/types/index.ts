export type TipoAuditoria = 'comida' | 'hogar' | 'aseo' | 'completo' | 'comida-aseo' | 'aseo-hogar';
export type CorreccionAuditoria = 'correcto' | 'cruce' | 'faltante' | 'sobrante';
export type ResultadoAuditoria = 'bueno' | 'malo';
export type SubTipo = 'comida' | 'hogar' | 'aseo';
export type TipoError = 'faltante' | 'sobrante';

export interface TiendaRef {
  cod: string;
  nombre: string;
  area: 'regiones' | 'santiago';
  region: string;
  comuna: string;
}

export interface OdooConfig {
  url: string;
  db: string;
  username: string;
  apiKey: string;
}

export interface OperacionOdoo {
  id: number;
  name: string;
  partner: string;
  state: string;
  fecha: string;
  responsable?: string;
}

export interface ProductoOdoo {
  id: number;
  codigo: string;
  nombre: string;
  cantidadEsperada?: number;
}

export interface OperacionEntry {
  subTipo: SubTipo;
  codigo: string;
}

export interface ProductoError {
  codigo: string;
  nombre: string;
  unidades: number;
  tipo: TipoError;
  cantidadEsperada?: number;
}

export interface AuditEntry {
  id: string;
  fecha: string;
  hora: string;
  auditor: string;
  picker: string;
  tiendaCod: string;
  tiendaNombre: string;
  tiendaArea: 'regiones' | 'santiago';
  tipo: TipoAuditoria;
  operaciones: OperacionEntry[];
  pallets: number;
  tieneErrores: boolean;
  tiposError: TipoError[];
  productos: ProductoError[];
  correccion: CorreccionAuditoria;
  resultado: ResultadoAuditoria;
  observaciones: string;
  reauditoriaDeId?: string;
  fotoUrl?: string;
}
