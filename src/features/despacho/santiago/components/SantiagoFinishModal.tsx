'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useSantiago, SANTIAGO_TERMINADO_KEY } from '../context/SantiagoContext';
import { sheetsSantiagoWrite } from '../utils/sheetsSantiago';
import { getTiendaSantiagoByCod } from '../data/tiendasSantiago';

interface Props { open: boolean; onClose: () => void; }

export function SantiagoFinishModal({ open, onClose }: Props) {
  const { state, dispatch } = useSantiago();
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

  // Fecha de despacho = la elegida o mañana por defecto; armado = hoy. (Igual que StepResumen.)
  const todayISO = new Date().toISOString().split('T')[0];
  const fechaDespacho = state.fechaDespacho ?? (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const finish = async () => {
    setSaving(true);

    // 1. Escribir en Google Sheets DESPACHO RM e insertar en Supabase despacho_rm.
    //    Los IDs ya tienen el formato canónico: P{seq}{cod}{stamp}P, {seq}B{cod}{stamp}B, etc.
    //    Tras la escritura, refrescar la base de datos (sync-despacho) para que el
    //    dashboard de Inicio quede al día. keepalive: sobrevive al cierre/desmonte.
    sheetsSantiagoWrite(items, regimen!, fechaDespacho, todayISO)
      .then(() => fetch('/api/sync-despacho', { method: 'POST', keepalive: true }))
      .catch(() => {});

    // 2. Marcar como terminado (badge COMPLETADO en el header).
    localStorage.setItem(SANTIAGO_TERMINADO_KEY,
      new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));

    // 3. #8: NO borrar tras registrar (como Regiones). Marcar registrado=true → los datos
    //    quedan en pantalla, "Reabrir" carga lo anterior, y el flag viaja en el push del
    //    contexto, así PendingDraftBanner NO lo muestra como "sin registrar" al día siguiente.
    // registrado=true → el contexto lo empuja INMEDIATO a shared_session_state (sin esperar el
    // debounce de 2.5s), así el banner "sin registrar" no reaparece al día siguiente aunque el
    // usuario navegue a Inicio enseguida. Ver SantiagoContext (push effect).
    dispatch({ type: 'SET_REGISTRADO', payload: true });

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-navy/60 z-[500] flex items-end backdrop-blur-sm">
      <div
        className="bg-white rounded-t-[20px] px-4 pb-9 pt-6 w-full max-h-[80vh] overflow-y-auto"
        style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.2)' }}
      >
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />

        <h3 className="font-barlow-condensed text-[22px] font-bold text-navy mb-1 tracking-wide">
          Registrar despacho del día — METROPOLITANA / COSTA
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
