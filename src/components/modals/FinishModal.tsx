'use client';

import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../components/AuthProvider';
import { supabase } from '../../lib/supabase';
import { buildRows } from '../../features/despacho/regiones/utils/exportUtils';
import { sheetsRegionesWrite } from '../../features/despacho/regiones/utils/sheetsRegiones';
import type { HistoryEntry } from '../../types';

const todayKey = new Date().toISOString().split('T')[0];
export const REGIONES_TERMINADO_KEY = `regionesTerminado_${todayKey}`;

interface Props { open: boolean; onClose: () => void; }

export function FinishModal({ open, onClose }: Props) {
  const { state, dispatch, showToast, flushPending } = useApp();
  const { dispatch: dispatchData, dispatchDate } = state;
  const { user } = useAuth();
  // Transporte de bodega: 'Luis Fica' por defecto (el Enrutador lo sobrescribe con la empresa del
  // camión); 'Falabella' marca ese transporte. El RÉGIMEN se guarda siempre 'Seco' (como Santiago).
  const [transporte, setTransporte] = useState<'Luis Fica' | 'Falabella'>('Luis Fica');

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
    // Registrar NO descarga Excel (eso es solo "Exportar todo" en el Resumen).
    // buildRows se conserva para el historial y la re-exportación posterior.
    const rows = buildRows(dispatchData);

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
    // Tras escribir en Sheets, refrescar la base de datos (despacho_regiones)
    // para que el dashboard de Inicio quede al día sin depender del botón
    // manual "Sincronizar". keepalive: sobrevive si el usuario navega.
    sheetsRegionesWrite(dispatchData, transporte, fechaDespacho, todayKey)
      .then(() => fetch('/api/sync-despacho', { method: 'POST', keepalive: true }))
      .catch(() => {});
    showToast('✓ Guardado · enviando a Sheets…', '#16A34A');

    dispatch({ type: 'SET_REGISTRADO', payload: true });
    localStorage.setItem(REGIONES_TERMINADO_KEY, new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
    // Forzar el push inmediato del estado con registrado=true a shared_session_state,
    // así el banner "sin registrar" no reaparece al día siguiente ni en otro equipo.
    flushPending();
  };

  return (
    <div className="fixed inset-0 bg-navy/60 z-[500] flex items-end backdrop-blur-sm">
      <div className="bg-white rounded-t-[20px] px-4 pb-9 pt-6 w-full max-h-[80vh] overflow-y-auto"
           style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.2)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />
        <h3 className="font-barlow-condensed text-[22px] font-bold text-navy mb-1 tracking-wide">Registrar despacho del día — NACIONAL</h3>
        <p className="text-sm text-text-2 mb-4">
          {dispatchDate} · {withItems.length} tiendas · {tp} pallets · {tb} bultos{tc > 0 ? ` · ${tc} contenedores` : ''}
        </p>

        {tiendaStats.map(({ name, pallets, bultos, contenedores, monto }) => (
          <div key={name} className="flex justify-between py-1.5 border-b border-border text-[13px]">
            <span className="font-semibold text-text">{name}</span>
            <span className="font-mono text-text-3">
              {pallets > 0 ? `${pallets}P ` : ''}{bultos > 0 ? `${bultos}B ` : ''}{contenedores > 0 ? `${contenedores}C ` : ''}{monto ? `· $${monto.toLocaleString('es-CL')}` : ''}
            </span>
          </div>
        ))}

        <div className="mt-5 mb-3">
          <p className="text-xs text-text-2 mb-2 font-semibold uppercase tracking-wide">Transporte</p>
          <div className="flex gap-2">
            {(['Luis Fica', 'Falabella'] as const).map(r => (
              <button
                key={r}
                onClick={() => setTransporte(r)}
                className={`flex-1 py-2.5 rounded-card border font-barlow-condensed text-base font-bold cursor-pointer transition-colors
                  ${transporte === r
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
