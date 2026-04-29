'use client';

import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import { exportToTemplate } from '../features/despacho-regiones/utils/exportUtils';
import type { HistoryEntry } from '../types';

export function HistScreen() {
  const { showToast } = useApp();
  const router = useRouter();

  const history: HistoryEntry[] = (() => {
    try { return JSON.parse(localStorage.getItem('dispatchHistory') || '[]'); }
    catch { return []; }
  })();

  const redownload = (entry: HistoryEntry) => {
    if (!entry.rows?.length) { showToast('No hay datos para re-exportar', '#D97706'); return; }
    exportToTemplate(entry.rows as never[], `despacho_${entry.date.replace(/\s+/g, '_')}.xlsx`);
    showToast('Excel descargado ✓', '#16A34A');
  };

  return (
    <div className="fixed inset-0 bg-bg overflow-y-auto">
      <div className="bg-navy px-4 py-3.5 flex items-center gap-3.5 sticky top-0 z-10">
        <button onClick={() => router.push('/')}
          className="bg-none border-none text-white/70 text-sm cursor-pointer font-barlow flex items-center gap-1.5 py-1">
          ← Volver
        </button>
        <div className="font-barlow-condensed text-xl font-bold text-white tracking-wide">Historial</div>
      </div>

      <div className="p-3.5">
        {!history.length ? (
          <div className="text-center py-16 text-text-3 text-[15px]">No hay despachos registrados aún.</div>
        ) : (
          [...history].reverse().map((entry, i) => (
            <div key={i} className="bg-white border-[1.5px] border-border rounded-card p-3.5 mb-3 shadow-card">
              <div className="flex items-center justify-between mb-2.5 flex-wrap gap-1.5">
                <div className="font-barlow-condensed text-base font-bold text-navy">{entry.date}</div>
                <div className="flex gap-1.5 flex-wrap">
                  <span className="font-barlow-condensed text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgba(37,99,235,0.10)] text-info">{entry.totalPallets}P</span>
                  <span className="font-barlow-condensed text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgba(217,119,6,0.10)] text-warn">{entry.totalBultos}B</span>
                  <span className="font-barlow-condensed text-xs font-bold px-2.5 py-0.5 rounded-full bg-[rgba(22,163,74,0.10)] text-success">{(entry.totalPallets || 0) + (entry.totalBultos || 0)} total</span>
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
                <button onClick={() => redownload(entry)}
                  className="px-3.5 py-1.5 bg-navy text-white border-none rounded-btn font-barlow-condensed text-[13px] font-bold cursor-pointer">
                  ⬇ Re-exportar
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
