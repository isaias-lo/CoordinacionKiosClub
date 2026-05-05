export type TipoAuditoria = 'comida' | 'hogar' | 'aseo' | 'completo' | 'comida-aseo' | 'aseo-hogar';
export type CorreccionAuditoria = 'correcto' | 'cruce' | 'faltante' | 'sobrante';
export type ResultadoAuditoria = 'bueno' | 'malo';

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
}

export interface AuditEntry {
  id: string;
  fecha: string;
  hora: string;
  auditor: string;
  tiendaCod: string;
  tiendaNombre: string;
  tiendaArea: 'regiones' | 'santiago';
  tipo: TipoAuditoria;
  operacionOdoo: string;
  pallets: number;
  errores: number;
  correccion: CorreccionAuditoria;
  resultado: ResultadoAuditoria;
}
