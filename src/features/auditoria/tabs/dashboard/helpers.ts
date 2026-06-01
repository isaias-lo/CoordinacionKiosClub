import type { AuditEntry } from '../../types';
import type { PickerStats } from './PickerCard';
import type { WeekTrend } from '../../components/charts/LineChart';

export function parseEsCL(s: string): Date | null {
  const p = s.split('/'); if (p.length !== 3) return null;
  const [d, m, y] = p.map(Number);
  return new Date(y, m - 1, d);
}

export function getWeekKey(dateStr: string): { key: string; label: string } {
  const date = parseEsCL(dateStr); if (!date) return { key: '', label: '' };
  const day = date.getDay(); const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(date); mon.setDate(date.getDate() + diff);
  const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
  return { key, label: `${mon.getDate()}/${mon.getMonth() + 1}` };
}

export function computeRanking(entries: AuditEntry[]): PickerStats[] {
  const map = new Map<string, PickerStats>();
  for (const e of entries) {
    const p = e.picker?.trim(); if (!p) continue;
    if (!map.has(p)) map.set(p, {
      picker: p, total: 0, bueno: 0, malo: 0, pct: 0, eficiencia: 100,
      tieneUnidadData: false, totalPallets: 0,
      totalUnidadesError: 0, totalUnidadesEsperadas: 0,
      faltanteItems: 0, sobranteItems: 0, faltanteUnidades: 0, sobranteUnidades: 0,
      totalDurationSeconds: 0, durationCount: 0,
    });
    const s = map.get(p)!;
    s.total++; s.totalPallets += e.pallets;
    if (e.durationSeconds) { s.totalDurationSeconds += e.durationSeconds; s.durationCount++; }
    if (e.resultado === 'bueno') s.bueno++; else s.malo++;
    for (const prod of e.productos ?? []) {
      s.totalUnidadesError += prod.unidades;
      if (prod.tipo === 'faltante') { s.faltanteItems++; s.faltanteUnidades += prod.unidades; }
      else { s.sobranteItems++; s.sobranteUnidades += prod.unidades; }
      if (prod.cantidadEsperada !== undefined) {
        s.tieneUnidadData = true; s.totalUnidadesEsperadas += prod.cantidadEsperada;
      }
    }
  }
  for (const s of map.values()) {
    s.pct = s.total > 0 ? Math.round((s.bueno / s.total) * 100) : 0;
    s.eficiencia = s.tieneUnidadData && s.totalUnidadesEsperadas > 0
      ? Math.max(0, Math.round(((s.totalUnidadesEsperadas - s.totalUnidadesError) / s.totalUnidadesEsperadas) * 100))
      : s.pct;
  }
  return Array.from(map.values()).sort((a, b) => b.eficiencia - a.eficiencia || b.total - a.total);
}

export function computeWeeklyTrend(entries: AuditEntry[], picker: string): WeekTrend[] {
  const wmap = new Map<string, { label: string; b: number; t: number }>();
  for (const e of entries) {
    if (e.picker?.trim() !== picker) continue;
    const { key, label } = getWeekKey(e.fecha); if (!key) continue;
    if (!wmap.has(key)) wmap.set(key, { label, b: 0, t: 0 });
    const w = wmap.get(key)!; w.t++; if (e.resultado === 'bueno') w.b++;
  }
  return Array.from(wmap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
    .map(([key, { label, b, t }]) => ({ key, label, pct: t > 0 ? Math.round((b / t) * 100) : null }));
}

export function displayPicker(key: string, names: Record<string, string>): string {
  return names[key]?.trim() || key;
}
