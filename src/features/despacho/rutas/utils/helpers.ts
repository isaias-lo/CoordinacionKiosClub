import { ALIAS } from '../data/tiendas';

export function dkm(a: [number, number] | number[], b: [number, number] | number[]): number {
  const R = 6371;
  const dL = (b[0] - a[0]) * Math.PI / 180;
  const dl = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dL/2)*Math.sin(dL/2) +
            Math.cos(a[0]*Math.PI/180)*Math.cos(b[0]*Math.PI/180)*Math.sin(dl/2)*Math.sin(dl/2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

export function getDia(fechaStr: string): string {
  const d = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
  return ['LU','LU','MA','MI','JU','VI','SA'][d.getDay() === 0 ? 0 : d.getDay()];
}

export function norm(raw: string): string {
  const s = raw.trim().toUpperCase()
    .replace(/Ñ/g,'N').replace(/[ÁÀÂÄ]/g,'A').replace(/[ÉÈÊË]/g,'E')
    .replace(/[ÍÌÎÏ]/g,'I').replace(/[ÓÒÔÖ]/g,'O').replace(/[ÚÙÛÜ]/g,'U');
  return ALIAS[raw.trim().toUpperCase()] || ALIAS[s] || s;
}

export function formatCod(cod: string): string {
  return cod.replace(/^(\d+)([A-Za-zÑñ])/, '$1 $2');
}

export function fechaTxt(fechaStr: string): string {
  if (!fechaStr) return '';
  return new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function fechaLargaTxt(fechaStr: string): string {
  if (!fechaStr) return new Date().toLocaleDateString('es-CL', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
  return new Date(fechaStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function todayStr(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
}
