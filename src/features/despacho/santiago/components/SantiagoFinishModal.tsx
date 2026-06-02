'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { useSantiago, SANTIAGO_TERMINADO_KEY } from '../context/SantiagoContext';
import { useAuth } from '@/components/AuthProvider';
import { pushSessionState } from '@/lib/userSessionState';
import { sheetsSantiagoWrite } from '../utils/sheetsSantiago';
import { getTiendaSantiagoByCod } from '../data/tiendasSantiago';

const todayKey = new Date().toISOString().split('T')[0];
const SANTIAGO_STATE_KEY = `santiagoState_${todayKey}`;

interface Props { open: boolean; onClose: () => void; }

export function SantiagoFinishModal({ open, onClose }: Props) {
  const { state, dispatch } = useSantiago();
  const { user } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { items, regimen } = state;

  if (!open) return null;

  const withItems = Object.entries(items).filter(([, it]) => it.length > 0);
  if (!withItems.length) { onClose(); return null; }

  let tp = 0, tb = 0, tc = 0, tch = 0;
  const tiendaStats = withItems.map(([cod, itemList]) => {
    let p = 0, b = 0, c = 0, ch = 0;
    itemList.forEach(i => {
      if (i.tipo === 'Pallet')     { p++; tp++; }
      else if (i.tipo === 'Contenedor') { c++; tc++; }
      else if (i.tipo === 'Chocolate')  { ch++; tch++; }
      else                              { b++; tb++; }
    });
    const tienda = getTiendaSantiagoByCod(cod);
    return { cod, nombre: tienda?.tienda ?? cod, pallets: p, bultos: b, contenedores: c, chocolates: ch };
  });

  const finish = async () => {
    setSaving(true);

    // 1. Escribir en Google Sheets DESPACHO RM e insertar en Supabase despacho_rm
    //    Los IDs ya tienen el formato canónico: P{seq}{cod}{stamp}P, {seq}B{cod}{stamp}B, etc.
    sheetsSantiagoWrite(items, regimen!);

    // 2. Marcar como terminado
    localStorage.setItem(SANTIAGO_TERMINADO_KEY,
      new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));

    // 3. Limpiar estado local y sincronizar Supabase
    dispatch({ type: 'RESET' });
    const emptyPayload = { step: 'regimen' as const, regimen: null as null, items: {} };
    try {
      await pushSessionState('santiago', emptyPayload, user?.id ?? undefined);
      localStorage.setItem(SANTIAGO_STATE_KEY, JSON.stringify(emptyPayload));
    } catch {}

    onClose();
    router.push('/');
  };

  return (
    <div className="fixed inset-0 bg-navy/60 z-[500] flex items-end backdrop-blur-sm">
      <div
        className="bg-white rounded-t-[20px] px-4 pb-9 pt-6 w-full max-h-[80vh] overflow-y-auto"
        style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.2)' }}
      >
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />

        <h3 className="font-barlow-condensed text-[22px] font-bold text-navy mb-1 tracking-wide">
          Registrar despacho del día
        </h3>
        <p className="text-sm text-text-2 mb-4">
          {withItems.length} tiendas · {tp} pallets · {tb} bultos
          {tc > 0 ? ` · ${tc} contenedores` : ''}
          {tch > 0 ? ` · ${tch} chocolates` : ''}
        </p>

        {/* Resumen por tienda */}
        <div className="border border-border rounded-[12px] overflow-hidden mb-5">
          {tiendaStats.map(({ cod, nombre, pallets, bultos, contenedores, chocolates }) => (
            <div key={cod} className="flex items-center justify-between px-3 py-2.5 border-b border-border last:border-b-0 text-[13px]">
              <div className="min-w-0">
                <span className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border-2 px-1.5 py-0.5 rounded mr-2">
                  {cod}
                </span>
                <span className="font-semibold text-text truncate">{nombre}</span>
              </div>
              <span className="font-mono text-text-3 text-[12px] flex-shrink-0 ml-2">
                {pallets > 0 ? `${pallets}P ` : ''}
                {bultos > 0 ? `${bultos}B ` : ''}
                {contenedores > 0 ? `${contenedores}C ` : ''}
                {chocolates > 0 ? `${chocolates}CH` : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-3.5 bg-bg-2 text-text-2 rounded-card border-none font-barlow-condensed text-lg font-bold cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={finish}
            disabled={saving}
            className="flex-1 py-3.5 bg-red text-white rounded-card border-none font-barlow-condensed text-lg font-bold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ boxShadow: '0 4px 16px rgba(211,47,47,0.3)' }}
          >
            <Check size={18} strokeWidth={2.5} />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
