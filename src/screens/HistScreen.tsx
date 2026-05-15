'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ProfilePill } from '../components/ProfilePill';
import { supabase } from '../lib/supabase';
import { exportToTemplate } from '../features/despacho/regiones/utils/exportUtils';
import type { HistoryEntry } from '../types';

interface DispatchRow {
  id: number;
  created_at: string;
  date: string;
  total_pallets: number;
  total_bultos: number;
  tiendas: HistoryEntry['tiendas'];
}

export function HistScreen() {
  const { showToast } = useApp();
  const router = useRouter();

  const [history,  setHistory]  = useState<DispatchRow[]>([]);
  const [loading,  setLoading]  = useState(true);

  // localStorage entries (for re-export — rows only live here)
  const localEntries: HistoryEntry[] = (() => {
    try { return JSON.parse(localStorage.getItem('dispatchHistory') || '[]'); }
    catch { return []; }
  })();

  useEffect(() => {
    supabase
      .from('dispatch_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150)
      .then(({ data, error }) => {
        if (data && !error) {
          setHistory(data as DispatchRow[]);
        } else {
          // Fallback: localStorage
          setHistory(localEntries.slice().reverse().map((e, i) => ({
            id: i,
            created_at: '',
            date: e.date,
            total_pallets: e.totalPallets,
            total_bultos: e.totalBultos,
            tiendas: e.tiendas,
          })));
        }
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redownload = async (date: string) => {
    const local = localEntries.find(e => e.date === date);
    if (!local?.rows?.length) { showToast('Re-exportar no disponible en este dispositivo', '#D97706'); return; }
    await exportToTemplate(local.rows as never[], `despacho_${date.replace(/\s+/g, '_')}.xlsx`);
    showToast('Excel descargado ✓', '#16A34A');
  };

  return (
    <div className="fixed inset-0 bg-bg overflow-y-auto">
      <div className="bg-navy px-4 py-3.5 flex items-center gap-3.5 sticky top-0 z-10">
        <button onClick={() => router.push('/despacho-hub')}
          className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
          style={{
            width: 36, height: 36,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
          }}>
          <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
        </button>
        <div className="font-barlow-condensed text-xl font-bold text-white tracking-wide flex-1">Historial</div>
        <ProfilePill />
      </div>

      <div className="p-3.5">
        {loading && (
          <div className="text-center py-16 text-text-3 text-sm">Cargando historial...</div>
        )}
        {!loading && !history.length && (
          <div className="text-center py-16 text-text-3 text-[15px]">No hay despachos registrados aún.</div>
        )}
        {history.map((entry) => (
          <div key={entry.id} className="bg-white border-[1.5px] border-border rounded-card p-3.5 mb-3 shadow-card">
            <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1.5">
              <div className="font-barlow-condensed text-base font-bold text-navy">{entry.date}</div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="font-barlow-condensed text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info">{entry.total_pallets}P</span>
                <span className="font-barlow-condensed text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgba(217,119,6,0.10)] text-warn">{entry.total_bultos}B</span>
                <span className="font-barlow-condensed text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgba(22,163,74,0.10)] text-success">{entry.total_pallets + entry.total_bultos} total</span>
              </div>
            </div>

            <div className="grid gap-1.5">
              {entry.tiendas.map((t, j) => (
                <div key={j} className="bg-bg rounded-btn px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate text-text text-sm">{t.name}</div>
                    <div className="font-mono text-[11px] text-text-3 mt-0.5">{t.pallets} pal · {t.bultos} bul · {t.pesoTotal} kg</div>
                  </div>
                  {t.monto ? <div className="font-mono text-xs text-success flex-shrink-0">${t.monto.toLocaleString('es-CL')}</div> : null}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border">
              <div className="text-[13px] text-text-3">
                Total monto: <strong className="text-success font-mono">
                  ${entry.tiendas.reduce((s, t) => s + (t.monto || 0), 0).toLocaleString('es-CL')}
                </strong>
              </div>
              <button onClick={() => redownload(entry.date)}
                className="px-3.5 py-1.5 bg-navy text-white border-none rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">
                ⬇ Re-exportar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
