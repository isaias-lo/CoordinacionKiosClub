'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../components/AuthProvider';
import { supabase } from '../../lib/supabase';
import { buildRows, exportToTemplate } from '../../features/despacho/regiones/utils/exportUtils';
import { sheetsRegionesWrite } from '../../features/despacho/regiones/utils/sheetsRegiones';
import type { HistoryEntry } from '../../types';

interface Props { open: boolean; onClose: () => void; }

export function FinishModal({ open, onClose }: Props) {
  const { state, dispatch, showToast } = useApp();
  const { dispatch: dispatchData, dispatchDate } = state;
  const { user } = useAuth();
  const router = useRouter();
  const [regimen, setRegimen] = useState<'Carga' | 'Falabella'>('Carga');

  if (!open) return null;

  const withItems = Object.entries(dispatchData).filter(([, items]) => items.length > 0);
  if (!withItems.length) {
    showToast('No hay despachos para terminar', '#D97706');
    onClose();
    return null;
  }

  let tp = 0, tb = 0;
  const tiendaStats = withItems.map(([name, items]) => {
    let p = 0, b = 0, pesoT = 0, monto = 0;
    items.forEach(i => { i.pkg === 'pallet' ? (p++, tp++) : (b++, tb++); pesoT += i.peso; monto += i.valor || 0; });
    return { name, pallets: p, bultos: b, pesoTotal: pesoT.toLocaleString('es-CL'), monto };
  });

  const finish = async () => {
    onClose();
    const rows = buildRows(dispatchData);
    const date = new Date().toLocaleDateString('es-CL').replace(/\//g, '-');
    await exportToTemplate(rows, `despacho_${date}.xlsx`);

    const entry: HistoryEntry = {
      date: dispatchDate,
      totalPallets: tp,
      totalBultos: tb,
      tiendas: tiendaStats,
      rows,
    };
    // Save to Supabase (without rows — too large)
    if (user) {
      supabase.from('dispatch_history').insert({
        user_id: user.id, date: entry.date,
        total_pallets: entry.totalPallets, total_bultos: entry.totalBultos,
        tiendas: entry.tiendas,
      }).then(({ error }) => { if (error) console.error('Dispatch save:', error.message); });
    }
    // Keep in localStorage (rows needed for re-export)
    const hist: HistoryEntry[] = JSON.parse(localStorage.getItem('dispatchHistory') || '[]');
    hist.push(entry);
    localStorage.setItem('dispatchHistory', JSON.stringify(hist.slice(-100)));

    sheetsRegionesWrite(dispatchData, regimen);
    showToast('✓ Guardado · enviando a Sheets…', '#16A34A');

    dispatch({ type: 'CLEAR_ALL' });
    setTimeout(() => router.push('/'), 700);
  };

  return (
    <div className="fixed inset-0 bg-navy/60 z-[500] flex items-end backdrop-blur-sm">
      <div className="bg-white rounded-t-[20px] px-4 pb-9 pt-6 w-full max-h-[80vh] overflow-y-auto"
           style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.2)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />
        <h3 className="font-barlow-condensed text-[22px] font-bold text-navy mb-1 tracking-wide">Terminar despacho del día</h3>
        <p className="text-sm text-text-2 mb-4">{dispatchDate} · {withItems.length} tiendas · {tp} pallets · {tb} bultos</p>

        {tiendaStats.map(({ name, pallets, bultos, monto }) => (
          <div key={name} className="flex justify-between py-1.5 border-b border-border text-[13px]">
            <span className="font-semibold text-text">{name}</span>
            <span className="font-mono text-text-3">{pallets} pal · {bultos} bul{monto ? ` · $${monto.toLocaleString('es-CL')}` : ''}</span>
          </div>
        ))}

        <div className="mt-5 mb-3">
          <p className="text-xs text-text-2 mb-2 font-semibold uppercase tracking-wide">Transporte</p>
          <div className="flex gap-2">
            {(['Carga', 'Falabella'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRegimen(r)}
                className={`flex-1 py-2.5 rounded-card border font-barlow-condensed text-base font-bold cursor-pointer transition-colors
                  ${regimen === r
                    ? 'bg-navy text-white border-navy'
                    : 'bg-bg-2 text-text-2 border-border'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5 mt-3">
          <button onClick={onClose}
            className="flex-1 py-3.5 bg-bg-2 text-text-2 rounded-card border-none font-barlow-condensed text-lg font-bold cursor-pointer">
            Cancelar
          </button>
          <button onClick={finish}
            className="flex-1 py-3.5 bg-red text-white rounded-card border-none font-barlow-condensed text-lg font-bold cursor-pointer"
            style={{ boxShadow: '0 4px 16px rgba(211,47,47,0.3)' }}>
            ✓ Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
