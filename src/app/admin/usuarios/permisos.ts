import type { ModuleGroup } from '@/config/routes';

/* ─── Funciones puras de permisos/roles ──────────────────────────────────────
   Extraídas de la página de Usuarios/Roles para poder testearlas sin UI ni red.
   (Reciben datos y devuelven datos.) */

/** Estado de un grupo de módulos respecto a las rutas concedidas. */
export function groupState(group: ModuleGroup, paths: string[]): 'all' | 'some' | 'none' {
  const n = group.routes.filter(r => paths.includes(r.path)).length;
  if (n === 0) return 'none';
  if (n === group.routes.length) return 'all';
  return 'some';
}

/** Alterna todo un grupo: si estaba completo lo quita entero, si no completa las rutas faltantes. */
export function applyGroupToggle(group: ModuleGroup, paths: string[]): string[] {
  if (groupState(group, paths) === 'all') {
    return paths.filter(p => !group.routes.some(r => r.path === p));
  }
  const toAdd = group.routes.map(r => r.path).filter(p => !paths.includes(p));
  return [...paths, ...toAdd];
}

/** Normaliza un nombre de rol a un id slug (minúsculas, sin acentos, guiones). */
export function slugify(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').slice(0, 32);
}
