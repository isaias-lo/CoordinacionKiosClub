'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../context/AppContext';
import type { HistoryEntry } from '../types';

export function LaunchScreen() {
  const { dispatch, state } = useApp();
  const router = useRouter();
  const [stats, setStats] = useState({ dias: 0, pallets: 0, bultos: 0 });

  useEffect(() => {
    const history: HistoryEntry[] = (() => {
      try { return JSON.parse(localStorage.getItem('dispatchHistory') || '[]'); }
      catch { return []; }
    })();
    let pallets = 0, bultos = 0;
    history.forEach(h => { pallets += h.totalPallets || 0; bultos += h.totalBultos || 0; });
    setStats({ dias: history.length, pallets, bultos });
  }, []);

  const goToRegiones = () => {
    dispatch({ type: 'CLEAR_ALL' });
    dispatch({ type: 'SET_TIENDA', payload: null });
    dispatch({ type: 'SET_TAB', payload: 0 });
    router.push('/despacho/regiones');
  };

  const sheetsConnected = !!state.sheetsUrl;

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-0 px-6 py-10 overflow-y-auto"
         style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

      <div className="w-48 h-16 mb-8 flex items-center justify-center">
        <span className="font-barlow-condensed text-3xl font-bold text-white tracking-widest">KiosClub</span>
      </div>

      <div className="font-barlow-condensed text-xs font-semibold tracking-widest uppercase text-white/50 mb-2 text-center">
        Sistema de despacho
      </div>
      <div className="font-barlow-condensed text-3xl font-bold text-white text-center mb-10 leading-tight">
        ¿A dónde vas hoy?
      </div>

      <div className="grid grid-cols-2 gap-3 w-full max-w-sm mb-8" style={{ gridAutoRows: '88px' }}>
        <button onClick={goToRegiones}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[#B71C1C]"
          style={{ background: '#D32F2F', boxShadow: '0 8px 24px rgba(211,47,47,0.4)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Bodega Regiones</div>
          <div className="text-xs text-white/60 mt-1">Despacho nacional</div>
        </button>

        <button
          onClick={() => router.push('/despacho/santiago')}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-info/40"
          style={{ background: 'rgba(37,99,235,0.18)', boxShadow: '0 8px 24px rgba(37,99,235,0.25)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Bodega Santiago</div>
          <div className="text-xs text-white/60 mt-1">Despacho local RM</div>
        </button>

        <button
          onClick={() => router.push('/despacho')}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(34,197,94,0.50)]"
          style={{ background: 'rgba(34,197,94,0.16)', boxShadow: '0 8px 24px rgba(34,197,94,0.20)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Despacho</div>
          <div className="text-xs text-white/60 mt-1">Sistema de enrutamiento</div>
        </button>

        <button
          onClick={() => router.push('/auditoria')}
          className="relative overflow-hidden rounded-2xl px-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2 border-[rgba(124,58,237,0.50)]"
          style={{ background: 'rgba(124,58,237,0.16)', boxShadow: '0 8px 24px rgba(124,58,237,0.20)' }}>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-widest uppercase leading-tight">Auditoría</div>
          <div className="text-xs text-white/60 mt-1">Control de calidad pallets</div>
        </button>
      </div>

      <div className="flex gap-5">
        {[['dias', 'días'], ['pallets', 'pallets'], ['bultos', 'bultos']].map(([k, l]) => (
          <div key={k} className="text-center">
            <div className="font-mono text-2xl font-medium text-white">{stats[k as keyof typeof stats]}</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wider mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-4">
        <button onClick={() => router.push('/historial')}
          className="px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border border-white/20 text-white/65 bg-white/8 hover:bg-white/15 hover:text-white transition-all">
          📋 Historial
        </button>
        <button id="sheetsBtnLaunch"
          className={`px-4 py-2.5 rounded-full font-barlow text-[13px] cursor-pointer border transition-all ${
            sheetsConnected ? 'border-green-500/60 text-green-400 bg-[rgba(22,163,74,0.12)]' : 'border-white/20 text-white/65 bg-white/8 hover:bg-white/15 hover:text-white'
          }`}>
          ⚙ {sheetsConnected ? 'Sheets conectado' : 'Conectar Sheets'}
        </button>
      </div>
    </div>
  );
}
