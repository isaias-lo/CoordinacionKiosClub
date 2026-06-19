'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { sheetsSantiagoWrite } from '../santiago/utils/sheetsSantiago';
import { sheetsRegionesWrite } from '../regiones/utils/sheetsRegiones';
import { getTiendaSantiagoByCod } from '../santiago/data/tiendasSantiago';

type Fuente = 'santiago' | 'regiones';

interface DraftStore { nombre: string; pallets: number; bultos: number; contenedores: number; chocolates: number; }
interface PendingDraft {
  fecha: string;                 // YYYY-MM-DD
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any;
  stores: DraftStore[];
  tiendas: number;
  pallets: number;
  bultos: number;
  contenedores: number;
  chocolates: number;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaBonita(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(d)} ${MESES[parseInt(m) - 1] ?? m} ${y}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resumirSantiago(state: any): DraftStore[] {
  const items = state?.items ?? {};
  const out: DraftStore[] = [];
  for (const [cod, list] of Object.entries(items)) {
    const arr = (list as { tipo: string }[]) ?? [];
    if (!arr.length) continue;
    out.push({
      nombre:       getTiendaSantiagoByCod(cod)?.tienda ?? cod,
      pallets:      arr.filter(i => i.tipo === 'Pallet').length,
      bultos:       arr.filter(i => i.tipo === 'Bulto').length,
      contenedores: arr.filter(i => i.tipo === 'Contenedor').length,
      chocolates:   arr.filter(i => i.tipo === 'Chocolate').length,
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resumirRegiones(state: any): DraftStore[] {
  const dispatch = state?.dispatch ?? {};
  const out: DraftStore[] = [];
  for (const [nombre, list] of Object.entries(dispatch)) {
    const arr = (list as { pkg: string }[]) ?? [];
    if (!arr.length) continue;
    out.push({
      nombre,
      pallets:      arr.filter(i => i.pkg === 'pallet').length,
      bultos:       arr.filter(i => i.pkg === 'box').length,
      contenedores: arr.filter(i => i.pkg === 'contenedor').length,
      chocolates:   arr.filter(i => i.pkg === 'chocolate').length,
    });
  }
  return out;
}

export function PendingDraftBanner({ fuente }: { fuente: Fuente }) {
  const [drafts,    setDrafts]    = useState<PendingDraft[]>([]);
  const [reviewing, setReviewing] = useState<PendingDraft | null>(null);
  const [busy,      setBusy]      = useState<string | null>(null);
  const [toast,     setToast]     = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('shared_session_state')
      .select('fecha, state')
      .eq('fuente', fuente)
      .lt('fecha', todayISO())
      .order('fecha', { ascending: false })
      .limit(30);
    if (error || !data) return;

    const result: PendingDraft[] = [];
    for (const row of data) {
      // Si ese día ya se registró (vía FinishModal/SantiagoFinishModal), el flag viaja en el
      // state → no lo mostramos como "sin registrar" (evita reaparición y doble registro).
      if ((row.state as { registrado?: boolean })?.registrado === true) continue;
      const stores = fuente === 'santiago' ? resumirSantiago(row.state) : resumirRegiones(row.state);
      if (stores.length === 0) continue;
      result.push({
        fecha:        row.fecha as string,
        state:        row.state,
        stores,
        tiendas:      stores.length,
        pallets:      stores.reduce((n, s) => n + s.pallets, 0),
        bultos:       stores.reduce((n, s) => n + s.bultos, 0),
        contenedores: stores.reduce((n, s) => n + s.contenedores, 0),
        chocolates:   stores.reduce((n, s) => n + s.chocolates, 0),
      });
    }
    setDrafts(result);
  }, [fuente]);

  useEffect(() => { load(); }, [load]);

  // Marca el borrador como atendido (upsert con state vacío) — evita depender de permisos DELETE
  const marcarAtendido = async (fecha: string) => {
    await supabase.from('shared_session_state').upsert(
      { fecha, fuente, state: { _handled: true }, updated_at: new Date().toISOString() },
      { onConflict: 'fecha,fuente' },
    );
  };

  const registrar = async (d: PendingDraft) => {
    setBusy(d.fecha);
    try {
      if (fuente === 'santiago') {
        sheetsSantiagoWrite(d.state.items ?? {}, d.state.regimen ?? 'Seco', d.fecha);
      } else {
        sheetsRegionesWrite(d.state.dispatch ?? {}, 'Carga', d.fecha);
      }
      await marcarAtendido(d.fecha);
      setDrafts(prev => prev.filter(x => x.fecha !== d.fecha));
      setReviewing(null);
      setToast(`✓ Registrado el despacho del ${fechaBonita(d.fecha)}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setBusy(null);
    }
  };

  const descartar = async (d: PendingDraft) => {
    if (!confirm(`¿Descartar el borrador del ${fechaBonita(d.fecha)}? Esta acción no se puede deshacer.`)) return;
    setBusy(d.fecha);
    try {
      await marcarAtendido(d.fecha);
      setDrafts(prev => prev.filter(x => x.fecha !== d.fecha));
      setReviewing(null);
    } finally {
      setBusy(null);
    }
  };

  if (drafts.length === 0 && !toast) return null;

  return (
    <>
      {toast && (
        <div className="flex-shrink-0 px-4 py-2 bg-[rgba(22,163,74,0.10)] border-b border-[rgba(22,163,74,0.25)] text-[13px] font-bold text-success">
          {toast}
        </div>
      )}

      {drafts.map(d => (
        <div key={d.fecha} className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-extrabold text-amber-800 uppercase tracking-wide flex items-center gap-2">
                ⚠️ Despacho sin registrar · {fechaBonita(d.fecha)}
              </div>
              <div className="text-[13px] text-amber-700 font-semibold mt-0.5">
                {d.tiendas} tienda{d.tiendas !== 1 ? 's' : ''}
                {d.pallets > 0 ? ` · ${d.pallets} pallet${d.pallets !== 1 ? 's' : ''}` : ''}
                {d.bultos > 0 ? ` · ${d.bultos} bulto${d.bultos !== 1 ? 's' : ''}` : ''}
                {d.contenedores > 0 ? ` · ${d.contenedores} cont.` : ''}
                {d.chocolates > 0 ? ` · ${d.chocolates} choc.` : ''}
              </div>
              <div className="text-[11px] text-amber-600 mt-0.5">Ya es un nuevo día. Regístralo para no perderlo.</div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => registrar(d)}
                disabled={busy === d.fecha}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-bold text-white cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'linear-gradient(145deg,#16A34A,#15803D)', boxShadow: '0 2px 8px rgba(22,163,74,0.35)' }}
              >
                {busy === d.fecha ? '⏳' : '✓'} Registrar ahora
              </button>
              <button
                onClick={() => setReviewing(d)}
                className="px-3 py-2 rounded-lg text-[12px] font-bold cursor-pointer transition-all active:scale-95"
                style={{ background: 'white', color: '#92400E', border: '1px solid rgba(146,64,14,0.30)' }}
              >
                👁 Revisar
              </button>
              <button
                onClick={() => descartar(d)}
                disabled={busy === d.fecha}
                className="px-3 py-2 rounded-lg text-[12px] font-bold cursor-pointer transition-all active:scale-95 disabled:opacity-50"
                style={{ background: 'white', color: '#9CA3AF', border: '1px solid rgba(0,0,0,0.12)' }}
              >
                🗑 Descartar
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Modal Revisar */}
      {reviewing && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setReviewing(null)}>
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 bg-navy flex items-center justify-between flex-shrink-0">
              <div>
                <div className="font-barlow-condensed text-[16px] font-bold text-white uppercase tracking-wider">
                  Borrador · {fechaBonita(reviewing.fecha)}
                </div>
                <div className="text-[11px] text-white/55">
                  {reviewing.tiendas} tiendas · {reviewing.pallets}P · {reviewing.bultos}B
                  {reviewing.chocolates > 0 ? ` · ${reviewing.chocolates}CH` : ''}
                </div>
              </div>
              <button onClick={() => setReviewing(null)} className="text-white/50 hover:text-white text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {reviewing.stores.map(s => (
                <div key={s.nombre} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-navy truncate">{s.nombre}</span>
                  <span className="font-mono text-[12px] text-text-3 flex-shrink-0 ml-2">
                    {s.pallets > 0 ? `${s.pallets}P ` : ''}{s.bultos > 0 ? `${s.bultos}B ` : ''}
                    {s.contenedores > 0 ? `${s.contenedores}C ` : ''}{s.chocolates > 0 ? `${s.chocolates}CH` : ''}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-border flex-shrink-0">
              <button
                onClick={() => registrar(reviewing)}
                disabled={busy === reviewing.fecha}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-bold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'linear-gradient(145deg,#16A34A,#15803D)' }}
              >
                {busy === reviewing.fecha ? 'Registrando…' : '✓ Registrar ahora'}
              </button>
              <button
                onClick={() => setReviewing(null)}
                className="px-4 py-2.5 rounded-xl text-[14px] font-bold cursor-pointer bg-bg-2 text-text-2 border border-border"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
