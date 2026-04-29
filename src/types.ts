export type TipoContenido = 'comida' | 'hogar' | 'comida-hogar';
export type TipoPaquete = 'pallet' | 'box';

export interface Tienda {
  cod: string;
  name: string;
  region: string;
  nombre_dest: string;
  email: string;
  celular: string;
  rut: string;
  region_sendu: string;
  comuna: string;
  calle: string;
  numero: string;
  complemento: string;
  str_val: string;
}

export interface DispatchItem {
  orden: string;
  tipo: TipoContenido;
  pkg: TipoPaquete;
  guia: string;
  valor: number;
  peso: number;
  alto: number;
  ancho: number;
  largo: number;
}

export interface PdfGuia {
  num: string;
  total: number;
}

export interface PdfData {
  fileName: string;
  guias: PdfGuia[];
  totalSum: number;
}

export interface HistoryEntry {
  date: string;
  totalPallets: number;
  totalBultos: number;
  tiendas: {
    name: string;
    pallets: number;
    bultos: number;
    pesoTotal: string;
    monto: number;
  }[];
  rows: unknown[];
}

export interface AppState {
  activeTab: number;
  selectedTienda: string | null;
  currentTipo: TipoContenido;
  currentPkg: TipoPaquete;
  dispatch: Record<string, DispatchItem[]>;
  pdfData: Record<string, PdfData>;
  selection: Record<string, Set<number>>;
  sheetsUrl: string;
  dispatchDate: string;
  toast: { msg: string; color?: string } | null;
}
