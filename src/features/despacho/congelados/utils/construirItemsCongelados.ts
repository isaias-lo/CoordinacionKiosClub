import type { CongeladoItem } from './sheetsCongelados';

export interface SlotCongelado {
  id: number;
  tipo: string;
  canonical_id?: string | null;
  seq?: number | null;
}

export interface ConstruirItemsCongeladosParams {
  cod: string;
  tienda: string;
  region: string;
  comuna: string;
  tipoComuna: string;
  ventana: string;
  fecha: string;                // DD/MM/YYYY
  fechaArmado?: string | null;  // ISO yyyy-mm-dd
  cuentaCC: number;
  cuentaCN: number;
  slots: SlotCongelado[];
}

/** id determinístico y único por caja cuando el slot no trae canonical_id (ej. ajuste hacia
 *  arriba: el usuario sumó más cajas de las que hay en picking). Estable entre llamadas para
 *  la misma tienda/fecha/tipo/índice → idempotencia del append por col A en Sheets. */
function idDeterministico(fecha: string, cod: string, tipo: 'CC' | 'CN', indice: number): string {
  return `CONG-${fecha.replace(/\//g, '')}-${cod}-${tipo}-${indice + 1}`;
}

function construirItemsPorTipo(
  tipoCaja: 'CC' | 'CN',
  cuenta: number,
  slotsDeTipo: SlotCongelado[],
  base: Omit<CongeladoItem, 'id' | 'tipoCaja' | 'nPalletBulto' | 'pickingSlotId'>,
  fecha: string,
  cod: string,
): CongeladoItem[] {
  const items: CongeladoItem[] = [];
  for (let i = 0; i < cuenta; i++) {
    const slot = slotsDeTipo[i];
    const canonical = slot?.canonical_id;
    const id = canonical && canonical.trim() !== '' ? canonical : idDeterministico(fecha, cod, tipoCaja, i);
    items.push({
      ...base,
      id,
      tipoCaja,
      nPalletBulto: `${tipoCaja}${i + 1}`,
      pickingSlotId: slot?.id ?? null,
    });
  }
  return items;
}

/**
 * Arma los `CongeladoItem[]` (1 por caja) para registrar una tienda: separa los slots de
 * picking por tipo (CC/CN) y genera `cuentaCC`/`cuentaCN` items, casando cada uno con su slot
 * por posición cuando existe. Si el usuario ajustó la cantidad hacia arriba (más cajas que
 * slots de picking), las cajas sobrantes quedan sin `pickingSlotId` y con un id determinístico
 * (en vez de canonical_id). Función pura — sin red ni UI.
 */
export function construirItemsCongelados(params: ConstruirItemsCongeladosParams): CongeladoItem[] {
  const { cod, tienda, region, comuna, tipoComuna, ventana, fecha, fechaArmado, cuentaCC, cuentaCN, slots } = params;

  const ccSlots = slots.filter(s => s.tipo === 'CC');
  const cnSlots = slots.filter(s => s.tipo === 'CN');

  const base: Omit<CongeladoItem, 'id' | 'tipoCaja' | 'nPalletBulto' | 'pickingSlotId'> = {
    tiendaCod: cod,
    tienda,
    region,
    comuna,
    tipoComuna,
    ventana,
    fechaArmado: fechaArmado ?? null,
  };

  const ccItems = cuentaCC > 0 ? construirItemsPorTipo('CC', cuentaCC, ccSlots, base, fecha, cod) : [];
  const cnItems = cuentaCN > 0 ? construirItemsPorTipo('CN', cuentaCN, cnSlots, base, fecha, cod) : [];

  return [...ccItems, ...cnItems];
}
