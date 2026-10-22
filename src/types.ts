import type { Juntado } from '@/features/despacho/shared/juntados';
// Los ocho tipos de carga (ver `ClaseContenido` en despacho/shared/contenidoCarga.ts).
export type TipoContenido =
  | 'comida' | 'hogar' | 'aseo' | 'chocolate'
  | 'comida-hogar' | 'comida-aseo' | 'hogar-aseo' | 'comida-hogar-aseo';
export type TipoPaquete = 'pallet' | 'box' | 'contenedor' | 'chocolate' | 'adquisicion' | 'web-retiro';

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
  id?: string;              // [E3b/C1] id estable (sobrevive al renumber) para el merge por-ítem
  orden: string;
  tipo: TipoContenido;
  pkg: TipoPaquete;
  guia: string;
  valor: number;
  peso: number;
  alto: number;
  ancho: number;
  largo: number;
  pickingSlotId?: number;   // FK a picking_pallets.id (trazabilidad)
  /** La REFERENCIA de Odoo del movimiento que armó esta unidad (`99REC/DT/138597`). Varias van
   *  unidas con `+`. Viaja desde el slot para que llegue a la planilla. Ver `hojaDespacho.ts`. */
  refs?: string;
  /** El batch de Odoo. Vacío en todo lo anterior a que Picking empiece a guardarlo. */
  batch?: string;
  canonical_id?: string;    // P3MAI13062026P — del picking slot (para CÓDIGO en Sheets/Supabase)
  taraPallet?: number;      // kg del pallet que se restaron del peso (`peso` ya es neto). Ver pesoDelPallet.ts
  palletWeb?: boolean;      // pallet que sale sin pesar, a propósito. Ver shared/sinPesar.ts → esPalletWeb
  editadoEn?: number;       // ms de la última edición de su carga en un equipo. Ver shared/versionDeItem.ts
  /** Nombre del producto si el bulto se pesó con «Escanear producto». Se muestra en la línea pesada. */
  producto?: string;
  /** Cuántas unidades se le unificaron (Unificar en Bodega o Combinar en el Resumen). Hace que la
   *  unidad se vea como unificada. Ver `unidosTrasUnir` en shared/unifyPallets.ts. */
  unidos?: number;
  /** Lo que se le juntó: el tipo de cada pallet unido y los B/CH sumados. Ver shared/juntados.ts. */
  juntado?: Juntado;
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
  totalContenedores: number;
  totalChocolates: number;
  tiendas: {
    name: string;
    pallets: number;
    bultos: number;
    contenedores: number;
    chocolates: number;
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
  fechaDespacho?: string;  // YYYY-MM-DD, default = mañana
  registrado?: boolean;    // DERIVADO de `registros` para la fecha activa; los componentes lo leen así
  /** Qué días quedaron registrados. Fuente de verdad. Ver shared/registroPorFecha. */
  registros?: Record<string, boolean>;
  /** La última decisión explícita por día —registrar o REABRIR— con su hora, para que reabrir
   *  aguante el merge. Ver shared/registroPorFecha. */
  decisiones?: Record<string, { registrado: boolean; ts: number }>;
}
