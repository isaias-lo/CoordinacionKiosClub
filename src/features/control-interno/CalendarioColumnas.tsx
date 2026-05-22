'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCod } from '@/features/despacho/rutas/utils/helpers';
import { refreshCalendario, writeCalendario } from '@/features/despacho/utils/useCalendario';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import type { TiendaInfo } from '@/features/despacho/rutas/data/tiendas';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const DNOM: Record<string, string> = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado' };
const DCOL: Record<string, string> = { LU: '#007AFF', MA: '#34C759', MI: '#FF9500', JU: '#AF52DE', VI: '#FF2D55', SA: '#00C7BE' };
const DLIGHT: Record<string, string> = { LU: '#EBF4FF', MA: '#EDFFF4', MI: '#FFF8ED', JU: '#F5EFFE', VI: '#FFEBEE', SA: '#E5FFFE' };

const GRUPOS: [string, string, string][] = [
  ['rm',    '📦 RM',        'Bodega Santiago — RM'],
  ['costa', '🌊 COSTA',     'Bodega Santiago — V Región'],
  ['fal',   '🏢 REGIONES',  'Bodega Regiones'],
];

const COSTA_CODES = new Set(['37VIN','08RNC','33CON','43CUR','54MPQ']);
const FAL_CODES   = new Set(['46TRE','28TEM','75PUC','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP','31TLC','36CHL','24SPP','38SP2','76PAN','51SER','27MCH']);

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
type StoreType = 'mall' | 'street' | 'costa' | 'region';

const TYPE_STYLE: Record<StoreType, { bg: string; text: string; border: string; label: string; shadow: string }> = {
  mall:   { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD', label: 'MALL',          shadow: 'rgba(91,33,182,0.16)'  },
  street: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', label: 'STREET CENTER', shadow: 'rgba(29,78,216,0.16)'  },
  costa:  { bg: '#CCFBF1', text: '#0F766E', border: '#5EEAD4', label: 'COSTA',         shadow: 'rgba(15,118,110,0.16)' },
  region: { bg: '#FFEDD5', text: '#C2410C', border: '#FDBA74', label: 'REGIÓN',        shadow: 'rgba(194,65,12,0.16)'  },
};

function storeGroup(cod: string): 'rm' | 'costa' | 'fal' {
  if (COSTA_CODES.has(cod)) return 'costa';
  if (FAL_CODES.has(cod))   return 'fal';
  return 'rm';
}

function getTipo(cod: string): StoreType {
  const inf: TiendaInfo | undefined = TIENDAS_INICIAL[cod]
    ?? TIENDAS_INICIAL[cod.replace('PEN', 'PEÑ')]
    ?? TIENDAS_INICIAL[cod.replace('VIN', 'VIÑ')];
  if (!inf) return 'street';
  if (inf.z === 'Región') return 'region';
  if (inf.z === 'Costa')  return 'costa';
  if (inf.d && /local/i.test(inf.d)) return 'mall';
  return 'street';
}

function getNombre(cod: string): string {
  return TIENDAS_INICIAL[cod]?.n
    ?? TIENDAS_INICIAL[cod.replace('PEN', 'PEÑ')]?.n
    ?? TIENDAS_INICIAL[cod.replace('VIN', 'VIÑ')]?.n
    ?? cod;
}

function displayCode(cod: string): string {
  return formatCod(cod.replace('PEN', 'PEÑ').replace('VIN', 'VIÑ'));
}

export default function CalendarioColumnas() {
  const [cal, setCal]               = useState<CalRecord | null>(null);
  const [local, setLocal]           = useState<CalRecord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [lastSaved, setLastSaved]   = useState<string | null>(null);
  const [grp, setGrp]               = useState('rm');
  const [search, setSearch]         = useState('');
  const [suggest, setSuggest]       = useState<string[]>([]);
  const [showSug, setShowSug]       = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCod, setPickerCod]   = useState('');
  const [dragOver, setDragOver]     = useState<{ dia: string; idx: number } | null>(null);

  const ddRef = useRef<{ dia: string | null; cod: string | null; idx: number }>({ dia: null, cod: null, idx: -1 });

  useEffect(() => {
    refreshCalendario()
      .then(c => { setCal(c); setLocal(JSON.parse(JSON.stringify(c))); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (cal) setLocal(JSON.parse(JSON.stringify(cal)));
  }, [cal]);

  const hasChanges = local && cal && JSON.stringify(local) !== JSON.stringify(cal);

  function handleSearch(q: string) {
    setSearch(q);
    const qup = q.trim().toUpperCase();
    if (!qup) { setSuggest([]); setShowSug(false); return; }
    const res = Object.keys(TIENDAS_INICIAL).filter(c => {
      if (storeGroup(c) !== grp) return false;
      const nombre = (TIENDAS_INICIAL[c].n || '').toUpperCase();
      return c.indexOf(qup) >= 0 || nombre.indexOf(qup) >= 0;
    }).slice(0, 8);
    setSuggest(res);
    setShowSug(res.length > 0);
  }

  function handleAgregar(cod: string) {
    setSearch(''); setSuggest([]); setShowSug(false);
    setPickerCod(cod); setPickerOpen(true);
  }

  function handlePickerConfirm(cod: string, dia: string) {
    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      if (!next[dia]) next[dia] = { rm: [], costa: [], fal: [] };
      const g = grp as 'rm' | 'costa' | 'fal';
      if (!next[dia][g]) next[dia][g] = [];
      if (!next[dia][g].includes(cod)) next[dia][g].push(cod);
      return next;
    });
    setPickerOpen(false); setPickerCod('');
  }

  function remove(dia: string, cod: string) {
    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const a = next[dia]?.[grp as 'rm' | 'costa' | 'fal'];
      if (a) { const i = a.indexOf(cod); if (i >= 0) a.splice(i, 1); }
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, dia: string, cod: string, idx: number) {
    ddRef.current = { dia, cod, idx };
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd() {
    setDragOver(null);
    ddRef.current = { dia: null, cod: null, idx: -1 };
  }

  // Drop on a specific chip → insert before that chip's position
  function onDropOnChip(e: React.DragEvent, targetDia: string, targetIdx: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || !srcDia) return;

    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const g = grp as 'rm' | 'costa' | 'fal';
      if (!next[srcDia!]) next[srcDia!] = { rm: [], costa: [], fal: [] };
      if (!next[targetDia]) next[targetDia] = { rm: [], costa: [], fal: [] };
      if (!next[srcDia!][g]) next[srcDia!][g] = [];
      if (!next[targetDia][g]) next[targetDia][g] = [];

      if (srcDia === targetDia) {
        // Reorder within same column
        const arr = next[srcDia!][g];
        const from = arr.indexOf(cod);
        if (from < 0) return prev;
        arr.splice(from, 1);
        const to = targetIdx > from ? targetIdx - 1 : targetIdx;
        arr.splice(Math.max(0, to), 0, cod);
      } else {
        // Move cross-column at specific index
        const src = next[srcDia!][g];
        const dst = next[targetDia][g];
        const from = src.indexOf(cod);
        if (from >= 0) src.splice(from, 1);
        if (!dst.includes(cod)) dst.splice(targetIdx, 0, cod);
      }
      return next;
    });
  }

  // Drop on td background → append to end (cross-column only)
  function onDropOnTd(e: React.DragEvent, targetDia: string) {
    e.preventDefault();
    setDragOver(null);
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || !srcDia || srcDia === targetDia) return;
    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const g = grp as 'rm' | 'costa' | 'fal';
      const src = next[srcDia!]?.[g] || [];
      const dst = next[targetDia]?.[g] || [];
      const idx = src.indexOf(cod);
      if (idx >= 0) { src.splice(idx, 1); if (!dst.includes(cod)) dst.push(cod); }
      if (next[srcDia!]) next[srcDia!][g] = src;
      if (next[targetDia]) next[targetDia][g] = dst;
      return next;
    });
  }

  async function handleSave() {
    if (!local) return;
    setSaveStatus('saving');
    try {
      const res = await fetch('/api/calendario-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendario: local }),
      });
      if (!res.ok) throw new Error('Error al guardar');
      writeCalendario(local); // updates in-memory + localStorage → fires storage event on other tabs
      setCal(local);
      setSaveStatus('success');
      setLastSaved(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSaveStatus('idle'), 3500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }

  const saveLabel = saveStatus === 'saving'  ? '⏳ Guardando...'
    : saveStatus === 'success' ? '✅ Guardado'
    : saveStatus === 'error'   ? '⚠️ Error'
    : hasChanges               ? '💾 Guardar cambios'
    : 'Sin cambios';

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div style={{
        background: '#FFFFFF', borderRadius: 20, padding: '60px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{
          width: 38, height: 38, border: '3px solid #E5E5EA',
          borderTopColor: '#007AFF', borderRadius: '50%',
          animation: 'spin 0.75s linear infinite',
        }} />
        <div style={{ fontSize: 14, color: '#8E8E93', fontWeight: 500 }}>Cargando calendario...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!local) {
    return (
      <div style={{
        background: '#FFFFFF', borderRadius: 20, padding: '40px 20px',
        textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#FF3B30' }}>No se pudo cargar el calendario</div>
        <div style={{ fontSize: 13, color: '#8E8E93', marginTop: 4 }}>Revisa la conexión con Google Sheets</div>
      </div>
    );
  }

  const grpInfo = GRUPOS.find(g => g[0] === grp);

  return (
    <div style={{ background: '#F2F2F7', borderRadius: 20, padding: '20px 16px 24px' }}>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {GRUPOS.map(([id, lb]) => {
          const active = grp === id;
          const parts = lb.split(' ');
          const icon = parts[0];
          const label = parts.slice(1).join(' ');
          return (
            <button key={id}
              onClick={() => { setGrp(id); setSearch(''); setSuggest([]); setShowSug(false); }}
              style={{
                height: 42, padding: '0 18px', borderRadius: 100,
                fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                background: active
                  ? 'linear-gradient(175deg, #E53535 0%, #C12828 100%)'
                  : '#FFFFFF',
                color: active ? '#FFFFFF' : '#1C1C1E',
                boxShadow: active
                  ? '0 4px 18px rgba(193,40,40,0.38), 0 1px 0 rgba(255,255,255,0.2) inset'
                  : '0 2px 8px rgba(0,0,0,0.09), 0 1px 2px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
                transition: 'all 0.17s cubic-bezier(0.34,1.56,0.64,1)',
              }}>
              <span style={{ fontSize: 17, lineHeight: 1 }}>{icon}</span>
              {label}
            </button>
          );
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastSaved && (
            <span style={{ fontSize: 11, color: '#8E8E93', fontFamily: 'monospace' }}>
              Guardado {lastSaved}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || !hasChanges}
            style={{
              height: 42, padding: '0 20px', borderRadius: 100,
              fontSize: 14, fontWeight: 700, border: 'none',
              cursor: hasChanges && saveStatus !== 'saving' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', gap: 6,
              background: saveStatus === 'success'
                ? 'linear-gradient(175deg, #30D158 0%, #25A244 100%)'
                : saveStatus === 'error'
                ? 'linear-gradient(175deg, #FF453A 0%, #CC2D22 100%)'
                : hasChanges
                ? 'linear-gradient(175deg, #0A84FF 0%, #0062CC 100%)'
                : '#E5E5EA',
              color: hasChanges || saveStatus !== 'idle' ? '#fff' : '#8E8E93',
              boxShadow: hasChanges
                ? '0 4px 18px rgba(0,98,204,0.36), inset 0 1px 0 rgba(255,255,255,0.2)'
                : 'none',
              opacity: saveStatus === 'saving' ? 0.7 : 1,
              transition: 'all 0.17s ease',
            }}>
            {saveLabel}
          </button>
        </div>
      </div>

      {grpInfo && (
        <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 10, paddingLeft: 2 }}>
          {grpInfo[2]}
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {(Object.entries(TYPE_STYLE) as [StoreType, typeof TYPE_STYLE[StoreType]][]).map(([type, s]) => (
          <div key={type} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 13px', borderRadius: 100,
            background: s.bg, border: `1.5px solid ${s.border}`,
            boxShadow: `0 2px 6px ${s.shadow}, inset 0 1px 0 rgba(255,255,255,0.6)`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: s.text }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{
          position: 'absolute', left: 14, top: '50%',
          transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none',
        }}>🔍</span>
        <input
          type="text" value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={`Buscar tienda para agregar — ${grpInfo?.[1].replace(/\p{Emoji}/u, '').trim() || ''}...`}
          style={{
            width: '100%', height: 46, paddingLeft: 42, paddingRight: 16,
            borderRadius: 14, border: '1.5px solid rgba(0,0,0,0.09)',
            background: '#FFFFFF', color: '#1C1C1E', fontSize: 14,
            outline: 'none', boxSizing: 'border-box',
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
          }}
        />
        {showSug && (
          <div style={{
            position: 'absolute', top: 50, left: 0, right: 0,
            background: '#FFFFFF', border: '1.5px solid rgba(0,0,0,0.08)',
            borderRadius: 16, boxShadow: '0 12px 36px rgba(0,0,0,0.14)',
            zIndex: 50, maxHeight: 260, overflowY: 'auto',
          }}>
            {suggest.map(c => {
              const tipo = getTipo(c);
              const ts = TYPE_STYLE[tipo];
              const yaEsta = DIAS.some(d => local[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(c));
              return (
                <div key={c} onClick={() => handleAgregar(c)}
                  style={{
                    padding: '11px 16px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(0,0,0,0.05)', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F2F2F7')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: 'monospace', fontSize: 15, fontWeight: 800,
                      color: ts.text, background: ts.bg,
                      padding: '3px 9px', borderRadius: 9,
                      border: `1.5px solid ${ts.border}`,
                      boxShadow: `0 2px 6px ${ts.shadow}`,
                    }}>
                      {displayCode(c)}
                    </span>
                    <span style={{ fontSize: 13, color: '#3C3C43' }}>{getNombre(c)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {yaEsta && <span style={{ fontSize: 11, color: '#8E8E93', fontStyle: 'italic' }}>ya existe</span>}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: 'linear-gradient(175deg, #E53535 0%, #C12828 100%)',
                      color: '#fff', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 18, fontWeight: 700,
                      boxShadow: '0 3px 10px rgba(193,40,40,0.38)',
                    }}>+</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Column table ── */}
      <div style={{
        overflowX: 'auto', borderRadius: 18,
        background: '#FFFFFF',
        boxShadow: '0 2px 16px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
          <thead>
            <tr>
              {DIAS.map(dia => (
                <th key={dia} style={{
                  background: DLIGHT[dia],
                  padding: '13px 10px 10px',
                  borderBottom: `3px solid ${DCOL[dia]}`,
                  borderRight: '1px solid rgba(0,0,0,0.05)',
                  minWidth: 118, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: DCOL[dia], letterSpacing: '0.05em' }}>
                    {DNOM[dia].toUpperCase()}
                  </div>
                  <div style={{ fontSize: 13, color: DCOL[dia], opacity: 0.80, marginTop: 4, fontWeight: 700 }}>
                    {(local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || []).length} tiendas
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {DIAS.map(dia => {
                const tiendas = local[dia]?.[grp as 'rm' | 'costa' | 'fal'] || [];
                return (
                  <td key={dia}
                    onDragEnter={e => {
                      e.preventDefault();
                      setDragOver({ dia, idx: tiendas.length });
                    }}
                    onDragOver={e => e.preventDefault()}
                    onDragLeave={e => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOver(null);
                      }
                    }}
                    onDrop={e => onDropOnTd(e, dia)}
                    style={{
                      verticalAlign: 'top',
                      padding: '8px 6px 10px',
                      borderRight: '1px solid rgba(0,0,0,0.05)',
                      background: '#FFFFFF',
                      minWidth: 118,
                    }}
                  >
                    {tiendas.map((cod, i) => {
                      const tipo = getTipo(cod);
                      const ts   = TYPE_STYLE[tipo];
                      const nombre = getNombre(cod);
                      const showLineBefore = dragOver?.dia === dia && dragOver?.idx === i;
                      return (
                        <div key={cod}>
                          {showLineBefore && (
                            <div style={{
                              height: 3, borderRadius: 2,
                              background: '#007AFF',
                              margin: '2px 2px 4px',
                              boxShadow: '0 0 8px rgba(0,122,255,0.55)',
                            }} />
                          )}
                          <div
                            draggable
                            onDragStart={e => onDragStart(e, dia, cod, i)}
                            onDragEnd={onDragEnd}
                            onDragEnter={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDragOver({ dia, idx: i });
                            }}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => onDropOnChip(e, dia, i)}
                            title={nombre}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              background: ts.bg, color: ts.text,
                              border: `1.5px solid ${ts.border}`,
                              borderRadius: 12, padding: '8px 11px', marginBottom: 6,
                              fontSize: 15, fontWeight: 800, fontFamily: 'monospace',
                              cursor: 'grab', userSelect: 'none',
                              boxShadow: `0 2px 8px ${ts.shadow}, inset 0 1px 0 rgba(255,255,255,0.55)`,
                              transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                            }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
                              (e.currentTarget as HTMLElement).style.boxShadow = `0 5px 14px ${ts.shadow}, inset 0 1px 0 rgba(255,255,255,0.55)`;
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                              (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px ${ts.shadow}, inset 0 1px 0 rgba(255,255,255,0.55)`;
                            }}
                          >
                            <span style={{ letterSpacing: '0.01em' }}>{displayCode(cod)}</span>
                            <span
                              onClick={e => { e.stopPropagation(); remove(dia, cod); }}
                              style={{
                                marginLeft: 8, fontSize: 11, opacity: 0.4,
                                cursor: 'pointer', lineHeight: 1,
                                fontFamily: 'sans-serif', transition: 'opacity 0.15s',
                                padding: '1px 3px', borderRadius: 4,
                              }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
                            >✕</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Insert indicator after last chip */}
                    {dragOver?.dia === dia && dragOver?.idx === tiendas.length && (
                      <div style={{
                        height: 3, borderRadius: 2,
                        background: '#007AFF',
                        margin: '2px 2px 4px',
                        boxShadow: '0 0 8px rgba(0,122,255,0.55)',
                      }} />
                    )}

                    {tiendas.length === 0 && (
                      <div style={{
                        fontSize: 12, color: 'rgba(0,0,0,0.18)', fontStyle: 'italic',
                        textAlign: 'center', padding: '18px 6px',
                        border: '2px dashed rgba(0,0,0,0.08)', borderRadius: 12, marginTop: 2,
                      }}>
                        Sin tiendas
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Day picker modal ── */}
      {pickerOpen && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setPickerOpen(false); setPickerCod(''); } }}
        >
          <div style={{
            background: '#FFFFFF', borderRadius: 26,
            padding: '26px 22px 22px', width: 'min(320px, 88vw)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.08)',
          }}>
            {(() => {
              const tipo = getTipo(pickerCod);
              const ts = TYPE_STYLE[tipo];
              return (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1C1C1E', marginBottom: 3 }}>
                    Agregar{' '}
                    <span style={{
                      color: ts.text, background: ts.bg,
                      padding: '3px 9px', borderRadius: 9,
                      fontFamily: 'monospace', fontWeight: 800,
                      border: `1.5px solid ${ts.border}`,
                      boxShadow: `0 2px 6px ${ts.shadow}`,
                    }}>
                      {displayCode(pickerCod)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#8E8E93', marginBottom: 3, fontWeight: 500 }}>
                    {getNombre(pickerCod)}
                  </div>
                  <div style={{ fontSize: 12, color: '#C7C7CC', marginBottom: 18 }}>
                    ¿A qué día agregás esta tienda?
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                    {DIAS.map(d => {
                      const yaEsta = local?.[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(pickerCod);
                      return (
                        <button key={d} onClick={() => handlePickerConfirm(pickerCod, d)}
                          style={{
                            height: 44, borderRadius: 13, fontSize: 13, fontWeight: 600,
                            border: `2px solid ${yaEsta ? '#E5E5EA' : DCOL[d]}`,
                            color: yaEsta ? '#C7C7CC' : DCOL[d],
                            background: yaEsta ? '#F9F9F9' : DLIGHT[d],
                            cursor: 'pointer',
                            boxShadow: yaEsta ? 'none' : `0 2px 8px rgba(0,0,0,0.07)`,
                            transition: 'all 0.14s ease',
                          }}>
                          {DNOM[d]}{yaEsta ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => { setPickerOpen(false); setPickerCod(''); }}
                    style={{
                      width: '100%', height: 44, borderRadius: 13,
                      fontSize: 14, fontWeight: 600,
                      background: '#F2F2F7', color: '#8E8E93',
                      border: '1.5px solid rgba(0,0,0,0.07)',
                      cursor: 'pointer',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
                    }}>
                    Cancelar
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
