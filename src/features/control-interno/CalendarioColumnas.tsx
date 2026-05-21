'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatCod } from '@/features/despacho/rutas/utils/helpers';
import { refreshCalendario } from '@/features/despacho/utils/useCalendario';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import type { TiendaInfo } from '@/features/despacho/rutas/data/tiendas';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const DNOM: Record<string, string> = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado' };
const DCOL: Record<string, string> = { LU: '#007AFF', MA: '#34C759', MI: '#FF9500', JU: '#AF52DE', VI: '#FF2D55', SA: '#5AC8FA' };

const GRUPOS: [string, string, string][] = [
  ['rm',    '📦 RM',       'Bodega Santiago (RM)'],
  ['costa', '🌊 Costa',    'Bodega Santiago (V Región)'],
  ['fal',   '🏢 Regiones', 'Bodega Regiones'],
];

const COSTA_CODES = new Set(['37VIN','08RNC','33CON','43CUR','54MPQ']);
const FAL_CODES   = new Set(['46TRE','28TEM','75PUC','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP','31TLC','36CHL','24SPP','38SP2','76PAN','51SER','27MCH']);

type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;
type StoreType = 'mall' | 'street' | 'costa' | 'region';

// Color palette por tipo de tienda
const TYPE_STYLE: Record<StoreType, { bg: string; text: string; border: string; label: string }> = {
  mall:   { bg: '#EDE9FE', text: '#5B21B6', border: '#C4B5FD', label: 'Mall'         },
  street: { bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD', label: 'Street Center' },
  costa:  { bg: '#CCFBF1', text: '#0F766E', border: '#5EEAD4', label: 'Costa'         },
  region: { bg: '#FFEDD5', text: '#C2410C', border: '#FDBA74', label: 'Región'        },
};

function storeGroup(cod: string): 'rm' | 'costa' | 'fal' {
  if (COSTA_CODES.has(cod)) return 'costa';
  if (FAL_CODES.has(cod))   return 'fal';
  return 'rm';
}

function getTipo(cod: string): StoreType {
  // Try with and without Ñ
  const inf: TiendaInfo | undefined = TIENDAS_INICIAL[cod]
    ?? TIENDAS_INICIAL[cod.replace('PEN', 'PEÑ')]
    ?? TIENDAS_INICIAL[cod.replace('VIN', 'VIÑ')];
  if (!inf) return 'street';
  if (inf.z === 'Región') return 'region';
  if (inf.z === 'Costa')  return 'costa';
  // RM: "Local" en dirección → Mall
  if (inf.d && /local/i.test(inf.d)) return 'mall';
  return 'street';
}

function getNombre(cod: string): string {
  return TIENDAS_INICIAL[cod]?.n
    ?? TIENDAS_INICIAL[cod.replace('PEN', 'PEÑ')]?.n
    ?? TIENDAS_INICIAL[cod.replace('VIN', 'VIÑ')]?.n
    ?? cod;
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
  const ddRef = useRef<{ dia: string | null; cod: string | null }>({ dia: null, cod: null });

  useEffect(() => {
    refreshCalendario()
      .then(c => { setCal(c); setLocal(JSON.parse(JSON.stringify(c))); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Sync local when cal changes after save
  useEffect(() => {
    if (cal) setLocal(JSON.parse(JSON.stringify(cal)));
  }, [cal]);

  const hasChanges = local && cal && JSON.stringify(local) !== JSON.stringify(cal);

  /* ── Search ── */
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

  /* ── Drag & drop between day columns ── */
  function onDragStart(e: React.DragEvent, dia: string, cod: string) {
    ddRef.current = { dia, cod };
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: React.DragEvent, targetDia: string) {
    e.preventDefault();
    const { dia: srcDia, cod } = ddRef.current;
    if (!cod || srcDia === targetDia) return;
    setLocal(prev => {
      if (!prev) return prev;
      const next: CalRecord = JSON.parse(JSON.stringify(prev));
      const src = next[srcDia!]?.[grp as 'rm' | 'costa' | 'fal'];
      const dst = next[targetDia]?.[grp as 'rm' | 'costa' | 'fal'];
      if (!src || !dst) return prev;
      const idx = src.indexOf(cod);
      if (idx >= 0) { src.splice(idx, 1); if (!dst.includes(cod)) dst.push(cod); }
      return next;
    });
  }

  /* ── Save ── */
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
      await refreshCalendario();
      setCal(local);
      setSaveStatus('success');
      setLastSaved(new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
      setTimeout(() => setSaveStatus('idle'), 3500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 4000);
    }
  }

  /* ── UI ── */
  const saveLabel = saveStatus === 'saving'  ? '⏳ Guardando...'
    : saveStatus === 'success' ? '✓ Guardado'
    : saveStatus === 'error'   ? '⚠ Error'
    : hasChanges               ? 'Guardar cambios'
    : 'Sin cambios';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-kred border-t-transparent rounded-full animate-spin" />
        <div className="text-[14px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Cargando calendario...</div>
      </div>
    );
  }

  if (!local) {
    return (
      <div className="text-center py-16">
        <div className="text-[13px]" style={{ color: '#F87171' }}>No se pudo cargar el calendario. Revisa la conexión con Sheets.</div>
      </div>
    );
  }

  const grpInfo = GRUPOS.find(g => g[0] === grp);

  return (
    <div>
      {/* ── Grupo + Guardar ── */}
      <div className="flex flex-wrap gap-2 items-center mb-2">
        {GRUPOS.map(([id, lb]) => (
          <button key={id}
            onClick={() => { setGrp(id); setSearch(''); setSuggest([]); setShowSug(false); }}
            style={{
              height: 36, padding: '0 16px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              border: grp === id ? '2px solid #D42B2B' : '2px solid rgba(255,255,255,0.15)',
              background: grp === id ? '#D42B2B' : 'rgba(255,255,255,0.07)',
              color: grp === id ? '#fff' : 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
            }}>
            {lb}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastSaved && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
              Guardado {lastSaved}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving' || !hasChanges}
            style={{
              height: 36, padding: '0 18px', borderRadius: 20, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: hasChanges ? 'pointer' : 'default',
              background: saveStatus === 'success' ? '#15803D'
                : saveStatus === 'error'   ? '#B91C1C'
                : hasChanges               ? '#D42B2B'
                : 'rgba(255,255,255,0.08)',
              color: hasChanges || saveStatus !== 'idle' ? '#fff' : 'rgba(255,255,255,0.35)',
              opacity: saveStatus === 'saving' || !hasChanges && saveStatus === 'idle' ? 0.7 : 1,
            }}>
            {saveLabel}
          </button>
        </div>
      </div>

      {grpInfo && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>{grpInfo[2]}</div>
      )}

      {/* ── Leyenda de colores ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {(Object.entries(TYPE_STYLE) as [StoreType, typeof TYPE_STYLE[StoreType]][]).map(([type, s]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, background: s.bg, border: `1px solid ${s.border}` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: s.text }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Buscador ── */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>🔍</span>
        <input
          type="text" value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={`Buscar tienda para agregar (${grpInfo?.[1] || ''})...`}
          style={{
            width: '100%', height: 42, paddingLeft: 38, paddingRight: 14,
            borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.07)', color: '#fff', fontSize: 13,
            outline: 'none', boxSizing: 'border-box',
          }}
        />
        {showSug && (
          <div style={{
            position: 'absolute', top: 46, left: 0, right: 0, background: '#1A2550',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 50,
            maxHeight: 240, overflowY: 'auto',
          }}>
            {suggest.map(c => {
              const tipo = getTipo(c);
              const ts = TYPE_STYLE[tipo];
              const yaEsta = DIAS.some(d => local[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(c));
              return (
                <div key={c} onClick={() => handleAgregar(c)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#F87171' }}>
                      {formatCod(c)}
                    </span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{getNombre(c)}</span>
                    <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: ts.bg, color: ts.text, border: `1px solid ${ts.border}`, fontWeight: 600 }}>
                      {ts.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {yaEsta && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>ya existe</span>}
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#D42B2B', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>+</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Tabla de columnas ── */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.10)' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
          <thead>
            <tr>
              {DIAS.map(dia => (
                <th key={dia} style={{
                  background: DCOL[dia], color: '#fff',
                  padding: '10px 12px', fontSize: 12, fontWeight: 800,
                  letterSpacing: '0.06em', textAlign: 'center',
                  borderRight: '1px solid rgba(255,255,255,0.15)',
                  minWidth: 100,
                }}>
                  {DNOM[dia].toUpperCase()}
                  <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, marginTop: 2 }}>
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
                    onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.background = 'rgba(212,43,43,0.08)'; }}
                    onDragLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    onDrop={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; onDrop(e, dia); }}
                    style={{
                      verticalAlign: 'top', padding: '8px 6px', minHeight: 120,
                      borderRight: '1px solid rgba(255,255,255,0.07)',
                      background: 'transparent', transition: 'background 0.15s',
                    }}
                  >
                    {tiendas.map(cod => {
                      const tipo = getTipo(cod);
                      const ts   = TYPE_STYLE[tipo];
                      const nombre = getNombre(cod);
                      return (
                        <div
                          key={cod} draggable
                          onDragStart={e => onDragStart(e, dia, cod)}
                          title={nombre}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: ts.bg, color: ts.text,
                            border: `1px solid ${ts.border}`,
                            borderRadius: 6, padding: '4px 8px', marginBottom: 5,
                            fontSize: 12, fontWeight: 700, fontFamily: 'monospace',
                            cursor: 'grab', userSelect: 'none',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                          }}
                        >
                          <span>{formatCod(cod)}</span>
                          <span
                            onClick={() => remove(dia, cod)}
                            style={{
                              marginLeft: 6, fontSize: 10, opacity: 0.5, cursor: 'pointer',
                              fontFamily: 'sans-serif', lineHeight: 1,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
                          >✕</span>
                        </div>
                      );
                    })}
                    {tiendas.length === 0 && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', fontStyle: 'italic', padding: '4px 2px', textAlign: 'center' }}>
                        —
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
          className="fixed inset-0 z-[9999] bg-black/[0.6] backdrop-blur-sm flex items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) { setPickerOpen(false); setPickerCod(''); } }}
        >
          <div className="bg-white rounded-[18px] p-[22px] w-[min(300px,88%)] shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            {(() => {
              const tipo = getTipo(pickerCod);
              const ts = TYPE_STYLE[tipo];
              return (
                <>
                  <div className="text-[13px] font-bold text-ktext mb-1">
                    Agregar{' '}
                    <span style={{ color: ts.text, background: ts.bg, padding: '1px 6px', borderRadius: 5, fontFamily: 'monospace' }}>
                      {formatCod(pickerCod)}
                    </span>
                    <span className="text-kmuted font-normal ml-1">— {getNombre(pickerCod)}</span>
                  </div>
                  <div className="text-[12px] text-kmuted mb-3.5">¿A qué día agregás esta tienda?</div>
                  <div className="grid grid-cols-3 gap-2 mb-3.5">
                    {DIAS.map(d => {
                      const yaEsta = local?.[d]?.[grp as 'rm' | 'costa' | 'fal']?.includes(pickerCod);
                      return (
                        <button key={d} onClick={() => handlePickerConfirm(pickerCod, d)}
                          className="h-[38px] rounded-[9px] text-[13px] font-semibold border-2 transition-all cursor-pointer"
                          style={{
                            borderColor: yaEsta ? '#C7C7CC' : DCOL[d],
                            color:       yaEsta ? '#8E8E93' : DCOL[d],
                            background:  yaEsta ? '#F2F2F7' : 'transparent',
                            opacity:     yaEsta ? 0.7 : 1,
                          }}>
                          {DNOM[d]}{yaEsta ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => { setPickerOpen(false); setPickerCod(''); }}
                    className="w-full h-[38px] rounded-[9px] bg-kbg text-kmuted text-[13px] font-semibold border-[1.5px] border-black/[0.09]">
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
