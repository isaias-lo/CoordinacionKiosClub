'use client';

import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../components/AuthProvider';
import { supabase } from '../../lib/supabase';
import { buildRows, exportToTemplate } from '../../features/despacho/regiones/utils/exportUtils';
import { sheetsRegionesWrite } from '../../features/despacho/regiones/utils/sheetsRegiones';
import type { HistoryEntry } from '../../types';

const todayKey = new Date().toISOString().split('T')[0];
export const REGIONES_TERMINADO_KEY = `regionesTerminado_${todayKey}`;

interface Props { open: boolean; onClose: () => void; }

export function FinishModal({ open, onClose }: Props) {
  const { state, dispatch, showToast } = useApp();
  const { dispatch: dispatchData, dispatchDate } = state;
  const { user } = useAuth();
  const [regimen, setRegimen] = useState<'Carga' | 'Falabella'>('Carga');

  if (!open) return null;

  const withItems = Object.entries(dispatchData).filter(([, items]) => items.length > 0);
  if (!withItems.length) {
    showToast('No hay despachos para terminar', '#D97706');
    onClose();
    return null;
  }

  let tp = 0, tb = 0, tc = 0, tch = 0;
  const tiendaStats = withItems.map(([name, items]) => {
    let p = 0, b = 0, c = 0, ch = 0, pesoT = 0, monto = 0;
    items.forEach(i => {
      if (i.pkg === 'pallet') { p++; tp++; }
      else if (i.pkg === 'contenedor') { c++; tc++; }
      else if (i.pkg === 'chocolate') { ch++; tch++; }
      else { b++; tb++; }
      pesoT += i.peso; monto += i.valor || 0;
    });
    return { name, pallets: p, bultos: b, contenedores: c, chocolates: ch, pesoTotal: pesoT.toLocaleString('es-CL'), monto };
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
      totalContenedores: tc,
      totalChocolates: tch,
      tiendas: tiendaStats,
      rows,
    };
    // Save to Supabase (without rows — too large)
    if (user) {
      const isoDate = new Date().toISOString().split('T')[0];
      supabase.from('dispatch_history').insert({
        user_id: user.id, date: isoDate,
        total_pallets: entry.totalPallets, total_bultos: entry.totalBultos,
        total_contenedores: entry.totalContenedores, total_chocolates: entry.totalChocolates,
        tiendas: entry.tiendas,
      }).then(({ error }) => { if (error) console.error('Dispatch save:', error.message); });
    }
    // Keep in localStorage (rows needed for re-export)
    const hist: HistoryEntry[] = JSON.parse(localStorage.getItem('dispatchHistory') || '[]');
    hist.push(entry);
    localStorage.setItem('dispatchHistory', JSON.stringify(hist.slice(-100)));

    const fechaDespacho = state.fechaDespacho;
    sheetsRegionesWrite(dispatchData, regimen, fechaDespacho, todayKey);
    showToast('✓ Guardado · enviando a Sheets…', '#16A34A');

    dispatch({ type: 'SET_REGISTRADO', payload: true });
    localStorage.setItem(REGIONES_TERMINADO_KEY, new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-end" style={{ background: 'rgba(0,0,0,0.72)' }}>
      <div className="w-full max-h-[82vh] overflow-y-auto rounded-t-[12px] px-4 pb-10 pt-5"
           style={{ background: 'var(--color-bg)', borderTop: '1px solid var(--line)' }}>

        {/* Drag handle */}
        <div className="w-8 h-0.5 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.14)' }} />

        {/* Título */}
        <div className="mb-1">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: 'var(--text-lo)' }}>Registrar despacho</span>
          <div className="font-mono text-[16px] font-bold mt-0.5" style={{ color: 'var(--text-hi)' }}>
            NACIONAL
          </div>
        </div>
        <p className="font-mono text-[11px] mb-5" style={{ color: 'var(--text-lo)' }}>
          {dispatchDate} · {withItems.length} tiendas · {tp}P · {tb}B{tc > 0 ? ` · ${tc}C` : ''}
        </p>

        {/* Lista tiendas */}
        <div className="mb-5 rounded-[8px] overflow-hidden" style={{ border: '1px solid var(--line)' }}>
          {tiendaStats.map(({ name, pallets, bultos, contenedores, monto }, i) => (
            <div key={name} className="flex items-center justify-between px-3 py-2.5"
                 style={{
                   borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                   background: i % 2 === 0 ? 'var(--surface-inset)' : 'transparent',
                 }}>
              <span className="font-mono text-[12px]" style={{ color: 'var(--text-mid)' }}>{name}</span>
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-lo)' }}>
                {pallets > 0 ? `${pallets}P ` : ''}{bultos > 0 ? `${bultos}B ` : ''}{contenedores > 0 ? `${contenedores}C ` : ''}{monto ? `$${Math.round(monto / 1000)}K` : ''}
              </span>
            </div>
          ))}
        </div>

        {/* Transporte */}
        <div className="mb-4">
          <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] mb-2"
               style={{ color: 'var(--text-lo)' }}>Transporte</div>
          <div className="flex gap-2">
            {(['Carga', 'Falabella'] as const).map(r => (
              <button key={r} onClick={() => setRegimen(r)}
                className="flex-1 py-2.5 rounded-[6px] font-mono text-[11px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-75"
                style={regimen === r
                  ? { background: 'rgba(212,43,43,0.18)', border: '1px solid rgba(212,43,43,0.40)', color: 'rgba(255,255,255,0.90)' }
                  : { background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'rgba(255,255,255,0.40)' }}>
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-[6px] font-mono text-[11px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-70"
            style={{ background: 'var(--surface-raised)', border: '1px solid var(--line-2)', color: 'rgba(255,255,255,0.45)' }}>
            Cancelar
          </button>
          <button onClick={finish}
            className="flex-1 py-3 rounded-[6px] font-mono text-[11px] font-semibold uppercase tracking-widest text-white cursor-pointer transition-all active:opacity-75"
            style={{ background: '#D42B2B' }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
