'use client';

import React, { useState } from 'react';
import { Bug, ChevronRight } from 'lucide-react';
import type { OdooConfig } from '@/features/auditoria/types';

interface ControlCruceDebugToolsProps {
  odooConfig: OdooConfig | null;
}

export default function ControlCruceDebugTools({ odooConfig }: ControlCruceDebugToolsProps) {
  const [debugOpen,       setDebugOpen]       = useState(false);
  const [debugData,       setDebugData]       = useState<Record<string, unknown>[] | null>(null);
  const [debugTypes,      setDebugTypes]      = useState<Record<string, unknown>[] | null>(null);
  const [debugDone,       setDebugDone]       = useState<Record<string, unknown>[] | null>(null);
  const [debugTypeDetail, setDebugTypeDetail] = useState<Record<string, unknown>[] | null>(null);
  const [debugResp,       setDebugResp]       = useState<Record<string, unknown> | null>(null);
  const [debugRespPick,   setDebugRespPick]   = useState('');
  const [debugMsgPick,    setDebugMsgPick]    = useState('');
  const [debugMsgData,    setDebugMsgData]    = useState<Record<string, unknown> | null>(null);

  async function runDebug() {
    if (!odooConfig?.url) return;
    setDebugData(null); setDebugTypes(null); setDebugDone(null); setDebugTypeDetail(null);
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'debug_activities', config: odooConfig }),
      });
      const data = await res.json() as {
        pending?:    Record<string, unknown>[];
        done?:       Record<string, unknown>[];
        allTypes?:   Record<string, unknown>[];
        typeDetail?: Record<string, unknown>[];
      };
      setDebugData(data.pending ?? []);
      setDebugDone(data.done ?? []);
      setDebugTypes(data.allTypes ?? []);
      setDebugTypeDetail(data.typeDetail ?? []);
    } catch (e) { setDebugData([{ error: String(e) }]); }
  }

  async function runDebugMessages() {
    if (!odooConfig?.url || !debugMsgPick.trim()) return;
    setDebugMsgData(null);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'debug_messages_picking', config: odooConfig, query: debugMsgPick.trim() }),
      });
      setDebugMsgData(await res.json());
    } catch (e) { setDebugMsgData({ error: String(e) }); }
  }

  async function runDebugResponsable() {
    if (!odooConfig?.url || !debugRespPick.trim()) return;
    setDebugResp(null);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'debug_responsable', config: odooConfig, query: debugRespPick.trim() }),
      });
      setDebugResp(await res.json());
    } catch (e) { setDebugResp({ error: String(e) }); }
  }

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10 }}>
      <button
        onClick={() => setDebugOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.28)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.07em', padding: '2px 0',
        }}
      >
        <Bug size={12} />
        HERRAMIENTAS DE DIAGNÓSTICO
        <ChevronRight
          size={11}
          style={{ transform: debugOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        />
      </button>

      {debugOpen && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>

          <div>
            <button
              onClick={runDebug}
              title="Ver campos reales de las últimas 10 actividades en Odoo (sin filtro de usuario)"
              style={{
                background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)',
                borderRadius: 6, color: '#C084FC', padding: '5px 11px',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Debug Actividades Odoo
            </button>
          </div>

          {(debugData || debugTypes) && (
            <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.3)' }}>
              <div style={{ background: 'rgba(168,85,247,0.18)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#C084FC' }}>
                Debug Odoo — Actividades
              </div>

              {debugTypes && (
                <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                    TIPOS DISPONIBLES ({debugTypes.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {debugTypes.map((t, i) => (
                      <span key={i} style={{
                        background: 'rgba(255,255,255,0.07)', borderRadius: 4,
                        padding: '2px 8px', fontSize: 11, color: '#fff', fontFamily: 'monospace',
                      }}>
                        <span style={{ color: '#FCD34D' }}>{String(t.id)}</span>{' → '}{String(t.name)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {debugTypeDetail && debugTypeDetail.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px 8px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>
                    DETALLE TIPOS 26/27/28
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {debugTypeDetail.map((t, i) => (
                      <span key={i} style={{
                        background: 'rgba(253,224,71,0.08)', border: '1px solid rgba(253,224,71,0.25)',
                        borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#fff', fontFamily: 'monospace',
                      }}>
                        <span style={{ color: '#FCD34D' }}>{String(t.id)}</span>
                        {' → '}{JSON.stringify(t.name)}{' | '}{JSON.stringify(t.summary)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {([
                { label: 'PENDIENTES (mail.activity)', data: debugData,  cols: ['id','res_name','user_id','activity_type_id','summary','date_deadline'] },
                { label: 'COMPLETADAS (mail.message)', data: debugDone,  cols: ['id','record_name','author_id','mail_activity_type_id','date','body'] },
              ] as Array<{ label: string; data: Record<string,unknown>[] | null; cols: string[] }>).map(({ label, data, cols }) => data && (
                <div key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ padding: '5px 12px 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>
                    {label} ({data.length})
                  </div>
                  {data.length === 0
                    ? <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>Sin resultados</div>
                    : (
                      <div style={{ overflowX: 'auto', maxHeight: 200, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                              {cols.map(h => (
                                <th key={h} style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.4)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {data.map((row, i) => (
                              <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                {cols.map(k => (
                                  <td key={k} style={{ padding: '3px 8px', color: 'rgba(255,255,255,0.65)', borderBottom: '1px solid rgba(255,255,255,0.04)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {JSON.stringify(row[k])}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  }
                </div>
              ))}

              <div style={{ padding: '5px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.22)', borderTop: '1px solid rgba(255,255,255,0.06)', fontStyle: 'italic' }}>
                Al completar una actividad en Odoo se elimina de mail.activity y queda en mail.message.
              </div>
            </div>
          )}

          {/* Debug mensajes de un picking — para analizar fechaDeclaracion */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.05em' }}>
              DEBUG MENSAJES
            </span>
            <input
              value={debugMsgPick}
              onChange={e => setDebugMsgPick(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runDebugMessages()}
              placeholder="Ej: 20CTC/INT/03084"
              style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6, color: '#fff', padding: '4px 9px', fontSize: 11,
                outline: 'none', width: 190,
              }}
            />
            <button
              onClick={runDebugMessages}
              style={{
                background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)',
                borderRadius: 6, color: '#93C5FD', padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              }}
            >
              Ver todos los mensajes
            </button>
          </div>

          {debugMsgData && (
            <div style={{ borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', overflow: 'hidden', marginTop: 4 }}>
              <div style={{ background: 'rgba(59,130,246,0.18)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#93C5FD' }}>
                Mensajes Odoo — {debugMsgPick}
              </div>

              {/* Info del picking */}
              {Boolean((debugMsgData as Record<string,unknown>).picking) && (
                <div style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>PICKING</div>
                  <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify((debugMsgData as Record<string,unknown>).picking, null, 2)}
                  </pre>
                </div>
              )}

              {/* Actividades pendientes */}
              {Array.isArray((debugMsgData as Record<string,unknown>).pendingActivities) && (
                <div style={{ padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#FCD34D', marginBottom: 5 }}>
                    ACTIVIDADES PENDIENTES ({((debugMsgData as Record<string,unknown>).pendingActivities as unknown[]).length})
                    <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, marginLeft: 6 }}>— tienen create_date</span>
                  </div>
                  <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'pre-wrap', maxHeight: 120, overflowY: 'auto' }}>
                    {JSON.stringify((debugMsgData as Record<string,unknown>).pendingActivities, null, 2)}
                  </pre>
                </div>
              )}

              {/* Tabla de mensajes */}
              {Array.isArray((debugMsgData as Record<string,unknown>).messages) && (
                <div style={{ padding: '7px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>
                    MAIL.MESSAGE ({((debugMsgData as Record<string,unknown>).messages as unknown[]).length}) — ordenados por date ASC
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                          {['id','date','create_date','message_type','mail_activity_type_id','subtype_id','author_id','body(100)'].map(h => (
                            <th key={h} style={{ padding: '3px 7px', color: 'rgba(255,255,255,0.4)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {((debugMsgData as Record<string,unknown>).messages as Array<Record<string,unknown>>).map((msg, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            <td style={tdStyle}>{String(msg.id)}</td>
                            <td style={tdStyle}>{String(msg.date)}</td>
                            <td style={tdStyle}>{String(msg.create_date)}</td>
                            <td style={{ ...tdStyle, color: msg.message_type === 'activity' ? '#FCD34D' : msg.message_type === 'comment' ? '#6EE7B7' : 'rgba(255,255,255,0.5)' }}>
                              {String(msg.message_type)}
                            </td>
                            <td style={tdStyle}>{JSON.stringify(msg.mail_activity_type_id)}</td>
                            <td style={tdStyle}>{JSON.stringify(msg.subtype_id)}</td>
                            <td style={tdStyle}>{JSON.stringify(msg.author_id)}</td>
                            <td style={{ ...tdStyle, maxWidth: 200 }}>{String(msg.body ?? '').replace(/<[^>]*>/g,' ').slice(0,100)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Debug responsable armado */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.05em' }}>
              DEBUG RESPONSABLE
            </span>
            <input
              value={debugRespPick}
              onChange={e => setDebugRespPick(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runDebugResponsable()}
              placeholder="Ej: 20CTC/INT/03084"
              style={{
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6, color: '#fff', padding: '4px 9px', fontSize: 11,
                outline: 'none', width: 190,
              }}
            />
            <button
              onClick={runDebugResponsable}
              style={{
                background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)',
                borderRadius: 6, color: '#C084FC', padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              }}
            >
              Trazar cadena
            </button>
          </div>

          {debugResp && (
            <div style={{ borderRadius: 8, border: '1px solid rgba(168,85,247,0.3)', overflow: 'hidden' }}>
              <div style={{ background: 'rgba(168,85,247,0.18)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#C084FC' }}>
                Cadena Responsable Armado — {debugRespPick}
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FCD34D', marginBottom: 4 }}>RESPUESTA COMPLETA</div>
                <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
                  {JSON.stringify(debugResp, null, 2)}
                </pre>
              </div>
              {[
                { label: '① INT Picking',          key: 'intPick'           },
                { label: '② rawOrigin',             key: 'rawOrigin'         },
                { label: '③ parsedRefs',            key: 'parsedRefs'        },
                { label: '④ parentByName',          key: 'parentByName'      },
                { label: '⑤ sameOriginPickings',    key: 'sameOriginPickings'},
                { label: '⑥ Moves del INT',         key: 'moves'             },
                { label: '⑦ Moves Origen',          key: 'origMoves'         },
                { label: '⑧ Pickings Origen',       key: 'origPickings'      },
              ].map(({ label, key }) => {
                const val = (debugResp as Record<string, unknown>)[key];
                const empty = val === undefined || val === null ||
                  (Array.isArray(val) && val.length === 0) ||
                  (typeof val === 'string' && val === '');
                return (
                  <div key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: empty ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)', marginBottom: empty ? 0 : 4 }}>
                      {label}
                      {empty && <span style={{ color: 'rgba(220,38,38,0.6)', marginLeft: 6 }}>— VACÍO</span>}
                    </div>
                    {!empty && (
                      <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto' }}>
                        {JSON.stringify(val, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const tdStyle: React.CSSProperties = {
  padding: '3px 7px', color: 'rgba(255,255,255,0.65)',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
};
