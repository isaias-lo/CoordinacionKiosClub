import type { TipoAuditoria, CorreccionAuditoria, SubTipo } from './types';

export const SUBTIPO_LABEL: Record<SubTipo, string> = { comida: 'Comida', hogar: 'Hogar', aseo: 'Aseo' };

export const TIPO_TO_SUBTIPOS: Record<TipoAuditoria, SubTipo[]> = {
  comida: ['comida'], hogar: ['hogar'], aseo: ['aseo'],
  'comida-aseo': ['comida', 'aseo'], 'aseo-hogar': ['aseo', 'hogar'],
  completo: ['comida', 'aseo', 'hogar'],
};

export const TIPOS: { value: TipoAuditoria; label: string }[] = [
  { value: 'comida', label: 'Comida' }, { value: 'hogar', label: 'Hogar' }, { value: 'aseo', label: 'Aseo' },
  { value: 'completo', label: 'Completo' }, { value: 'comida-aseo', label: 'Com-Aseo' }, { value: 'aseo-hogar', label: 'Aseo-Hogar' },
];

export const TIPO_COLOR: Record<TipoAuditoria, string> = {
  comida: 'bg-[rgba(217,119,6,0.10)] border-warn text-warn',
  hogar: 'bg-[rgba(124,58,237,0.10)] border-hogar text-hogar',
  aseo: 'bg-[rgba(8,145,178,0.10)] border-mixto text-mixto',
  completo: 'bg-[rgba(22,163,74,0.10)] border-success text-success',
  'comida-aseo': 'bg-[rgba(211,47,47,0.10)] border-red text-red',
  'aseo-hogar': 'bg-[rgba(37,99,235,0.10)] border-info text-info',
};

export const CORR_COLOR: Record<CorreccionAuditoria, string> = {
  correcto: 'bg-[rgba(22,163,74,0.12)] border-success text-success',
  cruce: 'bg-[rgba(37,99,235,0.12)] border-info text-info',
  faltante: 'bg-[rgba(211,47,47,0.12)] border-red text-red',
  sobrante: 'bg-[rgba(217,119,6,0.12)] border-warn text-warn',
};

export const CORR_LABEL: Record<CorreccionAuditoria, string> = { correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante' };

export const CORR_COLORS: Record<CorreccionAuditoria, string> = { correcto: '#16A34A', faltante: '#D32F2F', sobrante: '#D97706', cruce: '#2563EB' };

export const LINE_COLORS = ['#1a2550', '#16A34A', '#D97706', '#2563EB', '#9333EA', '#D32F2F'];

export const AUDIT_SESSION_KEY = 'audit_active_session_v1';
export const OFFLINE_QUEUE_KEY = 'audit_offline_queue';

// Per-user localStorage key: keeps sessions isolated between accounts on the same browser
export const sessionKey = (userId?: string) => userId ? `${AUDIT_SESSION_KEY}_${userId}` : AUDIT_SESSION_KEY;

export const OP_PREFIX = '99REC/DT/';

export function formatTimer(s: number): string {
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Mapea categorías del código de barra picking → TipoAuditoria
export function catsToTipo(cats: string): TipoAuditoria {
  const s = new Set(cats.split(',').map(c => c.trim().toLowerCase()));
  const c = s.has('comida'), a = s.has('aseo'), h = s.has('hogar');
  if (c && a && h) return 'completo';
  if (c && a) return 'comida-aseo';
  if (a && h) return 'aseo-hogar';
  if (c && h) return 'completo'; // no existe 'comida-hogar', se trata como completo
  if (c) return 'comida';
  if (a) return 'aseo';
  if (h) return 'hogar';
  return 'comida';
}
