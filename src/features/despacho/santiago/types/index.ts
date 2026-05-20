export type RegimenCarga = 'Seco' | 'Congelado';
export type TipoCargamento = 'Pallet' | 'Bulto' | 'Contenedor';
export type ContenidoSantiago = 'Comida' | 'Hogar' | 'Mixto' | 'Chocolate';
export type EstadoItem =
  | 'Listo para despachar'
  | 'Despachado'
  | 'Carga recibida'
  | 'Carga No recibida por tienda';

export interface TiendaSantiago {
  region: string;
  tienda: string;
  cod: string;
  direccion: string;
  comuna: string;
  tipo: 'MALL' | 'STRIPCENTER';
  ventanaHoraria: string;
  diasDespacho: string[];
}

export interface SantiagoItem {
  id: string;
  tiendaCod: string;
  tipo: TipoCargamento;
  contenido: ContenidoSantiago;
  peso: number;
  alto: number;
  largo: number;
  ancho: number;
  pesoVolumetrico: number;
  regimen: RegimenCarga;
  orden: string;
  estado: EstadoItem;
}

export type SantiagoStep = 'regimen' | 'form';

export interface SantiagoState {
  step: SantiagoStep;
  regimen: RegimenCarga | null;
  currentTienda: TiendaSantiago | null;
  items: Record<string, SantiagoItem[]>;
}
