export type CruceEstado = 'COMPLETADO' | 'VENCIDA' | 'PLANIFICADO';

export interface ManualOverride {
  correcta_declaracion?: string;
  movimiento_ajuste?:    string;
}

export interface ResolvedManualFields {
  correcta_declaracion: string;
  movimiento_ajuste:    string;
}

/**
 * Combina el estado de la actividad de Odoo con el override manual guardado
 * en `control_cruce_manual`. Usado tanto en el cliente (ControlCruceContent)
 * como en el servidor (auto-export) — debe mantenerse idéntico en ambos.
 */
export function resolveManualFields(
  estado: CruceEstado,
  manual: ManualOverride | undefined,
): ResolvedManualFields {
  const manualCd = manual?.correcta_declaracion;
  const correcta_declaracion = estado === 'COMPLETADO'
    ? (manualCd && manualCd !== 'PENDIENTE' ? manualCd : 'ACTIVIDAD REALIZADA')
    : (manualCd ?? 'PENDIENTE');

  return {
    correcta_declaracion,
    movimiento_ajuste: manual?.movimiento_ajuste ?? '',
  };
}
