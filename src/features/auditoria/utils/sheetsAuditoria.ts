import { sheetsWrite } from '../../../utils/sheetsUtils';
import type { AuditEntry } from '../types';

const TIPO_LABEL: Record<string, string> = {
  comida: 'Comida', hogar: 'Hogar', aseo: 'Aseo',
  completo: 'Completo', 'comida-aseo': 'Comida-Aseo', 'aseo-hogar': 'Aseo-Hogar',
};
const CORR_LABEL: Record<string, string> = {
  correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante',
};

export function sheetsAuditoriaWrite(entry: AuditEntry, sheetsUrl: string): void {
  if (!sheetsUrl) return;
  const row = {
    ID: entry.id,
    FECHA: entry.fecha,
    HORA: entry.hora,
    AUDITOR: entry.auditor,
    COD_TIENDA: entry.tiendaCod,
    TIENDA: entry.tiendaNombre,
    AREA: entry.tiendaArea === 'regiones' ? 'Regiones' : 'Santiago',
    TIPO: TIPO_LABEL[entry.tipo] ?? entry.tipo,
    OPERACION_ODOO: entry.operacionOdoo,
    PALLETS: entry.pallets,
    ERRORES: entry.errores,
    CORRECCION: CORR_LABEL[entry.correccion] ?? entry.correccion,
    RESULTADO: entry.resultado === 'bueno' ? 'Bueno' : 'Malo',
  };
  sheetsWrite(sheetsUrl, [row]);
}
