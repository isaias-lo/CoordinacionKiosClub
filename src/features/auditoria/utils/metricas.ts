import { supabase } from '../../../lib/supabase';
import type { AuditEntry } from '../types';

/* ── Types ── */

export type EstadoBono =
  | 'BONO_APROBADO'
  | 'BONO_NEGADO'
  | 'PENDIENTE'
  | 'PENDIENTE_ALERTA';

export interface Parametros {
  minimo_auditorias: number;
  umbral_bono_pct: number;
  cobertura_diaria_meta: number;
  nivel_confianza_z: number;
  margen_error: number;
}

export interface ProduccionDia {
  picker_nombre: string;
  fecha: string;
  pallets_producidos: number;
}

export interface MetricasPicker {
  picker_nombre: string;
  auditados_mes: number;
  ok_mes: number;
  errores_mes: number;
  efectividad_pct: number | null;
  deficit: number;
  estado_bono: EstadoBono;
  producidos_hoy: number;
  auditados_hoy: number;
  cuota_hoy: number;
  diferencia_hoy: number;
  necesarios_hoy: number;
  cobertura_picker_mes: number | null;
}

export interface ResumenDia {
  total_producidos: number;
  total_auditados: number;
  cobertura_global: number;
  pickers: MetricasPicker[];
}

/* ── Parámetros desde Supabase ── */

export async function fetchParametros(): Promise<Parametros> {
  const { data, error } = await supabase
    .from('parametros_sistema')
    .select('clave, valor');
  if (error || !data) return defaultParametros();
  const map = Object.fromEntries(data.map(r => [r.clave, Number(r.valor)]));
  return {
    minimo_auditorias:     map['minimo_auditorias']     ?? 73,
    umbral_bono_pct:       map['umbral_bono_pct']       ?? 95,
    cobertura_diaria_meta: map['cobertura_diaria_meta'] ?? 30,
    nivel_confianza_z:     map['nivel_confianza_z']     ?? 1.96,
    margen_error:          map['margen_error']           ?? 0.05,
  };
}

export async function saveParametros(params: Parametros): Promise<void> {
  const rows = [
    { clave: 'minimo_auditorias',     valor: params.minimo_auditorias,     updated_at: new Date().toISOString() },
    { clave: 'umbral_bono_pct',       valor: params.umbral_bono_pct,       updated_at: new Date().toISOString() },
    { clave: 'cobertura_diaria_meta', valor: params.cobertura_diaria_meta, updated_at: new Date().toISOString() },
    { clave: 'nivel_confianza_z',     valor: params.nivel_confianza_z,     updated_at: new Date().toISOString() },
    { clave: 'margen_error',          valor: params.margen_error,           updated_at: new Date().toISOString() },
  ];
  await supabase.from('parametros_sistema').upsert(rows, { onConflict: 'clave' });
}

function defaultParametros(): Parametros {
  return {
    minimo_auditorias: 73,
    umbral_bono_pct: 95,
    cobertura_diaria_meta: 30,
    nivel_confianza_z: 1.96,
    margen_error: 0.05,
  };
}

/* ── Fórmula A: mínimo estadístico ── */

export function calcMinimo(z: number, e: number): number {
  return Math.ceil((z * z * 0.95 * 0.05) / (e * e));
}

/* ── Producción diaria desde Supabase ── */

export async function fetchProduccionMes(mes: Date): Promise<ProduccionDia[]> {
  const y = mes.getFullYear();
  const m = String(mes.getMonth() + 1).padStart(2, '0');
  const from = `${y}-${m}-01`;
  const toDate = new Date(y, mes.getMonth() + 1, 0);
  const to = `${y}-${m}-${String(toDate.getDate()).padStart(2, '0')}`;
  const { data } = await supabase
    .from('produccion_diaria')
    .select('picker_nombre, fecha, pallets_producidos')
    .gte('fecha', from)
    .lte('fecha', to);
  return (data ?? []) as ProduccionDia[];
}

export async function fetchProduccionHoy(): Promise<ProduccionDia[]> {
  const today = todayISO();
  const { data } = await supabase
    .from('produccion_diaria')
    .select('picker_nombre, fecha, pallets_producidos')
    .eq('fecha', today);
  return (data ?? []) as ProduccionDia[];
}

export async function upsertProduccion(picker_nombre: string, fecha: string, pallets_producidos: number): Promise<void> {
  await supabase
    .from('produccion_diaria')
    .upsert({ picker_nombre, fecha, pallets_producidos }, { onConflict: 'picker_nombre,fecha' });
}

/* ── Helpers de fecha ── */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function mesActualISO(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}

// Días hábiles (lun–vie) que quedan en el mes DESDE mañana
export function diasHabilesRestantes(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let count = 0;
  for (let d = now.getDate() + 1; d <= lastDay; d++) {
    const dow = new Date(now.getFullYear(), now.getMonth(), d).getDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

// Convierte fecha "DD/MM/YYYY" → "YYYY-MM-DD"
export function fechaCLtoISO(s: string): string {
  const [d, m, y] = s.split('/');
  return `${y}-${m?.padStart(2, '0')}-${d?.padStart(2, '0')}`;
}

/* ── Fórmula B: efectividad por picker ── */

export function calcEfectividad(ok: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((ok / total) * 100 * 100) / 100;
}

/* ── Fórmula C: cobertura ── */

export function calcCobertura(auditados: number, producidos: number): number | null {
  if (producidos === 0) return null;
  return Math.round((auditados / producidos) * 100 * 10) / 10;
}

/* ── Fórmula D: cuota equitativa diaria ── */

export function calcCuota(totalAuditadosDia: number, producidosPicker: number, totalProducidosDia: number): number {
  if (totalProducidosDia === 0) return 0;
  return Math.round(totalAuditadosDia * (producidosPicker / totalProducidosDia));
}

/* ── Fórmula E: déficit y necesarios hoy ── */

export function calcDeficit(minimo: number, auditadosMes: number): number {
  return Math.max(0, minimo - auditadosMes);
}

export function calcNecesariosHoy(deficit: number, diasRestantes: number): number {
  if (diasRestantes === 0) return deficit;
  return Math.ceil(deficit / diasRestantes);
}

/* ── Fórmula F: estado del bono ── */

export function calcEstadoBono(
  auditadosMes: number,
  efectividad: number | null,
  minimo: number,
  umbral: number,
  coberturaPickerMes: number | null,
  coberturaGlobalMes: number | null,
): EstadoBono {
  if (auditadosMes >= minimo) {
    if (efectividad !== null && efectividad >= umbral) return 'BONO_APROBADO';
    return 'BONO_NEGADO';
  }
  // muestra insuficiente
  if (coberturaPickerMes !== null && coberturaGlobalMes !== null && coberturaPickerMes >= coberturaGlobalMes) {
    return 'PENDIENTE';
  }
  return 'PENDIENTE_ALERTA';
}

/* ── Motor principal: calcula métricas completas del mes + hoy ── */

export function computeMetricas(
  entries: AuditEntry[],
  produccionMes: ProduccionDia[],
  produccionHoy: ProduccionDia[],
  params: Parametros,
  todayISO: string,
): ResumenDia {
  const { minimo_auditorias: minimo, umbral_bono_pct: umbral } = params;
  const diasRestantes = diasHabilesRestantes();

  // Auditorías del mes actual (formato ISO)
  const { from, to } = mesActualISO();
  const entriesMes = entries.filter(e => {
    const iso = fechaCLtoISO(e.fecha);
    return iso >= from && iso <= to;
  });

  // Auditorías de hoy
  const entriesToday = entries.filter(e => fechaCLtoISO(e.fecha) === todayISO);

  // Producción hoy: total
  const totalProducidosHoy = produccionHoy.reduce((s, r) => s + r.pallets_producidos, 0);
  const totalAuditadosHoy  = entriesToday.reduce((s, e) => s + e.pallets, 0);

  // Producción mes: por picker
  const produccionMesMap = new Map<string, number>();
  for (const r of produccionMes) {
    produccionMesMap.set(r.picker_nombre, (produccionMesMap.get(r.picker_nombre) ?? 0) + r.pallets_producidos);
  }
  const totalProducidosMes = Array.from(produccionMesMap.values()).reduce((s, v) => s + v, 0);

  // Auditorías mes por picker
  const auditMesMap = new Map<string, { total: number; ok: number; pallets: number }>();
  for (const e of entriesMes) {
    const nombre = e.pickerNombre ?? e.picker ?? '';
    if (!nombre) continue;
    if (!auditMesMap.has(nombre)) auditMesMap.set(nombre, { total: 0, ok: 0, pallets: 0 });
    const s = auditMesMap.get(nombre)!;
    s.total++;
    s.pallets += e.pallets;
    if (!e.tieneErrores) s.ok++;
  }

  // Auditorías hoy por picker
  const auditHoyMap = new Map<string, number>();
  for (const e of entriesToday) {
    const nombre = e.pickerNombre ?? e.picker ?? '';
    if (!nombre) continue;
    auditHoyMap.set(nombre, (auditHoyMap.get(nombre) ?? 0) + e.pallets);
  }

  // Cobertura global del mes
  const totalAuditadosMes = Array.from(auditMesMap.values()).reduce((s, v) => s + v.pallets, 0);
  const coberturaGlobalMes = calcCobertura(totalAuditadosMes, totalProducidosMes);

  // Union de todos los pickers conocidos
  const allPickers = new Set<string>([
    ...auditMesMap.keys(),
    ...produccionMesMap.keys(),
    ...produccionHoy.map(r => r.picker_nombre),
  ]);

  const pickers: MetricasPicker[] = [];

  for (const nombre of allPickers) {
    const mes = auditMesMap.get(nombre) ?? { total: 0, ok: 0, pallets: 0 };
    const producidosMes = produccionMesMap.get(nombre) ?? 0;
    const producidosHoy = produccionHoy.find(r => r.picker_nombre === nombre)?.pallets_producidos ?? 0;
    const auditadosHoy  = auditHoyMap.get(nombre) ?? 0;

    const efectividad = calcEfectividad(mes.ok, mes.total);
    const coberturaPickerMes = calcCobertura(mes.pallets, producidosMes);
    const deficit = calcDeficit(minimo, mes.pallets);
    const necesariosHoy = calcNecesariosHoy(deficit, diasRestantes);
    const cuotaHoy = calcCuota(totalAuditadosHoy, producidosHoy, totalProducidosHoy);
    const diferenciaHoy = auditadosHoy - cuotaHoy;
    const estado_bono = calcEstadoBono(mes.pallets, efectividad, minimo, umbral, coberturaPickerMes, coberturaGlobalMes);

    pickers.push({
      picker_nombre: nombre,
      auditados_mes: mes.pallets,
      ok_mes: mes.ok,
      errores_mes: mes.total - mes.ok,
      efectividad_pct: efectividad,
      deficit,
      estado_bono,
      producidos_hoy: producidosHoy,
      auditados_hoy: auditadosHoy,
      cuota_hoy: cuotaHoy,
      diferencia_hoy: diferenciaHoy,
      necesarios_hoy: necesariosHoy,
      cobertura_picker_mes: coberturaPickerMes,
    });
  }

  // Ordenar por necesarios_hoy desc, luego por nombre
  pickers.sort((a, b) => b.necesarios_hoy - a.necesarios_hoy || a.picker_nombre.localeCompare(b.picker_nombre));

  return {
    total_producidos: totalProducidosHoy,
    total_auditados: totalAuditadosHoy,
    cobertura_global: calcCobertura(totalAuditadosHoy, totalProducidosHoy) ?? 0,
    pickers,
  };
}

/* ── Semáforo del picker ── */

export function semaforo(m: MetricasPicker): 'rojo' | 'amarillo' | 'verde' {
  const hora = new Date().getHours();
  if (m.necesarios_hoy > 0 && hora >= 15) return 'rojo';
  if (m.necesarios_hoy > 0) return 'amarillo';
  return 'verde';
}

/* ── Labels y colores de estado bono ── */

export const BONO_LABEL: Record<EstadoBono, string> = {
  BONO_APROBADO:    'Aprobado',
  BONO_NEGADO:      'Negado',
  PENDIENTE:        'Pendiente',
  PENDIENTE_ALERTA: 'Alerta',
};

export const BONO_COLOR: Record<EstadoBono, string> = {
  BONO_APROBADO:    '#16A34A',
  BONO_NEGADO:      '#D32F2F',
  PENDIENTE:        '#D97706',
  PENDIENTE_ALERTA: '#EA580C',
};

export const BONO_BG: Record<EstadoBono, string> = {
  BONO_APROBADO:    'rgba(22,163,74,0.10)',
  BONO_NEGADO:      'rgba(211,47,47,0.10)',
  PENDIENTE:        'rgba(217,119,6,0.10)',
  PENDIENTE_ALERTA: 'rgba(234,88,12,0.10)',
};

/* ── Índice de equidad del área ── */

export function calcIndiceEquidad(pickers: MetricasPicker[]): number | null {
  const coberturas = pickers
    .map(p => p.cobertura_picker_mes)
    .filter((c): c is number => c !== null);
  if (coberturas.length < 2) return null;
  return Math.round((Math.max(...coberturas) - Math.min(...coberturas)) * 10) / 10;
}
