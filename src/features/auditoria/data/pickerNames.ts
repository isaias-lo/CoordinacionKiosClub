/**
 * Mapeo de claves Odoo → nombre real de la persona.
 * Se puede editar desde el panel de Configuración del rol admin-auditoria.
 * La clave debe coincidir exactamente con el nombre del usuario en Odoo.
 */
export const PICKER_NAMES: Record<string, string> = {
  'Pickers 1':  '',
  'Pickers 2':  '',
  'Pickers 3':  '',
  'Pickers 4':  '',
  'Pickers 5':  '',
  'Pickers 6':  '',
  'Pickers 7':  '',
  'Pickers 8':  '',
  'Pickers 9':  '',
  'Pickers 10': '',
  'Pickers 11': '',
  'Pickers 12': '',
  'Pickers 13': '',
  'Pickers 14': '',
  'Pickers 15': '',
  'Pickers 16': '',
  'Pickers 17': '',
  'Pickers 18': '',
};

/** Devuelve el nombre real si está configurado, si no la clave. */
export function getPickerDisplay(key: string): string {
  return PICKER_NAMES[key] || key;
}

/** Lista de claves de pickers en orden. */
export const PICKERS_LIST = Object.keys(PICKER_NAMES);

/** Actualiza el mapa en memoria (llamado al cargar config de Supabase). */
export function updatePickerNames(names: Record<string, string>): void {
  Object.assign(PICKER_NAMES, names);
}

/**
 * Intenta hacer match entre un nombre de usuario de Odoo y una clave PICKER_NAMES.
 * Retorna la clave si hay match, null si no.
 */
export function matchOdooResponsable(odooName: string): string | null {
  if (!odooName) return null;
  const lower = odooName.toLowerCase().trim();
  for (const [key, realName] of Object.entries(PICKER_NAMES)) {
    if (key.toLowerCase() === lower) return key;
    if (realName && realName.toLowerCase() === lower) return key;
  }
  return null;
}
