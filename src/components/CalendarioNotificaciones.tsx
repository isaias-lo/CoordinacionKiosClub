'use client';
import { useState, useEffect } from 'react';
import {
  fetchNotificacionesPendientes, subscribeToNotificaciones,
  descartarNotificacion, applyChange,
  type Notificacion, type CalRecord,
} from '@/lib/calendarioArmadoSync';

const DIA: Record<string, string> = { LU: 'Lun', MA: 'Mar', MI: 'Mié', JU: 'Jue', VI: 'Vie', SA: 'Sáb' };
const GRP: Record<string, string> = { rm: 'RM', costa: 'Costa', fal: 'Regiones' };

interface Props {
  compact?: boolean;
  onCount?: (n: number) => void;
  // Embedded inside CalendarioColumnas — apply locally, save on user's explicit "Guardar"
  localCal?: CalRecord | null;
  onApplyToLocal?: (newCal: CalRecord) => void;
  onMarkPendingResolve?: (notifId: string) => void;
}

export default function CalendarioNotificaciones({
  compact, onCount, localCal, onApplyToLocal, onMarkPendingResolve,
}: Props) {
  const [notifs,   setNotifs]   = useState<Notificacion[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [handled,  setHandled]  = useState<Record<string, boolean>>({});
  const [discarding, setDiscarding] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchNotificacionesPendientes().then(setNotifs);
    return subscribeToNotificaciones(setNotifs);
  }, []);

  useEffect(() => { onCount?.(notifs.length); }, [notifs.length, onCount]);

  if (notifs.length === 0) return null;

  if (compact) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        background: 'rgba(255,149,0,0.15)', border: '1.5px solid rgba(255,149,0,0.45)',
        borderRadius: 10, padding: '7px 12px',
      }}>
        <span style={{ fontSize: 15 }}>🔔</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#FF9500' }}>
          {notifs.length} cambio{notifs.length !== 1 ? 's' : ''} pendiente{notifs.length !== 1 ? 's' : ''} de Control Interno
        </span>
      </div>
    );
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  function countHandled(notifId: string, total: number) {
    let n = 0;
    for (let i = 0; i < total; i++) if (handled[`${notifId}:${i}`]) n++;
    return n;
  }

  function markOneHandled(notifId: string, idx: number, total: number, prev: Record<string, boolean>) {
    const updated = { ...prev, [`${notifId}:${idx}`]: true };
    let n = 0;
    for (let i = 0; i < total; i++) if (updated[`${notifId}:${i}`]) n++;
    if (n === total) onMarkPendingResolve?.(notifId);
    return updated;
  }

  function onAprobarLocal(notif: Notificacion, idx: number) {
    if (!localCal || !onApplyToLocal) return;
    onApplyToLocal(applyChange(localCal, notif.cambios[idx]));
    setHandled(prev => markOneHandled(notif.id, idx, notif.cambios.length, prev));
  }

  function onCancelarLocal(notif: Notificacion, idx: number) {
    setHandled(prev => markOneHandled(notif.id, idx, notif.cambios.length, prev));
  }

  function onAplicarTodosLocal(notif: Notificacion) {
    if (!localCal || !onApplyToLocal) return;
    const newCal = notif.cambios.reduce((acc, cambio) => applyChange(acc, cambio), localCal);
    onApplyToLocal(newCal);
    onMarkPendingResolve?.(notif.id);
    setHandled(prev => {
      const updated = { ...prev };
      notif.cambios.forEach((_, i) => { updated[`${notif.id}:${i}`] = true; });
      return updated;
    });
  }

  async function onDescartar(notif: Notificacion) {
    setDiscarding(prev => new Set(prev).add(notif.id));
    try { await descartarNotificacion(notif.id); }
    finally { setDiscarding(prev => { const s = new Set(prev); s.delete(notif.id); return s; }); }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {notifs.map(notif => {
        const isExpanded  = expanded.has(notif.id);
        const hCount      = countHandled(notif.id, notif.cambios.length);
        const isDiscarding = discarding.has(notif.id);
        const allHandled  = hCount === notif.cambios.length && notif.cambios.length > 0;

        const dt    = new Date(notif.created_at);
        const dtStr = dt.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short' })
                    + ' ' + dt.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour12: false, hour: '2-digit', minute: '2-digit' });

        return (
          <div key={notif.id} style={{
            background: allHandled ? 'rgba(48,209,88,0.07)' : 'rgba(255,149,0,0.07)',
            border: `1.5px solid ${allHandled ? 'rgba(48,209,88,0.30)' : 'rgba(255,149,0,0.30)'}`,
            borderRadius: 16, marginBottom: 10, overflow: 'hidden',
            transition: 'background 0.3s, border-color 0.3s',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{allHandled ? '✅' : '🔔'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: allHandled ? '#30D158' : '#FF9500' }}>
                  {allHandled ? 'Cambios aplicados — guarda para confirmar' : 'Cambios de Control Interno'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 1 }}>
                  {dtStr} · {notif.cambios.length} cambio{notif.cambios.length !== 1 ? 's' : ''}
                  {hCount > 0 && !allHandled && (
                    <span style={{ color: '#FF9500', marginLeft: 6 }}>· {hCount}/{notif.cambios.length} revisados</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => toggleExpand(notif.id)}
                style={{
                  background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 8, color: 'rgba(255,255,255,0.70)', fontSize: 12, fontWeight: 600,
                  padding: '5px 11px', cursor: 'pointer', flexShrink: 0,
                }}>
                {isExpanded ? 'Ocultar' : 'Ver detalle'}
              </button>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${allHandled ? 'rgba(48,209,88,0.18)' : 'rgba(255,149,0,0.18)'}`, padding: '10px 14px 14px' }}>

                {/* Change rows */}
                <div style={{ marginBottom: 12 }}>
                  {notif.cambios.map((cambio, idx) => {
                    const key       = `${notif.id}:${idx}`;
                    const isHandled = !!handled[key];

                    const TIPO = cambio.tipo === 'add'
                      ? { bg: 'rgba(52,199,89,0.13)', border: 'rgba(52,199,89,0.40)', color: '#30D158', label: '+ AGREGA' }
                      : cambio.tipo === 'remove'
                      ? { bg: 'rgba(255,69,58,0.13)',  border: 'rgba(255,69,58,0.40)',  color: '#FF453A', label: '− ELIMINA' }
                      : { bg: 'rgba(0,122,255,0.13)',  border: 'rgba(0,122,255,0.40)',  color: '#0A84FF', label: '⇄ MUEVE' };

                    const diaLabel = cambio.tipo === 'move'
                      ? `${DIA[cambio.from_dia!] ?? cambio.from_dia} → ${DIA[cambio.dia] ?? cambio.dia}`
                      : (DIA[cambio.dia] ?? cambio.dia);

                    return (
                      <div key={idx} style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '8px 0',
                        borderBottom: idx < notif.cambios.length - 1
                          ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        opacity: isHandled ? 0.38 : 1, transition: 'opacity 0.2s',
                      }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6,
                          background: TIPO.bg, border: `1px solid ${TIPO.border}`,
                          color: TIPO.color, flexShrink: 0, letterSpacing: '0.04em', whiteSpace: 'nowrap',
                        }}>{TIPO.label}</span>
                        <span style={{
                          flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.88)',
                          fontFamily: 'monospace', fontWeight: 700,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{cambio.tienda}</span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)', whiteSpace: 'nowrap' }}>
                          {diaLabel} ({GRP[cambio.grupo] ?? cambio.grupo})
                        </span>
                        {!isHandled ? (
                          <>
                            <button onClick={() => onAprobarLocal(notif, idx)}
                              style={{
                                fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 7,
                                background: 'rgba(52,199,89,0.18)', border: '1px solid rgba(52,199,89,0.50)',
                                color: '#30D158', cursor: 'pointer', flexShrink: 0,
                              }}>
                              ✓ Aplicar
                            </button>
                            <button onClick={() => onCancelarLocal(notif, idx)}
                              style={{
                                fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 7,
                                background: 'rgba(255,59,48,0.13)', border: '1px solid rgba(255,59,48,0.38)',
                                color: '#FF453A', cursor: 'pointer', flexShrink: 0,
                              }}>
                              ✕
                            </button>
                          </>
                        ) : (
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', flexShrink: 0 }}>listo</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action buttons */}
                {!allHandled && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => onAplicarTodosLocal(notif)}
                      style={{
                        flex: 1, minWidth: 130, height: 38, borderRadius: 10,
                        fontSize: 13, fontWeight: 700,
                        background: 'linear-gradient(175deg, #30D158 0%, #25A244 100%)',
                        color: '#fff', border: 'none', cursor: 'pointer',
                        boxShadow: '0 3px 10px rgba(37,162,68,0.35)',
                      }}>
                      ✅ Aplicar todos
                    </button>
                    <button disabled={isDiscarding} onClick={() => void onDescartar(notif)}
                      style={{
                        height: 38, padding: '0 16px', borderRadius: 10,
                        fontSize: 13, fontWeight: 700,
                        background: 'rgba(255,59,48,0.12)', border: '1px solid rgba(255,59,48,0.38)',
                        color: '#FF453A', cursor: isDiscarding ? 'default' : 'pointer',
                        opacity: isDiscarding ? 0.45 : 1,
                      }}>
                      {isDiscarding ? '...' : 'Descartar'}
                    </button>
                  </div>
                )}

                {allHandled && (
                  <div style={{ fontSize: 12, color: 'rgba(48,209,88,0.8)', fontWeight: 600 }}>
                    ✓ Listo — da clic en <strong>Guardar cambios</strong> para confirmar
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
