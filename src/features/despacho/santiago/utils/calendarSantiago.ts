import { fetchCalendarioCompleto, refreshCalendario } from '../../utils/useCalendario';
import { CAL_INICIAL } from '../../rutas/data/calendar';

const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

interface SantiagoCalDay {
  rm: string[];
  costa: string[];
}

interface SantiagoCalData {
  [dia: string]: SantiagoCalDay;
}

// Mapea hacia los códigos con tilde usados en tiendasSantiago.ts.
// fetchCalendarioCompleto() ya convierte cortos→numéricos (BNV→32BNV, etc.),
// pero normalize() elimina tildes, por lo que PEÑ→23PEN y VIÑ→37VIN.
// Necesitamos cubrir ambas formas: el código corto (si llega directo) y el numérico sin tilde.
const RM_CODE_MAP: Record<string, string> = {
  PEN: '23PEÑ',   '23PEN': '23PEÑ',   // peñalolén: ambas formas → 23PEÑ
};
const COSTA_CODE_MAP: Record<string, string> = {
  VIN: '37VIÑ',   '37VIN': '37VIÑ',   // viña del mar: ambas formas → 37VIÑ
};

function toSantiagoDay(rm: string[], costa: string[]): SantiagoCalDay {
  return {
    rm:    rm.map(c => RM_CODE_MAP[c] ?? c),
    costa: costa.map(c => COSTA_CODE_MAP[c] ?? c),
  };
}

export async function fetchCalendarioSantiago(): Promise<SantiagoCalData> {
  const cal = await fetchCalendarioCompleto();
  const result: SantiagoCalData = {};
  ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'].forEach(dia => {
    const day = cal[dia];
    result[dia] = day ? toSantiagoDay(day.rm, day.costa) : { rm: [], costa: [] };
  });
  return result;
}

export async function getTiendasSantiagoHoySheets(): Promise<string[]> {
  const cal = await fetchCalendarioSantiago();
  const today = DAY_CODES[new Date().getDay()];
  const day = cal[today];
  if (!day) return [];
  return [...(day.rm || []), ...(day.costa || [])];
}

export async function getTiendasSantiagoHoyGrouped(): Promise<{ rm: string[]; costa: string[] }> {
  const cal = await fetchCalendarioSantiago();
  const today = DAY_CODES[new Date().getDay()];
  return cal[today] ?? { rm: [], costa: [] };
}

export async function syncCalendarioSantiago(): Promise<SantiagoCalData> {
  await refreshCalendario();
  return fetchCalendarioSantiago();
}

// Lectura síncrona desde CAL_INICIAL — mismo orden que el tab Despacho
export function getCalendarioSantiagoInicialHoy(): { rm: string[]; costa: string[] } {
  const DAY = ['DO','LU','MA','MI','JU','VI','SA'];
  const today = DAY[new Date().getDay()];
  const dia   = today === 'DO' ? 'LU' : today;
  const calDia = CAL_INICIAL[dia] || CAL_INICIAL.LU;
  return {
    rm:    (calDia.rm    || []).map(c => RM_CODE_MAP[c] ?? c),
    costa: (calDia.costa || []).map(c => COSTA_CODE_MAP[c] ?? c),
  };
}
