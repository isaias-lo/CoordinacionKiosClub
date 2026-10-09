// Historial del día: cuentas de impresiones y etiquetas. Módulo puro.

import type { PrintRecord, PalletSlot, PickerGroup } from '../picking-types';

/** Las cajas (chocolate y congelados) se cuentan juntas, como en el diseño: «12 P · 4 B · 3 cajas». */
const ES_CAJA = new Set(['CH', 'CC', 'CN']);

export interface Conteo { P: number; B: number; cajas: number }

export const CONTEO_VACIO: Conteo = { P: 0, B: 0, cajas: 0 };

export function contar(slots: PalletSlot[]): Conteo {
  const c = { ...CONTEO_VACIO };
  for (const s of slots) {
    const t = s.tipo || 'P';
    if (t === 'B') c.B++;
    else if (ES_CAJA.has(t)) c.cajas++;
    else c.P++;
  }
  return c;
}

export function textoConteo(c: Conteo): string {
  const partes: string[] = [];
  if (c.P) partes.push(`${c.P} P`);
  if (c.B) partes.push(`${c.B} B`);
  if (c.cajas) partes.push(`${c.cajas} ${c.cajas === 1 ? 'caja' : 'cajas'}`);
  return partes.join(' · ');
}

export function slotsPorClave(slots: PalletSlot[]): Record<string, PalletSlot[]> {
  const m: Record<string, PalletSlot[]> = {};
  for (const s of slots) (m[s.state_key] ??= []).push(s);
  return m;
}

const NOMBRE_CONTENIDO: Record<string, string> = {
  comida: 'Comida', aseo: 'Aseo', hogar: 'Hogar', chocolate: 'Chocolates', chocolates: 'Chocolates', congelados: 'Congelados',
};

/** Contenido de lo impreso: las categorías de Odoo si están (hoy) o lo que dicen los pallets. */
export function contenidoDe(stateKey: string, grupos: PickerGroup[], slots: PalletSlot[]): string[] {
  const g = grupos.find(x => x.stateKey === stateKey);
  const deOdoo = g ? [...new Set(g.operations.flatMap(o => o.categories))].filter(Boolean) : [];
  if (deOdoo.length) return deOdoo;
  const s = new Set<string>();
  for (const p of slots) {
    for (const parte of String(p.contenido ?? '').split(/[-,\s]+/)) {
      const n = NOMBRE_CONTENIDO[parte.toLowerCase()];
      if (n) s.add(n);
    }
  }
  return [...s];
}

export interface ResumenHistorial {
  impresiones: number;
  etiquetas: Conteo;
  reimpresiones: number;
  porTienda: { cod: string; conteo: Conteo; impresiones: number }[];
}

export function resumenHistorial(records: PrintRecord[], porClave: Record<string, PalletSlot[]>): ResumenHistorial {
  const etiquetas = { ...CONTEO_VACIO };
  const tiendas = new Map<string, { conteo: Conteo; impresiones: number }>();
  const contadas = new Set<string>();
  for (const r of records) {
    const cod = r.state_key.split('__')[0];
    const t = tiendas.get(cod) ?? { conteo: { ...CONTEO_VACIO }, impresiones: 0 };
    t.impresiones++;
    // Un encargado impreso dos veces tiene las mismas etiquetas: se cuentan una vez.
    if (!contadas.has(r.state_key)) {
      contadas.add(r.state_key);
      const c = contar(porClave[r.state_key] ?? []);
      for (const k of ['P', 'B', 'cajas'] as const) { t.conteo[k] += c[k]; etiquetas[k] += c[k]; }
    }
    tiendas.set(cod, t);
  }
  return {
    impresiones: records.length,
    etiquetas,
    reimpresiones: records.filter(r => (r.print_count ?? 1) > 1).length,
    porTienda: [...tiendas.entries()].map(([cod, v]) => ({ cod, ...v })),
  };
}

export function totalConteo(c: Conteo): number {
  return c.P + c.B + c.cajas;
}
