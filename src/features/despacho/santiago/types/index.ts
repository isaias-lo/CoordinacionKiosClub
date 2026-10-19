export type RegimenCarga = 'Seco' | 'Congelado';
export type TipoCargamento = 'Pallet' | 'Bulto' | 'Contenedor' | 'Chocolate' | 'Adquisicion' | 'WebRetiro';
// 'Mixto' es comida y hogar (así quedó escrito en la planilla). Ver contenidoCarga.ts.
export type ContenidoSantiago =
  | 'Comida' | 'Hogar' | 'Aseo' | 'Chocolate'
  | 'Mixto' | 'Comida-Aseo' | 'Hogar-Aseo' | 'Comida-Hogar-Aseo';
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
}

export type SantiagoStep = 'regimen' | 'form';

export interface SantiagoState {
  step: SantiagoStep;
  regimen: RegimenCarga | null;
  currentTienda: TiendaSantiago | null;
  items: Record<string, SantiagoItem[]>;
  fechaDespacho?: string;  // YYYY-MM-DD, default = mañana
  registrado?: boolean;    // DERIVADO de `registros` para la fecha activa; los componentes lo leen así
  /** Qué días quedaron registrados. Fuente de verdad. Ver shared/registroPorFecha. */
  registros?: Record<string, boolean>;
  /** La última decisión explícita por día —registrar o REABRIR— con su hora, para que reabrir
   *  aguante el merge. Ver shared/registroPorFecha. */
  decisiones?: Record<string, { registrado: boolean; ts: number }>;
}
