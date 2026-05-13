'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../components/AuthProvider';
import { getPickerDisplay } from '../../features/auditoria/data/pickerNames';
import { rowToEntry } from '../../features/auditoria/utils/converters';
import type { AuditEntry, CorreccionAuditoria } from '../../features/auditoria/types';

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

      {/* Picker nombre */}
      {entry.pickerNombre && (
        <div className="mb-2 text-[11px] text-text-2">
          <span className="text-text-3">Picker: </span><strong>{entry.pickerNombre}</strong>
        </div>
      )}

      {/* Pallet photos */}
      {entry.palletFotos && entry.palletFotos.length > 0 && (
        <div className="mt-1 mb-2">
          <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1.5">Fotos de pallets</div>
          <div className="grid grid-cols-2 gap-1.5">
            {entry.palletFotos.map((pf, idx) => (
              <button key={idx} onClick={() => onPhotoClick(pf.url)}
                className="relative rounded-card overflow-hidden border border-border cursor-pointer group"
                style={{ padding: 0, background: 'none', aspectRatio: '1' }}>
                <img src={pf.url} alt={pf.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1.5">
                  <div className="text-white text-[10px] font-bold">{pf.label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Product photos (multi) */}
      {entry.fotoUrls && entry.fotoUrls.length > 0 && (
        <div className="mt-1 mb-2">
          <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1.5">Fotos de productos con error</div>
          <div className="grid grid-cols-2 gap-1.5">
            {entry.fotoUrls.map((url, idx) => (
              <button key={idx} onClick={() => onPhotoClick(url)}
                className="relative rounded-card overflow-hidden border border-red/20 cursor-pointer group"
                style={{ padding: 0, background: 'none', aspectRatio: '1' }}>
                <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                <div className="absolute top-1 left-1.5 bg-red text-white text-[9px] font-bold px-1.5 py-0.5 rounded">#{idx + 1}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Error photo (legacy single) */}
      {entry.fotoUrl && !entry.fotoUrls?.length && (
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

  // Client-side role guard (middleware handles server-side, this prevents flicker)
  useEffect(() => {
    if (profile && profile.role !== 'admin-auditoria' && profile.role !== 'admin') {
      router.replace('/');
    }
  }, [profile, router]);

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

  const withPhotos = useMemo(() => filtered.filter(e => e.fotoUrl || (e.fotoUrls && e.fotoUrls.length > 0) || (e.palletFotos && e.palletFotos.length > 0)), [filtered]);

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
              <div className="space-y-4">
                {withPhotos.map(e => {
                  const palletCount = e.palletFotos?.length ?? 0;
                  const prodCount = (e.fotoUrls?.length ?? 0) + (e.fotoUrl && !e.fotoUrls?.length ? 1 : 0);
                  return (
                    <div key={e.id} className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                      {/* Entry header */}
                      <div className="px-3 py-2.5 border-b border-border bg-bg flex items-center gap-2 flex-wrap">
                        <span className="font-barlow-condensed text-[14px] font-bold text-navy">{e.tiendaNombre}</span>
                        <span className="font-mono text-[10px] text-text-3 bg-white border border-border px-1.5 py-0.5 rounded">{e.tiendaCod}</span>
                        <span className="text-[11px] text-text-3">{e.fecha} · {e.hora} · {e.auditor}</span>
                        {e.pickerNombre && <span className="text-[11px] text-text-2 font-semibold">{e.pickerNombre}</span>}
                        <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full ${e.resultado === 'bueno' ? 'bg-[rgba(22,163,74,0.12)] text-success' : 'bg-[rgba(211,47,47,0.12)] text-red'}`}>
                          {e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}
                        </span>
                      </div>
                      <div className="p-3">
                        {/* Pallet photos section */}
                        {palletCount > 0 && (
                          <div className="mb-3">
                            <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1.5 flex items-center gap-1">
                              📦 Pallets <span className="font-normal normal-case text-text-3">({palletCount} foto{palletCount !== 1 ? 's' : ''})</span>
                            </div>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                              {e.palletFotos!.map((pf, idx) => (
                                <button key={idx} onClick={() => setLightbox(pf.url)}
                                  className="relative rounded-lg overflow-hidden border border-border cursor-pointer group"
                                  style={{ padding: 0, background: 'none', aspectRatio: '1' }}>
                                  <img src={pf.url} alt={pf.label} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150" />
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-1 py-1">
                                    <div className="text-white text-[9px] font-bold">{pf.label}</div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* Product photos section */}
                        {prodCount > 0 && (
                          <div>
                            <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-1.5 flex items-center gap-1">
                              ⚠ Errores <span className="font-normal normal-case text-text-3">({prodCount} foto{prodCount !== 1 ? 's' : ''})</span>
                            </div>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1.5">
                              {(e.fotoUrls && e.fotoUrls.length > 0 ? e.fotoUrls : e.fotoUrl ? [e.fotoUrl] : []).map((url, idx) => (
                                <button key={idx} onClick={() => setLightbox(url)}
                                  className="relative rounded-lg overflow-hidden border border-red/30 cursor-pointer group"
                                  style={{ padding: 0, background: 'none', aspectRatio: '1' }}>
                                  <img src={url} alt={`Error ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150" />
                                  <div className="absolute top-1 left-1 bg-red text-white text-[9px] font-bold px-1 py-0.5 rounded">#{idx + 1}</div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
        )}

        {/* Stats */}
        {!loading && tab === 'stats' && (() => {
          if (filtered.length === 0) return (
            <div className="text-center py-16 text-text-3">
              <div className="text-[40px] mb-3">📊</div>
              <div className="font-barlow-condensed text-[16px]">Sin datos para los filtros seleccionados.</div>
            </div>
          );
          const buenas = filtered.filter(e => e.resultado === 'bueno').length;
          const malas = filtered.filter(e => e.resultado === 'malo').length;
          const passPct = filtered.length ? Math.round((buenas / filtered.length) * 100) : 0;
          const totalPallets = filtered.reduce((s, e) => s + e.pallets, 0);
          const totalFaltante = filtered.reduce((s, e) => s + (e.tiposError.includes('faltante') ? 1 : 0), 0);
          const totalSobrante = filtered.reduce((s, e) => s + (e.tiposError.includes('sobrante') ? 1 : 0), 0);
          const totalCruce = filtered.filter(e => e.correccion === 'cruce').length;
          const withPhotosCount = filtered.filter(e => e.fotoUrl || (e.fotoUrls && e.fotoUrls.length > 0) || (e.palletFotos && e.palletFotos.length > 0)).length;

          // Picker stats
          const pickerMap = new Map<string, { total: number; bueno: number; nombre: string }>();
          for (const e of filtered) {
            const key = e.pickerNombre?.trim() || e.picker?.trim(); if (!key) continue;
            if (!pickerMap.has(key)) pickerMap.set(key, { total: 0, bueno: 0, nombre: key });
            const s = pickerMap.get(key)!; s.total++;
            if (e.resultado === 'bueno') s.bueno++;
          }
          const pickerStats = Array.from(pickerMap.values()).sort((a, b) => b.total - a.total);

          // Tienda stats (worst first)
          const tiendaMap = new Map<string, { total: number; bueno: number; cod: string }>();
          for (const e of filtered) {
            if (!tiendaMap.has(e.tiendaNombre)) tiendaMap.set(e.tiendaNombre, { total: 0, bueno: 0, cod: e.tiendaCod });
            const s = tiendaMap.get(e.tiendaNombre)!; s.total++;
            if (e.resultado === 'bueno') s.bueno++;
          }
          const tiendaStats = Array.from(tiendaMap.entries())
            .map(([nombre, s]) => ({ nombre, ...s, pct: Math.round((s.bueno / s.total) * 100) }))
            .sort((a, b) => a.pct - b.pct || b.total - a.total)
            .slice(0, 10);

          return (
            <div className="space-y-4">
              {/* KPI grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { v: filtered.length, l: 'Auditorías', c: '#1a2550' },
                  { v: `${passPct}%`, l: 'Aprobación', c: passPct >= 80 ? '#16A34A' : passPct >= 60 ? '#D97706' : '#D32F2F' },
                  { v: totalPallets, l: 'Pallets', c: '#2563EB' },
                  { v: withPhotosCount, l: 'Con fotos', c: '#7C3AED' },
                ].map(({ v, l, c }) => (
                  <div key={l} className="bg-white border border-border rounded-card p-3 text-center" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                    <div className="font-barlow-condensed text-[28px] font-black leading-none" style={{ color: c }}>{v}</div>
                    <div className="text-[10px] text-text-3 uppercase tracking-wide mt-1">{l}</div>
                  </div>
                ))}
              </div>

              {/* Resultado + Corrección */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-border rounded-card p-3" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                  <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-2">Resultado</div>
                  <div className="flex gap-3">
                    <div className="flex-1 text-center"><div className="font-barlow-condensed text-[24px] font-bold text-success">{buenas}</div><div className="text-[10px] text-text-3">✓ Buenos</div></div>
                    <div className="flex-1 text-center"><div className="font-barlow-condensed text-[24px] font-bold text-red">{malas}</div><div className="text-[10px] text-text-3">✗ Malos</div></div>
                  </div>
                  <div className="mt-2 h-2 bg-bg-2 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${passPct}%`, background: `linear-gradient(90deg, #16A34A80, #16A34A)` }} />
                  </div>
                </div>
                <div className="bg-white border border-border rounded-card p-3" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                  <div className="text-[10px] text-text-3 uppercase tracking-wide font-bold mb-2">Tipo de error</div>
                  <div className="space-y-1">
                    {[
                      { label: '↓ Faltante', v: totalFaltante, c: '#D32F2F' },
                      { label: '↑ Sobrante', v: totalSobrante, c: '#D97706' },
                      { label: '↔ Cruce', v: totalCruce, c: '#2563EB' },
                    ].map(({ label, v, c }) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="text-[11px] font-bold flex-shrink-0" style={{ color: c, minWidth: 72 }}>{label}</span>
                        <div className="flex-1 h-2 bg-bg-2 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: filtered.length ? `${(v / filtered.length) * 100}%` : '0%', background: c }} />
                        </div>
                        <span className="text-[11px] font-bold text-text-2 flex-shrink-0 w-6 text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Per-auditor */}
              <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                <div className="px-4 py-2.5 border-b border-border bg-bg flex items-center justify-between">
                  <span className="font-barlow-condensed text-[12px] font-bold uppercase tracking-wider text-text-3">Rendimiento por auditor</span>
                  <span className="text-[11px] text-text-3">{auditorStats.length} auditor{auditorStats.length !== 1 ? 'es' : ''}</span>
                </div>
                {auditorStats.map(({ auditor: aud, total, bueno, malo }) => {
                  const pct = total > 0 ? Math.round((bueno / total) * 100) : 0;
                  const color = pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F';
                  return (
                    <div key={aud} className="px-4 py-3 border-b border-border last:border-b-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                            style={{ background: color }}>{aud.slice(0, 2).toUpperCase()}</div>
                          <span className="font-barlow-condensed text-[15px] font-bold text-navy">{aud}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="text-success font-bold">{bueno}✓</span>
                          <span className="text-red font-bold">{malo}✗</span>
                          <span className="font-black text-[14px]" style={{ color }}>{pct}%</span>
                        </div>
                      </div>
                      <div className="h-2 bg-bg-2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
                      </div>
                      <div className="text-[10px] text-text-3 mt-0.5">{total} auditoría{total !== 1 ? 's' : ''}</div>
                    </div>
                  );
                })}
              </div>

              {/* Picker ranking */}
              {pickerStats.length > 0 && (
                <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                  <div className="px-4 py-2.5 border-b border-border bg-bg">
                    <span className="font-barlow-condensed text-[12px] font-bold uppercase tracking-wider text-text-3">Ranking de pickers</span>
                  </div>
                  {pickerStats.slice(0, 10).map(({ nombre, total, bueno }, i) => {
                    const pct = total > 0 ? Math.round((bueno / total) * 100) : 0;
                    const color = pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F';
                    const medals = ['🥇', '🥈', '🥉'];
                    return (
                      <div key={nombre} className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3">
                        <span className="text-[16px] w-6 flex-shrink-0">{medals[i] ?? `#${i + 1}`}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[13px] text-text truncate">{nombre}</div>
                          <div className="text-[10px] text-text-3">{total} auditado{total !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-black text-[16px] font-barlow-condensed" style={{ color }}>{pct}%</div>
                          <div className="text-[10px] text-text-3">{bueno}/{total}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tiendas con más errores */}
              {tiendaStats.length > 0 && (
                <div className="bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.06)' }}>
                  <div className="px-4 py-2.5 border-b border-border bg-bg">
                    <span className="font-barlow-condensed text-[12px] font-bold uppercase tracking-wider text-text-3">Tiendas con más errores</span>
                  </div>
                  {tiendaStats.map(({ nombre, cod, total, bueno, pct }) => {
                    const c = pct >= 80 ? '#16A34A' : pct >= 60 ? '#D97706' : '#D32F2F';
                    return (
                      <div key={cod} className="px-4 py-2.5 border-b border-border last:border-b-0 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-[13px] text-text truncate">{nombre}</div>
                          <div className="font-mono text-[10px] text-text-3">{cod} · {total - bueno} error{(total - bueno) !== 1 ? 'es' : ''}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-[14px] font-barlow-condensed" style={{ color: c }}>{pct}%</div>
                          <div className="text-[10px] text-text-3">{bueno}/{total}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
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
