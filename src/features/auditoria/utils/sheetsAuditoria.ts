import { sheetsWrite } from '../../../utils/sheetsUtils';
import type { AuditEntry, SubTipo, TipoError } from '../types';

const TIPO_LABEL: Record<string, string> = {
  comida: 'Comida', hogar: 'Hogar', aseo: 'Aseo',
  completo: 'Completo', 'comida-aseo': 'Comida-Aseo', 'aseo-hogar': 'Aseo-Hogar',
};
const SUBTIPO_LABEL: Record<SubTipo, string> = { comida: 'Comida', hogar: 'Hogar', aseo: 'Aseo' };
const CORR_LABEL: Record<string, string> = {
  correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante',
};

function ratioProducto(unidades: number, tipo: TipoError, esperado?: number): string {
  if (esperado === undefined) return `${unidades} u.`;
  const auditado = tipo === 'faltante' ? esperado - unidades : esperado + unidades;
  return `${auditado}/${esperado}`;
}

export function sheetsAuditoriaWrite(entry: AuditEntry, sheetsUrl: string): void {
  if (!sheetsUrl) return;

  const operacionesStr = entry.operaciones
    .map(op => `${SUBTIPO_LABEL[op.subTipo]}: ${op.codigo}`)
    .join(' | ');

  const productosStr = entry.productos
    .map(p => `[${p.codigo}] ${p.nombre} ${ratioProducto(p.unidades, p.tipo, p.cantidadEsperada)} (${p.tipo})`)
    .join(', ');

  const row = {
    ID: entry.id,
    FECHA: entry.fecha,
    HORA: entry.hora,
    AUDITOR: entry.auditor,
    PICKER: entry.picker || '',
    COD_TIENDA: entry.tiendaCod,
    TIENDA: entry.tiendaNombre,
    AREA: entry.tiendaArea === 'regiones' ? 'Regiones' : 'Santiago',
    TIPO: TIPO_LABEL[entry.tipo] ?? entry.tipo,
    OPERACIONES: operacionesStr,
    PALLETS: entry.pallets,
    ERRORES: entry.tieneErrores ? 'Sí' : 'No',
    TIPOS_ERROR: entry.tiposError.map(t => t === 'faltante' ? 'Faltante' : 'Sobrante').join(', '),
    PRODUCTOS: productosStr,
    CORRECCION: CORR_LABEL[entry.correccion] ?? entry.correccion,
    RESULTADO: entry.resultado === 'bueno' ? 'Bueno' : 'Malo',
    OBSERVACIONES: entry.observaciones || '',
    RE_AUDITORIA: entry.reauditoriaDeId ? `Re-aud. de ${entry.reauditoriaDeId}` : '',
  };
  sheetsWrite(sheetsUrl, [row]);
}
