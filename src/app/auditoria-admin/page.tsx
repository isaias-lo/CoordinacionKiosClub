'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../components/AuthProvider';
import { getPickerDisplay } from '../../features/auditoria/data/pickerNames';
import type { AuditEntry, CorreccionAuditoria } from '../../features/auditoria/types';
import type { ProductoError, OperacionEntry, TipoError, TipoAuditoria } from '../../features/auditoria/types';

function rowToEntry(r: Record<string, unknown>): AuditEntry {
  return {
    id: r.id as string, fecha: r.fecha as string, hora: r.hora as string,
    auditor: r.auditor as string, picker: r.picker as string,
    tiendaCod: r.tienda_cod as string, tiendaNombre: r.tienda_nombre as string,
    tiendaArea: r.tienda_area as AuditEntry['tiendaArea'],
    tipo: r.tipo as TipoAuditoria, operaciones: (r.operaciones as OperacionEntry[]) ?? [],
    pallets: r.pallets as number, tieneErrores: r.tiene_errores as boolean,
    tiposError: (r.tipos_error as TipoError[]) ?? [],
    correccion: r.correccion as CorreccionAuditoria, resultado: r.resultado as AuditEntry['resultado'],
    observaciones: r.observaciones as string,
    reauditoriaDeId: r.reauditoria_de_id as string | undefined,
    productos: (r.productos as ProductoError[]) ?? [],
    fotoUrl: (r.foto_url as string) || undefined,
    palletFotos: (r.pallet_fotos as AuditEntry['palletFotos']) || undefined,
  };
}

const CORR_LABEL: Record<CorreccionAuditoria, string> = {
  correcto: 'Correcto', cruce: 'Cruce', faltante: 'Faltante', sobrante: 'Sobrante',
};

/* ── Entry card ── */
function EntryCard({ entry, onPhotoClick }: { entry: AuditEntry; onPhotoClick: (url: string) => void }) {
  const corrColor = {
    correcto: '#16A34A', cruce: '#2563EB', faltante: '#D32F2F', sobrante: '#D97706',
  }[entry.correccion];

  return (
    <div className="bg-white border border-border rounded-card p-3.5 mb-2.5" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.05)' }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-barlow-condensed text-[15px] font-bold text-navy">{entry.tiendaNombre}</span>
            <span className="font-mono text-[10px] text-text-3 bg-bg-2 border border-border px-1.5 py-0.5 rounded">{entry.tiendaCod}</span>
            {entry.reauditoriaDeId && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info border border-info/20">↩ Re</span>
            )}
          </div>
          <div className="text-[11px] text-text-3 mt-0.5">
            {entry.fecha} · {entry.hora} · <strong className="text-text">{entry.auditor}</strong>
            {entry.picker ? ` · ${getPickerDisplay(entry.picker)}` : ''}
          </div>
        </div>
        <span className={`font-barlow-condensed text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${entry.resultado === 'bueno' ? 'bg-[rgba(22,163,74,0.10)] border-success text-success' : 'bg-[rgba(211,47,47,0.10)] border-red text-red'}`}>
          {entry.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}
        </span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] mb-2">
        <div><span className="text-text-3">Tipo:</span> <strong className="capitalize">{entry.tipo}</strong></div>
        <div><span className="text-text-3">Pallets:</span> <strong>{entry.pallets}</strong></div>
        <div>
          <span className="text-text-3">Corrección:</span>{' '}
          <strong style={{ color: corrColor }}>{CORR_LABEL[entry.correccion]}</strong>
        </div>
        <div><span className="text-text-3">Errores:</span> <strong className={entry.tieneErrores ? 'text-red' : 'text-success'}>{entry.tieneErrores ? 'Sí' : 'No'}</strong></div>
      </div>

      {/* Products */}
      {entry.productos?.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {entry.productos.map((p, i) => (
            <span key={i} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.tipo === 'faltante' ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>
              {p.tipo} [{p.codigo}] {p.unidades}u
            </span>
          ))}
        </div>
      )}

      {/* Observations */}
      {entry.observaciones && (
        <div className="px-2.5 py-1.5 bg-bg rounded-btn text-[11px] text-text-2 italic border-l-2 border-navy/20 mb-2">
          {entry.observaciones}
        </div>
      )}

      {/* Pallet photos */}
      {entry.palletFotos && entry.palletFotos.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-1">
          {entry.palletFotos.map((pf, idx) => (
            <button key={idx} onClick={() => onPhotoClick(pf.url)}
              className="block w-full rounded-card overflow-hidden border border-border cursor-pointer"
              style={{ padding: 0, background: 'none' }}>
              <img src={pf.url} alt={pf.label} className="w-full object-cover" style={{ maxHeight: 160 }} />
              <div className="px-2 py-1 bg-bg text-[10px] text-text-3 flex items-center gap-1 text-left">
                📷 {pf.label} · toca para ampliar
              </div>
            </button>
          ))}
        </div>
      )}
      {/* Error photo (legacy) */}
      {entry.fotoUrl && (
        <button
          onClick={() => onPhotoClick(entry.fotoUrl!)}
          className="block w-full rounded-card overflow-hidden border border-border cursor-pointer mt-1"
          style={{ padding: 0, background: 'none' }}
        >
          <img src={entry.fotoUrl} alt="foto del error" className="w-full object-cover" style={{ maxHeight: 180 }} />
          <div className="px-2 py-1 bg-bg text-[10px] text-text-3 flex items-center gap-1 text-left">
            📷 Foto de error · toca para ampliar
          </div>
        </button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════ */
export default function AuditoriaAdminPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [entries,      setEntries]      = useState<AuditEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fechaFilter,  setFechaFilter]  = useState('');
  const [tiendaFilter, setTiendaFilter] = useState('');
  const [auditorFilter,setAuditorFilter]= useState('');
  const [lightbox,     setLightbox]     = useState<string | null>(null);
  const [tab,          setTab]          = useState<'lista' | 'fotos' | 'stats'>('lista');

  useEffect(() => {
    supabase
      .from('audit_entries')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (data) setEntries(data.map(r => rowToEntry(r as Record<string, unknown>)));
        setLoading(false);
      });
  }, []);

  const fechas = useMemo(() =>
    Array.from(new Set(entries.map(e => e.fecha))).sort((a, b) => b.localeCompare(a)),
    [entries]);

  const auditores = useMemo(() =>
    Array.from(new Set(entries.map(e => e.auditor))).sort(),
    [entries]);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (fechaFilter && e.fecha !== fechaFilter) return false;
      if (tiendaFilter && !e.tiendaNombre.toLowerCase().includes(tiendaFilter.toLowerCase()) && !e.tiendaCod.toLowerCase().includes(tiendaFilter.toLowerCase())) return false;
      if (auditorFilter && e.auditor !== auditorFilter) return false;
      return true;
    });
  }, [entries, fechaFilter, tiendaFilter, auditorFilter]);

  const auditorStats = useMemo(() => {
    const map = new Map<string, { total: number; bueno: number; malo: number }>();
    for (const e of filtered) {
      if (!map.has(e.auditor)) map.set(e.auditor, { total: 0, bueno: 0, malo: 0 });
      const s = map.get(e.auditor)!;
      s.total++;
      if (e.resultado === 'bueno') s.bueno++; else s.malo++;
    }
    return Array.from(map.entries())
      .map(([auditor, s]) => ({ auditor, ...s }))
      .sort((a, b) => b.total - a.total);
  }, [filtered]);

  const withPhotos = useMemo(() => filtered.filter(e => e.fotoUrl || (e.palletFotos && e.palletFotos.length > 0)), [filtered]);

  const today = new Date().toLocaleDateString('es-CL');

  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #1a2550 0%, #5b21b6 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
        <button onClick={() => router.push('/')}
          className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full">
          ← Inicio
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase">Admin Auditoría</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            {profile?.full_name ?? 'Admin'} · {filtered.length} registros
          </div>
        </div>
        {withPhotos.length > 0 && (
          <span className="bg-white/15 text-white text-[12px] font-bold px-2.5 py-1 rounded-full">
            📷 {withPhotos.length}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex-shrink-0 bg-white border-b border-border px-4 py-3 space-y-2">
        {/* Date chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setFechaFilter('')}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-bold border cursor-pointer ${!fechaFilter ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'}`}>
            Todas
          </button>
          {fechas.map(f => (
            <button key={f}
              onClick={() => setFechaFilter(f === fechaFilter ? '' : f)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[12px] font-bold border cursor-pointer ${fechaFilter === f ? 'bg-navy text-white border-navy' : 'bg-white text-text-2 border-border'}`}>
              {f === today ? 'Hoy' : f}
            </button>
          ))}
        </div>

        {/* Tienda + Auditor filters */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Buscar tienda…"
            value={tiendaFilter}
            onChange={e => setTiendaFilter(e.target.value)}
            className="flex-1 bg-bg border border-border rounded-btn px-3 py-2 text-[13px] text-text outline-none focus:border-navy"
          />
          <select
            value={auditorFilter}
            onChange={e => setAuditorFilter(e.target.value)}
            className="flex-1 bg-bg border border-border rounded-btn px-3 py-2 text-[13px] text-text outline-none focus:border-navy cursor-pointer">
            <option value="">Todos los auditores</option>
            {auditores.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-white flex-shrink-0">
        {([
          ['lista',  '📋 Lista',  filtered.length],
          ['fotos',  '📷 Fotos',  withPhotos.length],
          ['stats',  '📊 Stats',  auditorStats.length],
        ] as const).map(([key, label, count]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 py-2.5 text-[13px] font-bold font-barlow-condensed border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${tab === key ? 'border-navy text-navy' : 'border-transparent text-text-3'}`}>
            {label}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-navy text-white' : 'bg-bg-2 text-text-3'}`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="text-center py-16 text-text-3 text-[14px]">Cargando registros…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-text-3">
            <div className="text-[40px] mb-3">🔍</div>
            <div className="font-barlow-condensed text-[16px]">Sin registros para los filtros seleccionados.</div>
          </div>
        )}

        {/* Lista */}
        {!loading && tab === 'lista' && filtered.map(e => (
          <EntryCard key={e.id} entry={e} onPhotoClick={setLightbox} />
        ))}

        {/* Fotos */}
        {!loading && tab === 'fotos' && (
          withPhotos.length === 0
            ? (
              <div className="text-center py-16 text-text-3">
                <div className="text-[40px] mb-3">📷</div>
                <div className="font-barlow-condensed text-[16px]">Sin fotos en los registros seleccionados.</div>
                <div className="text-[12px] mt-2">Las fotos se adjuntan al registrar una auditoría con error.</div>
              </div>
            )
            : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {withPhotos.flatMap(e => {
                  const cards = [];
                  if (e.palletFotos && e.palletFotos.length > 0) {
                    e.palletFotos.forEach((pf, idx) => {
                      cards.push(
                        <button key={`${e.id}_pallet${idx}`} onClick={() => setLightbox(pf.url)}
                          className="relative rounded-card overflow-hidden border border-border cursor-pointer group"
                          style={{ padding: 0, background: 'none', aspectRatio: '1' }}>
                          <img src={pf.url} alt={pf.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                            <div className="text-white/80 text-[9px] font-bold uppercase tracking-wide">{pf.label}</div>
                            <div className="text-white text-[10px] font-bold truncate">{e.tiendaNombre}</div>
                            <div className="text-white/60 text-[9px]">{e.fecha} · {e.auditor}</div>
                          </div>
                        </button>
                      );
                    });
                  }
                  if (e.fotoUrl) {
                    cards.push(
                      <button key={`${e.id}_error`} onClick={() => setLightbox(e.fotoUrl!)}
                        className="relative rounded-card overflow-hidden border border-border cursor-pointer group"
                        style={{ padding: 0, background: 'none', aspectRatio: '1' }}>
                        <img src={e.fotoUrl} alt="foto del error" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                          <div className="text-white/80 text-[9px] font-bold uppercase tracking-wide">Foto de error</div>
                          <div className="text-white text-[10px] font-bold truncate">{e.tiendaNombre}</div>
                          <div className="text-white/60 text-[9px]">{e.fecha} · {e.auditor}</div>
                          <div className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${e.resultado === 'bueno' ? 'bg-success text-white' : 'bg-red text-white'}`}>
                            {e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}
                          </div>
                        </div>
                      </button>
                    );
                  }
                  return cards;
                })}
              </div>
            )
        )}

        {/* Stats */}
        {!loading && tab === 'stats' && (
          auditorStats.length === 0
            ? (
              <div className="text-center py-16 text-text-3">
                <div className="text-[40px] mb-3">📊</div>
                <div className="font-barlow-condensed text-[16px]">Sin datos para los filtros seleccionados.</div>
              </div>
            )
            : (
              <div className="space-y-3">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { v: filtered.length, l: 'Auditorías', c: '#1a2550' },
                    { v: filtered.filter(e => e.resultado === 'bueno').length, l: 'Buenas', c: '#16A34A' },
                    { v: filtered.filter(e => e.resultado === 'malo').length, l: 'Malas', c: '#D32F2F' },
                  ].map(({ v, l, c }) => (
                    <div key={l} className="bg-white border border-border rounded-card p-3 text-center" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                      <div className="font-barlow-condensed text-[26px] font-bold" style={{ color: c }}>{v}</div>
                      <div className="text-[10px] text-text-3 uppercase tracking-wide">{l}</div>
                    </div>
                  ))}
                </div>

                {/* Per-auditor table */}
                <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                  <div className="px-4 py-2.5 border-b border-border bg-bg">
                    <span className="font-barlow-condensed text-[12px] font-bold uppercase tracking-wider text-text-3">Rendimiento por auditor</span>
                  </div>
                  {auditorStats.map(({ auditor, total, bueno, malo }) => {
                    const pct = total > 0 ? Math.round((bueno / total) * 100) : 0;
                    const color = pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F';
                    const withFoto = filtered.filter(e => e.auditor === auditor && (e.fotoUrl || (e.palletFotos && e.palletFotos.length > 0))).length;
                    return (
                      <div key={auditor} className="px-4 py-3 border-b border-border last:border-b-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <div>
                            <span className="font-barlow-condensed text-[15px] font-bold text-navy">{auditor}</span>
                            {withFoto > 0 && <span className="ml-2 text-[10px] text-text-3">📷 {withFoto} fotos</span>}
                          </div>
                          <div className="flex items-center gap-3 text-[13px]">
                            <span className="text-success font-bold">{bueno} ✓</span>
                            <span className="text-red font-bold">{malo} ✗</span>
                            <span className="font-bold" style={{ color }}>{pct}%</span>
                          </div>
                        </div>
                        <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
                        </div>
                        <div className="text-[10px] text-text-3 mt-1">{total} auditoría{total !== 1 ? 's' : ''} en el período</div>
                      </div>
                    );
                  })}
                </div>

                {/* Tienda breakdown */}
                {(() => {
                  const tiendaMap = new Map<string, { total: number; bueno: number; cod: string }>();
                  for (const e of filtered) {
                    if (!tiendaMap.has(e.tiendaNombre)) tiendaMap.set(e.tiendaNombre, { total: 0, bueno: 0, cod: e.tiendaCod });
                    const s = tiendaMap.get(e.tiendaNombre)!;
                    s.total++;
                    if (e.resultado === 'bueno') s.bueno++;
                  }
                  const sorted = Array.from(tiendaMap.entries())
                    .map(([nombre, s]) => ({ nombre, ...s, pct: Math.round((s.bueno / s.total) * 100) }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 15);
                  if (!sorted.length) return null;
                  return (
                    <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                      <div className="px-4 py-2.5 border-b border-border bg-bg">
                        <span className="font-barlow-condensed text-[12px] font-bold uppercase tracking-wider text-text-3">Tiendas más auditadas</span>
                      </div>
                      {sorted.map(({ nombre, cod, total, bueno, pct }) => {
                        const c = pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F';
                        return (
                          <div key={cod} className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-[13px] text-text truncate">{nombre}</div>
                              <div className="font-mono text-[10px] text-text-3">{cod}</div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="font-bold text-[13px]" style={{ color: c }}>{pct}%</div>
                              <div className="text-[10px] text-text-3">{bueno}/{total}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)' }}
          onClick={() => setLightbox(null)}>
          <img
            src={lightbox}
            alt="foto ampliada"
            className="max-w-full max-h-full object-contain"
            style={{ maxWidth: '96vw', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white border-none bg-white/15 rounded-full w-10 h-10 text-[22px] cursor-pointer flex items-center justify-center font-bold">
            ×
          </button>
          <a
            href={lightbox}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-[13px] font-bold bg-white/15 px-4 py-2 rounded-full"
            onClick={e => e.stopPropagation()}>
            ↗ Abrir original
          </a>
        </div>
      )}
    </div>
  );
}
