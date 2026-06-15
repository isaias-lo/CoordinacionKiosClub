'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { sheetsSantiagoWrite } from '../santiago/utils/sheetsSantiago';
import { sheetsRegionesWrite } from '../regiones/utils/sheetsRegiones';
import { getTiendaSantiagoByCod } from '../santiago/data/tiendasSantiago';

type Fuente = 'santiago' | 'regiones';

interface DraftStore { nombre: string; pallets: number; bultos: number; contenedores: number; chocolates: number; }
interface PendingDraft {
  fecha: string;
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
  return `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1] ?? m} ${y}`;
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
      {/* Toast de éxito */}
      {toast && (
        <div className="flex-shrink-0 px-4 py-2 font-mono text-[11px] font-semibold"
             style={{ background: 'rgba(22,163,74,0.10)', borderBottom: '1px solid rgba(22,163,74,0.22)', color: '#4ADE80' }}>
          {toast}
        </div>
      )}

      {/* Banners de borradores pendientes */}
      {drafts.map(d => (
        <div key={d.fecha} className="flex-shrink-0 px-4 py-3"
             style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.18)' }}>
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] flex items-center gap-2"
                   style={{ color: '#F59E0B' }}>
                Despacho sin registrar · {fechaBonita(d.fecha)}
              </div>
              <div className="font-mono text-[12px] font-bold mt-0.5" style={{ color: 'var(--text-mid)' }}>
                {d.tiendas} tienda{d.tiendas !== 1 ? 's' : ''}
                {d.pallets > 0 ? ` · ${d.pallets}P` : ''}
                {d.bultos > 0 ? ` · ${d.bultos}B` : ''}
                {d.contenedores > 0 ? ` · ${d.contenedores}C` : ''}
                {d.chocolates > 0 ? ` · ${d.chocolates}CH` : ''}
              </div>
              <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-lo)' }}>
                Ya es un nuevo día — regístralo para no perderlo
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button onClick={() => registrar(d)} disabled={busy === d.fecha}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] font-mono text-[10px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-70 disabled:opacity-40"
                style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.28)', color: '#4ADE80' }}>
                {busy === d.fecha ? '…' : '✓'} Registrar
              </button>
              <button onClick={() => setReviewing(d)}
                className="px-3 py-1.5 rounded-[6px] font-mono text-[10px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-70"
                style={{ background: 'var(--surface-raised)', border: '1px solid var(--line-2)', color: 'rgba(255,255,255,0.50)' }}>
                Revisar
              </button>
              <button onClick={() => descartar(d)} disabled={busy === d.fecha}
                className="px-3 py-1.5 rounded-[6px] font-mono text-[10px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-70 disabled:opacity-40"
                style={{ background: 'var(--surface-inset)', border: '1px solid var(--line)', color: 'var(--text-lo)' }}>
                Descartar
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Modal Revisar */}
      {reviewing && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center"
             style={{ background: 'rgba(0,0,0,0.72)' }}
             onClick={() => setReviewing(null)}>
          <div className="w-full max-w-md mx-4 max-h-[85vh] flex flex-col rounded-[10px] overflow-hidden"
               style={{ background: 'var(--surface-card)', border: '1px solid var(--line)' }}
               onClick={e => e.stopPropagation()}>

            {/* Header modal */}
            <div className="px-4 py-3 flex items-center justify-between flex-shrink-0"
                 style={{ background: 'var(--surface-header)', borderBottom: '1px solid var(--line)' }}>
              <div>
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em]"
                     style={{ color: 'var(--text-lo)' }}>Borrador</div>
                <div className="font-mono text-[14px] font-bold" style={{ color: 'var(--text-hi)' }}>
                  {fechaBonita(reviewing.fecha)}
                </div>
                <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-lo)' }}>
                  {reviewing.tiendas} tiendas · {reviewing.pallets}P · {reviewing.bultos}B
                  {reviewing.chocolates > 0 ? ` · ${reviewing.chocolates}CH` : ''}
                </div>
              </div>
              <button onClick={() => setReviewing(null)}
                      className="w-7 h-7 flex items-center justify-center rounded-[4px] font-mono text-[14px] cursor-pointer transition-all active:opacity-70"
                      style={{ background: 'var(--surface-raised)', color: 'rgba(255,255,255,0.40)' }}>
                ✕
              </button>
            </div>

            {/* Lista tiendas */}
            <div className="flex-1 overflow-y-auto">
              {reviewing.stores.map((s, i) => (
                <div key={s.nombre} className="px-4 py-2.5 flex items-center justify-between"
                     style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                  <span className="font-mono text-[12px]" style={{ color: 'var(--text-mid)' }}>{s.nombre}</span>
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-lo)' }}>
                    {s.pallets > 0 ? `${s.pallets}P ` : ''}{s.bultos > 0 ? `${s.bultos}B ` : ''}
                    {s.contenedores > 0 ? `${s.contenedores}C ` : ''}{s.chocolates > 0 ? `${s.chocolates}CH` : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer modal */}
            <div className="flex gap-2 px-4 py-3 flex-shrink-0"
                 style={{ borderTop: '1px solid var(--line)' }}>
              <button onClick={() => registrar(reviewing)} disabled={busy === reviewing.fecha}
                className="flex-1 py-2.5 rounded-[6px] font-mono text-[11px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-75 disabled:opacity-40"
                style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.28)', color: '#4ADE80' }}>
                {busy === reviewing.fecha ? 'Registrando…' : '✓ Registrar'}
              </button>
              <button onClick={() => setReviewing(null)}
                className="px-5 py-2.5 rounded-[6px] font-mono text-[11px] font-semibold uppercase tracking-widest cursor-pointer transition-all active:opacity-70"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.45)' }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
