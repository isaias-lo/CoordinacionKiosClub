'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { getOdooConfig } from '@/features/auditoria/utils/odooApi';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CruceRow {
  activityId:         number;
  pickingId:          number;
  pickingName:        string;
  storeCod:           string;
  responsableArmado:  string;
  fechaArmado:        string;
  fechaDeclaracion:   string | null;
  detalle:            string;
  movAjuste:          string;  // extraído del body de Odoo
  origin:             string;
  state:              string;
}

interface ManualRow {
  picking_name:         string;
  sku:                  string;
  correcta_declaracion: string;
  movimiento_ajuste:    string;
}

interface AuditadoInfo {
  auditado: 'SI' | 'NO';
  auditorName: string;
}

// ─── Helpers de color ────────────────────────────────────────────────────────

function detalleColor(d: string): { bg: string; color: string } {
  const u = d.toUpperCase();
  if (u.includes('FALTANTE')) return { bg: 'rgba(220,38,38,0.85)',  color: '#fff' };
  if (u.includes('SOBRANTE')) return { bg: 'rgba(217,119,6,0.85)',  color: '#fff' };
  if (u.includes('MERMA'))    return { bg: 'rgba(146,64,14,0.85)',  color: '#fff' };
  return { bg: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' };
}

function auditadoColor(v: 'SI' | 'NO'): { bg: string; color: string } {
  return v === 'SI'
    ? { bg: 'rgba(22,163,74,0.85)',  color: '#fff' }
    : { bg: 'rgba(220,38,38,0.85)', color: '#fff' };
}

function corrDecColor(v: string): { bg: string; color: string } {
  const u = v.toUpperCase();
  if (u === 'SI')          return { bg: 'rgba(22,163,74,0.85)',   color: '#fff' };
  if (u === 'NO')          return { bg: 'rgba(220,38,38,0.85)',  color: '#fff' };
  if (u.includes('REVIS')) return { bg: 'rgba(217,119,6,0.85)',  color: '#fff' };
  if (u === 'PENDIENTE')   return { bg: 'rgba(100,116,139,0.5)', color: 'rgba(255,255,255,0.6)' };
  return { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Celda editable ──────────────────────────────────────────────────────────

function EditableCell({
  value, onSave, placeholder, monospace,
}: { value: string; onSave: (v: string) => void; placeholder?: string; monospace?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function commit() {
    setEditing(false);
    if (local !== value) onSave(local);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocal(value); setEditing(false); } }}
        style={{
          background: 'rgba(59,130,246,0.2)',
          border: '1px solid rgba(59,130,246,0.6)',
          borderRadius: 4,
          color: '#fff',
          padding: '2px 6px',
          fontSize: 12,
          width: '100%',
          outline: 'none',
          fontFamily: monospace ? 'monospace' : 'inherit',
        }}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click para editar"
      style={{
        cursor: 'pointer',
        display: 'block',
        padding: '2px 4px',
        borderRadius: 4,
        fontFamily: monospace ? 'monospace' : 'inherit',
        fontSize: 12,
        color: local ? '#fff' : 'rgba(255,255,255,0.25)',
        borderBottom: '1px dashed rgba(255,255,255,0.2)',
        minWidth: 60,
      }}
    >
      {local || placeholder || '—'}
    </span>
  );
}

// ─── Dropdown corrección ─────────────────────────────────────────────────────

const CORR_OPTS = ['PENDIENTE', 'SI', 'NO', 'EN REVISIÓN'];

function CorrDropdown({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const c = corrDecColor(value);
  return (
    <select
      value={value}
      onChange={e => onSave(e.target.value)}
      style={{
        background: c.bg,
        color: c.color,
        border: 'none',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        padding: '2px 6px',
        cursor: 'pointer',
        appearance: 'none',
        textAlign: 'center',
        width: '100%',
      }}
    >
      {CORR_OPTS.map(o => <option key={o} value={o} style={{ background: '#1e293b', color: '#fff' }}>{o}</option>)}
    </select>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function ControlCruceContent() {
  const [rows,         setRows]         = useState<CruceRow[]>([]);
  const [manualMap,    setManualMap]    = useState<Record<string, ManualRow>>({});
  const [auditadoMap,  setAuditadoMap]  = useState<Record<string, AuditadoInfo>>({});
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [controlUser,  setControlUser]  = useState('Control Interno');
  const [savingKey,    setSavingKey]    = useState('');
  const [search,       setSearch]       = useState('');
  const [typeIds,      setTypeIds]      = useState('1,2,3');
  const [debugData,    setDebugData]    = useState<Record<string, unknown>[] | null>(null);

  const odooConfig = getOdooConfig();

  // ── Debug: ver campos reales de las actividades en Odoo ──────────────────
  const [debugTypes,      setDebugTypes]      = useState<Record<string, unknown>[] | null>(null);
  const [debugDone,       setDebugDone]       = useState<Record<string, unknown>[] | null>(null);
  const [debugTypeDetail, setDebugTypeDetail] = useState<Record<string, unknown>[] | null>(null);

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
      setDebugData(data.pending      ?? []);
      setDebugDone(data.done         ?? []);
      setDebugTypes(data.allTypes    ?? []);
      setDebugTypeDetail(data.typeDetail ?? []);
    } catch (e) {
      setDebugData([{ error: String(e) }]);
    }
  }

  // ── Debug responsable: traza la cadena para un picking específico ─────────
  const [debugResp,    setDebugResp]    = useState<Record<string, unknown> | null>(null);
  const [debugRespPick, setDebugRespPick] = useState('');

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

  // ── Cargar datos de Odoo ──────────────────────────────────────────────────
  const loadOdoo = useCallback(async () => {
    if (!odooConfig?.url) { setError('Configura Odoo en Auditoría → Config primero.'); return; }
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:   'get_control_activities',
          config:   odooConfig,
          query:    controlUser,
          pickings: typeIds.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json() as { rows?: CruceRow[]; error?: string; message?: string };
      if (data.error)   { setError(data.error); return; }
      if (data.message) { setError(data.message); return; }
      setRows(data.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, [odooConfig, controlUser]);

  // ── Cargar campos manuales de Supabase ────────────────────────────────────
  const loadManual = useCallback(async () => {
    try {
      const res  = await fetch('/api/control-cruce');
      const data = await res.json() as { data?: ManualRow[] };
      const map: Record<string, ManualRow> = {};
      for (const row of (data.data ?? [])) map[row.picking_name] = row;
      setManualMap(map);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    loadManual();
  }, [loadManual]);

  // ── Cruzar con auditoria (Supabase) ───────────────────────────────────────
  // Se ejecuta cuando tenemos filas de Odoo. Busca en la tabla 'auditoria'
  // si alguna entrada tiene operaciones que coincidan con los pickings.
  //
  // Idea de matching:
  //   - El origin del picking (ej: "OP/2935149,OP/3228150") contiene las
  //     referencias padre.
  //   - En auditoria, las operaciones auditor tiene operaciones[].codigo
  //     que corresponden a esas referencias.
  //   - Coincidencia: tienda_cod del row === tiendaCod de auditoria
  //     Y alguna de las refs del origin aparece en operaciones[].codigo
  //   - Si hay match → AUDITADO = SI, auditorName = entry.auditor
  //
  // NOTA: Para mejorar la precisión, una futura versión puede pasar
  // los origin refs directamente como filtro al endpoint de auditoria.
  useEffect(() => {
    if (!rows.length) return;

    async function matchAuditoria() {
      try {
        // Recolectar todos los store codes únicos para hacer una sola query
        const storeCods = [...new Set(rows.map(r => r.storeCod).filter(Boolean))];
        const res = await fetch(
          `/api/trazabilidad?limit=0`, // placeholder — ver nota abajo
        );
        // Implementación básica: consultamos la tabla auditoria directo
        // via un endpoint dedicado que crearemos más adelante.
        // Por ahora, marcamos como NO hasta tener el endpoint.
        void storeCods; void res;
      } catch { /* silencioso */ }
    }

    // Placeholder: todos NO hasta que se integre el endpoint de auditoria
    const map: Record<string, AuditadoInfo> = {};
    for (const r of rows) {
      map[r.pickingName] = { auditado: 'NO', auditorName: '' };
    }
    setAuditadoMap(map);

    // Lanzar la búsqueda real (async, actualiza el map cuando termina)
    matchAuditoria();
  }, [rows]);

  // ── Guardar campo manual ──────────────────────────────────────────────────
  async function saveManual(pickingName: string, field: keyof Omit<ManualRow, 'picking_name'>, value: string) {
    const prev = manualMap[pickingName] ?? {
      picking_name: pickingName, sku: '', correcta_declaracion: 'PENDIENTE', movimiento_ajuste: '',
    };
    const updated = { ...prev, [field]: value };
    setManualMap(m => ({ ...m, [pickingName]: updated }));
    setSavingKey(pickingName + field);
    try {
      await fetch('/api/control-cruce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } finally {
      setSavingKey('');
    }
  }

  // ── Filtro de búsqueda ────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.storeCod.toLowerCase().includes(q) ||
      r.pickingName.toLowerCase().includes(q) ||
      r.responsableArmado.toLowerCase().includes(q) ||
      r.detalle.toLowerCase().includes(q) ||
      (manualMap[r.pickingName]?.sku ?? '').toLowerCase().includes(q) ||
      (manualMap[r.pickingName]?.movimiento_ajuste ?? '').toLowerCase().includes(q)
    );
  });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 0 40px' }}>

      {/* Barra de controles */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 200 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, whiteSpace: 'nowrap' }}>Usuario Odoo:</span>
          <input
            value={controlUser}
            onChange={e => setControlUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadOdoo()}
            placeholder="Control Interno"
            style={{
              flex: 1, background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
              color: '#fff', padding: '6px 10px', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, whiteSpace: 'nowrap' }}>IDs tipo:</span>
          <input
            value={typeIds}
            onChange={e => setTypeIds(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadOdoo()}
            placeholder="1,2,3"
            title="IDs de activity_type_id en Odoo (separados por coma)"
            style={{
              width: 80, background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
              color: '#fff', padding: '6px 10px', fontSize: 13, outline: 'none',
            }}
          />
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tienda, picking, detalle…"
          style={{
            flex: 2, minWidth: 160,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
            color: '#fff', padding: '6px 10px', fontSize: 13, outline: 'none',
          }}
        />
        <button
          onClick={loadOdoo}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(59,130,246,0.2)', border: '1px solid rgba(59,130,246,0.5)',
            borderRadius: 8, color: '#93C5FD', padding: '7px 14px',
            fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Cargando…' : rows.length ? 'Actualizar' : 'Cargar desde Odoo'}
        </button>
        <button
          onClick={runDebug}
          title="Ver campos reales de las últimas 10 actividades en Odoo (sin filtro de usuario)"
          style={{
            background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)',
            borderRadius: 8, color: '#C084FC', padding: '7px 12px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          🔍 Debug Odoo
        </button>
      </div>

      {/* Panel debug */}
      {(debugData || debugTypes) && (
        <div style={{ marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(168,85,247,0.35)' }}>
          <div style={{ background: 'rgba(168,85,247,0.2)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#C084FC' }}>
            🔍 Debug Odoo
          </div>

          {/* Todos los tipos disponibles */}
          {debugTypes && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                TODOS LOS TIPOS EN mail.activity.type ({debugTypes.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {debugTypes.map((t, i) => (
                  <span key={i} style={{
                    background: 'rgba(255,255,255,0.08)', borderRadius: 4,
                    padding: '2px 8px', fontSize: 11, color: '#fff',
                    fontFamily: 'monospace',
                  }}>
                    <span style={{ color: '#FCD34D' }}>{String(t.id)}</span>
                    {' → '}
                    {String(t.name)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Helper para renderizar mini-tablas de debug */}
          {/* D. Detalle de tipos 26/27/28 */}
          {debugTypeDetail && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px 8px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                D. NOMBRES REALES DE TIPOS 26, 27, 28
              </div>
              {debugTypeDetail.length === 0
                ? <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>No encontrados</div>
                : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {debugTypeDetail.map((t, i) => (
                      <span key={i} style={{ background: 'rgba(253,224,71,0.1)', border: '1px solid rgba(253,224,71,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#fff', fontFamily: 'monospace' }}>
                        <span style={{ color: '#FCD34D' }}>{String(t.id)}</span>
                        {' → name: '}<strong>{JSON.stringify(t.name)}</strong>
                        {' | summary: '}{JSON.stringify(t.summary)}
                        {' | category: '}{JSON.stringify(t.category)}
                      </span>
                    ))}
                  </div>
              }
            </div>
          )}

          {([
            { label: 'B. ACTIVIDADES PENDIENTES en stock.picking (mail.activity)', data: debugData, cols: ['id','res_name','user_id','activity_type_id','summary','date_deadline'], hint: '⚠️ Si todas son "TO DO" aquí, las de Faltantes/Sobrantes/Merma ya fueron completadas → mira sección C.' },
            { label: 'C. ACTIVIDADES COMPLETADAS en stock.picking (mail.message + body)', data: debugDone, cols: ['id','record_name','author_id','mail_activity_type_id','date','body'], hint: '🔑 Mira la columna "body" — ahí está el texto que escribió Control Interno al completar la actividad (Faltante/Sobrante/Merma).' },
          ] as Array<{ label: string; data: Record<string,unknown>[] | null; cols: string[]; hint: string }>).map(({ label, data, cols, hint }) => data && (
            <div key={label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ padding: '6px 12px 4px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)' }}>{label} ({data.length})</div>
              {data.length === 0
                ? <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Sin resultados</div>
                : (
                  <div style={{ overflowX: 'auto', maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {cols.map(h => <th key={h} style={{ padding: '4px 8px', color: 'rgba(255,255,255,0.45)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            {cols.map(k => (
                              <td key={k} style={{ padding: '3px 8px', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.04)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              <div style={{ padding: '4px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>{hint}</div>
            </div>
          ))}

          <div style={{ padding: '6px 12px 8px', fontSize: 11, color: 'rgba(255,255,255,0.25)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            💡 <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Clave:</strong> en Odoo, al marcar una actividad como "hecha" se borra de mail.activity y queda en mail.message.
          </div>
        </div>
      )}

      {/* Debug responsable armado */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Debug Responsable:</span>
        <input
          value={debugRespPick}
          onChange={e => setDebugRespPick(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runDebugResponsable()}
          placeholder="Ej: 20CTC/INT/03084"
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 6, color: '#fff', padding: '5px 10px', fontSize: 12,
            outline: 'none', width: 200,
          }}
        />
        <button onClick={runDebugResponsable} style={{
          background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)',
          borderRadius: 6, color: '#C084FC', padding: '5px 10px', fontSize: 12, cursor: 'pointer',
        }}>
          Trazar cadena
        </button>
      </div>

      {debugResp && (
        <div style={{ marginBottom: 16, borderRadius: 8, border: '1px solid rgba(168,85,247,0.35)', overflow: 'hidden' }}>
          <div style={{ background: 'rgba(168,85,247,0.2)', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#C084FC' }}>
            🔗 Cadena Responsable Armado — {debugRespPick}
          </div>

          {/* Respuesta completa cruda */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#FCD34D', marginBottom: 4 }}>
              RAW RESPONSE (completo):
            </div>
            <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
              {JSON.stringify(debugResp, null, 2)}
            </pre>
          </div>

          {[
            { label: '① INT Picking (user_id, origin, picking_type_id)', key: 'intPick' },
            { label: '② rawOrigin — texto exacto del campo origin', key: 'rawOrigin' },
            { label: '③ parsedRefs — referencias extraídas por regex', key: 'parsedRefs' },
            { label: '④ parentByName — pickings encontrados con esas refs (user_id, responsible_id, owner_id)', key: 'parentByName' },
            { label: '⑤ Pickings mismo origin string', key: 'sameOriginPickings' },
            { label: '⑥ Moves del INT (move_orig_ids)', key: 'moves' },
            { label: '⑦ Moves Origen → picking_id', key: 'origMoves' },
            { label: '⑧ Pickings Origen (user_id)', key: 'origPickings' },
          ].map(({ label, key }) => {
            const val = (debugResp as Record<string, unknown>)[key];
            const empty = val === undefined || val === null ||
              (Array.isArray(val) && val.length === 0) ||
              (typeof val === 'string' && val === '');
            return (
              <div key={key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '6px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: empty ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.55)', marginBottom: 4 }}>
                  {label} {empty ? <span style={{ color: 'rgba(220,38,38,0.7)' }}>— VACÍO</span> : ''}
                </div>
                {!empty && (
                  <pre style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 180, overflowY: 'auto' }}>
                    {JSON.stringify(val, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.4)',
          borderRadius: 8, color: '#FCA5A5', padding: '10px 14px', marginBottom: 14, fontSize: 13,
        }}>
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {/* Sin datos */}
      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', paddingTop: 60, fontSize: 14 }}>
          Presiona "Cargar desde Odoo" para obtener las actividades asignadas a Control Interno.
        </div>
      )}

      {/* Contador */}
      {rows.length > 0 && (
        <div style={{ marginBottom: 10, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
          {filtered.length} fila{filtered.length !== 1 ? 's' : ''}{search ? ` de ${rows.length}` : ''}
          {savingKey && <span style={{ marginLeft: 12, color: '#FCD34D' }}>Guardando…</span>}
        </div>
      )}

      {/* Tabla */}
      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr style={{ background: 'rgba(22,163,74,0.35)' }}>
                {[
                  'TIENDA', 'FECHA ARMADO', 'RESPONSABLE ARMADO', 'MOV ODOO', 'FECHA DECLARACIÓN',
                  'AUDITADO', 'AUDITOR', 'DETALLE', 'SKU',
                  'CORRECTA DECLARACIÓN', 'MOV AJUSTE',
                ].map(h => (
                  <th key={h} style={{
                    padding: '8px 10px', fontSize: 11, fontWeight: 800,
                    letterSpacing: '0.06em', color: '#fff', whiteSpace: 'nowrap',
                    textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.15)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => {
                const manual  = manualMap[row.pickingName]  ?? { sku: '', correcta_declaracion: 'PENDIENTE', movimiento_ajuste: '' };
                const audInfo = auditadoMap[row.pickingName] ?? { auditado: 'NO', auditorName: '' };
                const detC    = detalleColor(row.detalle);
                const audC    = auditadoColor(audInfo.auditado);
                const rowBg   = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent';

                return (
                  <tr key={row.activityId} style={{ background: rowBg }}>
                    {/* TIENDA */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                        background: 'rgba(37,99,235,0.25)', color: '#93C5FD',
                        borderRadius: 4, padding: '2px 7px',
                      }}>{row.storeCod}</span>
                    </td>

                    {/* FECHA ARMADO */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                      {fmtDate(row.fechaArmado)}
                    </td>

                    {/* RESPONSABLE ARMADO */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap' }}>
                      {row.responsableArmado || '—'}
                    </td>

                    {/* MOV ODOO */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>
                        {row.pickingName}
                      </span>
                    </td>

                    {/* FECHA DECLARACIÓN */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
                      {fmtDate(row.fechaDeclaracion)}
                    </td>

                    {/* AUDITADO */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                      <span style={{
                        ...audC, borderRadius: 4, padding: '2px 10px',
                        fontSize: 11, fontWeight: 800, display: 'inline-block',
                      }}>{audInfo.auditado}</span>
                    </td>

                    {/* AUDITOR — pendiente de integración con auditoria */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>
                      —
                    </td>

                    {/* DETALLE — summary de la actividad (Faltante/Sobrante/Merma) */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                      {row.detalle ? (
                        <span style={{
                          ...detC, borderRadius: 4, padding: '2px 10px',
                          fontSize: 11, fontWeight: 800, display: 'inline-block', whiteSpace: 'nowrap',
                        }}>{row.detalle.toUpperCase()}</span>
                      ) : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>}
                    </td>

                    {/* SKU — editable */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 110 }}>
                      <EditableCell
                        value={manual.sku}
                        onSave={v => saveManual(row.pickingName, 'sku', v)}
                        placeholder="SKU"
                        monospace
                      />
                    </td>

                    {/* CORRECTA DECLARACIÓN — dropdown */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 130 }}>
                      <CorrDropdown
                        value={manual.correcta_declaracion}
                        onSave={v => saveManual(row.pickingName, 'correcta_declaracion', v)}
                      />
                    </td>

                    {/* MOV AJUSTE — pre-poblado desde body Odoo, editable */}
                    <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', minWidth: 130 }}>
                      <EditableCell
                        value={manual.movimiento_ajuste || row.movAjuste}
                        onSave={v => saveManual(row.pickingName, 'movimiento_ajuste', v)}
                        placeholder="99REC/INT/…"
                        monospace
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Nota sobre AUDITADO */}
      {rows.length > 0 && (
        <div style={{
          marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.25)',
          borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10,
        }}>
          💡 <strong style={{ color: 'rgba(255,255,255,0.4)' }}>AUDITADO:</strong> Se integrará con la tabla de auditoría cruzando el código de tienda y las referencias del campo <em>origin</em> del picking con las operaciones auditadas. Próxima iteración.
          {' '}· <strong style={{ color: 'rgba(255,255,255,0.4)' }}>SKU / CORRECTA DECLARACIÓN / MOV AJUSTE:</strong> Guardado automático en Supabase al editar.
        </div>
      )}
    </div>
  );
}
