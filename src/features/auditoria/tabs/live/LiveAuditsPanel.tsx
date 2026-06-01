'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { TIPOS } from '../../constants';
import type { TiendaRef } from '../../types';

type LiveSession = { user_id: string; session_data: Record<string, unknown>; updated_at: string };

export function LiveAuditsPanel({ onBack, allStores }: { onBack: () => void; allStores: TiendaRef[] }) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const tipoLabel = (val: string) => TIPOS.find(t => t.value === val)?.label ?? val;

  const pickersOf = (sd: Record<string, unknown>): string[] => {
    const arr = sd.pickerNombres as string[] | undefined;
    if (Array.isArray(arr) && arr.length > 0) return arr;
    const single = (sd.pickerNombre as string | undefined)?.trim();
    if (single) return [single];
    return [];
  };

  // Carga inicial
  useEffect(() => {
    supabase.from('audit_active_sessions').select('user_id,session_data,updated_at')
      .then(({ data, error }) => {
        if (error) console.error('[En Vivo] fetch error:', error.message);
        if (data) setSessions(data as LiveSession[]);
        setLoading(false);
      });
  }, []);

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('live_audits_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_active_sessions' }, payload => {
        if (payload.eventType === 'DELETE') {
          setSessions(prev => prev.filter(s => s.user_id !== (payload.old as LiveSession).user_id));
          return;
        }
        const row = payload.new as LiveSession;
        const phase = (row.session_data as Record<string, unknown>)?.formPhase;
        if (phase !== 'execution' && phase !== 'setup') {
          setSessions(prev => prev.filter(s => s.user_id !== row.user_id));
        } else {
          setSessions(prev => {
            const idx = prev.findIndex(s => s.user_id === row.user_id);
            if (idx >= 0) { const next = [...prev]; next[idx] = row; return next; }
            return [...prev, row];
          });
        }
      }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);

  // Re-render cada segundo para timers en vivo
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const STALE_MS = 4 * 60 * 60 * 1000; // 4 horas
  const active = sessions.filter(s => {
    const phase = (s.session_data as Record<string, unknown>)?.formPhase;
    const fresh = Date.now() - new Date(s.updated_at).getTime() < STALE_MS;
    return fresh && (phase === 'execution' || phase === 'setup');
  });

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-border" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
        <button onClick={onBack} className="border-none bg-transparent cursor-pointer text-navy p-1 rounded-btn active:bg-bg">
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <span className="relative flex h-3 w-3">
            {active.length > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red opacity-60" />}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${active.length > 0 ? 'bg-red' : 'bg-text-3'}`} />
          </span>
          <span className="font-barlow-condensed text-[20px] font-bold text-navy">En Vivo</span>
          {!loading && (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${active.length > 0 ? 'bg-[rgba(239,68,68,0.12)] text-red' : 'bg-bg text-text-3'}`}>
              {active.length} activa{active.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-3 font-semibold">Tiempo real</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-text-3">
            <div className="w-4 h-4 border-2 border-text-3/30 border-t-text-3 rounded-full animate-spin" />
            <span className="text-[13px]">Cargando sesiones…</span>
          </div>
        )}
        {!loading && active.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-text-3">
            <span className="text-[40px]">🟢</span>
            <span className="text-[15px] font-semibold">Sin auditorías activas ahora mismo</span>
            <span className="text-[12px]">Esta vista se actualiza en tiempo real</span>
          </div>
        )}
        {active.map(session => {
          const sd = session.session_data as Record<string, unknown>;
          const isExec = sd.formPhase === 'execution';
          const tienda = allStores.find(t => t.cod === (sd.tiendaCod as string));
          const auditor = (sd.auditor as string)?.trim() || 'Auditor desconocido';
          const pickers = pickersOf(sd);
          const tipo = (sd.tipo as string) ?? '';
          const pallets = (sd.pallets as string)?.trim();
          const tieneErrores = sd.tieneErrores as boolean | null | undefined;
          const elapsed = sd.auditStartTime
            ? Math.floor((Date.now() - new Date(sd.auditStartTime as string).getTime()) / 1000)
            : 0;
          const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
          const ss = String(elapsed % 60).padStart(2, '0');

          return (
            <div key={session.user_id} className="bg-white rounded-2xl border border-border overflow-hidden" style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.08)' }}>

              {/* Barra superior: estado + auditor + timer */}
              <div className="px-4 py-3 flex items-center gap-3"
                style={{ background: isExec ? 'linear-gradient(135deg,rgba(22,163,74,0.09),rgba(22,163,74,0.03))' : 'linear-gradient(135deg,rgba(217,119,6,0.09),rgba(217,119,6,0.03))' }}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isExec ? 'bg-success' : 'bg-warn'} animate-pulse`} />
                <div className="flex-1 min-w-0">
                  <div className="font-barlow-condensed text-[17px] font-bold text-navy leading-tight">{auditor}</div>
                  <div className={`text-[10px] font-bold uppercase tracking-wide ${isExec ? 'text-success' : 'text-warn'}`}>
                    {isExec ? 'En ejecución' : 'Configurando'}
                  </div>
                </div>
                {isExec && (
                  <div className="text-right flex-shrink-0">
                    <div className="font-barlow-condensed text-[26px] font-black text-navy leading-none">{mm}:{ss}</div>
                    <div className="text-[9px] text-text-3 uppercase tracking-wide">tiempo</div>
                  </div>
                )}
              </div>

              {/* Cuerpo: datos de la auditoría */}
              <div className="px-4 py-3 space-y-2.5">

                {/* Tienda */}
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-text-3 uppercase font-bold w-20 flex-shrink-0 pt-0.5">Tienda</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-[13px] text-text">
                      {tienda?.nombre ?? (sd.tiendaCod as string) ?? '—'}
                    </span>
                    {tienda && (
                      <span className="ml-1.5 font-mono text-[10px] text-text-3">[{tienda.cod}]</span>
                    )}
                    {tienda && (
                      <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tienda.area === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>
                        {tienda.area === 'santiago' ? 'STG' : 'REG'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contenido (tipo) */}
                {tipo && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-3 uppercase font-bold w-20 flex-shrink-0">Contenido</span>
                    <span className="font-semibold text-[13px] text-text">{tipoLabel(tipo)}</span>
                  </div>
                )}

                {/* Pickers */}
                {pickers.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] text-text-3 uppercase font-bold w-20 flex-shrink-0 pt-0.5">
                      {pickers.length > 1 ? 'Pickers' : 'Picker'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {pickers.map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[rgba(37,99,235,0.08)] border border-[rgba(37,99,235,0.20)] rounded-full text-[12px] font-semibold text-info">
                          {pickers.length > 1 && <span className="text-[9px] text-text-3">P{i + 1}</span>}
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pallets */}
                {pallets && parseInt(pallets) > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-3 uppercase font-bold w-20 flex-shrink-0">Pallets</span>
                    <span className="font-semibold text-[13px] text-text">{pallets}</span>
                  </div>
                )}

                {/* Resultado preliminar */}
                {isExec && tieneErrores !== undefined && tieneErrores !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-3 uppercase font-bold w-20 flex-shrink-0">Resultado</span>
                    <span className={`font-bold text-[12px] px-2 py-0.5 rounded-full ${tieneErrores ? 'bg-[rgba(211,47,47,0.12)] text-red' : 'bg-[rgba(22,163,74,0.12)] text-success'}`}>
                      {tieneErrores ? '✗ MALO' : '✓ BUENO'}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 pb-2.5 flex items-center justify-between">
                <span className="text-[9px] text-text-3 font-mono truncate">{session.user_id.slice(0, 8)}…</span>
                <span className="text-[10px] text-text-3">
                  Actualizado {new Date(session.updated_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
