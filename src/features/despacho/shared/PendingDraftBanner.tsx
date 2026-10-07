'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { sheetsSantiagoWrite } from '../santiago/utils/sheetsSantiago';
import { sincronizarYCruzar } from './avisarCruce';
import { bultosSantiago, bultosNacional } from './numeroCard';
import { fechaDespachoBodega } from './fechaLocal';
import { sheetsRegionesWrite } from '../regiones/utils/sheetsRegiones';
import { getTiendaSantiagoByCod } from '../santiago/data/tiendasSantiago';
import { fechaChile } from '@/lib/fechaChile';

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
  // Un solo "hoy" para toda la app: el día del CD (America/Santiago). Ver lib/fechaChile.ts.
  return fechaChile();
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
      bultos:       bultosSantiago(arr),
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
      bultos:       bultosNacional(arr),
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
      // LAS DOS FECHAS, Y EN SU LUGAR.
      //
      // La firma es `(items, regimen, fechaDeDESPACHO, fechaDeARMADO)`. Acá se pasaba `d.fecha`
      // —que es el día en que se ARMÓ el borrador— en el lugar de la de DESPACHO, y la de armado se
      // omitía: cae a HOY, el día en que alguien aprieta el botón.
      //
      // El resultado es una fila con las dos fechas cruzadas. El sello del id sale de la de
      // despacho (30/09) y la columna FECHA de la de armado (hoy, 01/10), así que la unidad queda
      // «despachada antes de armarse» — y con un id que NO es el que escribió el registro normal.
      // Por eso no actualiza en su lugar: entra como fila NUEVA, y la unidad queda contada dos
      // veces.
      //
      // Medido el 01/10: 71 filas duplicadas del 30/09 (12.622,8 kg) y 1.021 filas con esa forma
      // desde el 08/07 — una por cada vez que alguien apretó este botón.
      //
      // La fecha de despacho del borrador sale de su propio estado; si no la trae, se deduce de la
      // de armado igual que lo hace Bodega. Nunca se deja que caiga a hoy: el borrador es de otro
      // día, y ESA es toda la razón por la que este banner existe.
      // El mediodía evita que la zona horaria corra el día al construir la fecha.
      const fechaDespacho = fechaDespachoBodega(d.state?.fechaDespacho, new Date(`${d.fecha}T12:00:00`));
      // SE ESPERA la escritura. Antes salía sin `await`, así que la línea de abajo marcaba el
      // borrador como atendido y lo sacaba de la lista ANTES de saber si la planilla lo recibió.
      if (fuente === 'santiago') {
        await sheetsSantiagoWrite(d.state.items ?? {}, d.state.regimen ?? 'Seco', fechaDespacho, d.fecha);
      } else {
        await sheetsRegionesWrite(d.state.dispatch ?? {}, 'Luis Fica', fechaDespacho, d.fecha);
      }

      // Y SE REHACE EL CRUCE, que es lo que faltaba.
      //
      // Escribir la planilla es el primer paso de tres; los otros dos son volcar la hoja a la base
      // y rehacer el cruce del día. Este botón hacía solo el primero, así que el día quedaba
      // registrado y la hoja CRUCE PESOS seguía mostrando lo que había mostrado antes.
      //
      // Medido el 06/10/2026: el 05/10 tenía las 8 tiendas de Nacional con su peso y TODAS las de
      // RM/Costa en blanco. Las 157 filas de RM habían entrado bien a las 06:53 — la hoja seguía
      // diciendo lo de las 16:04 del día anterior, cuando registró Nacional y RM todavía no.
      //
      // `d.fecha` y NO hoy: este botón registra un día PASADO. Con hoy dejaría el día viejo igual
      // de vacío y de paso tocaría el de hoy sin motivo. Ver `sincronizarYCruzar`.
      const avisoCruce = await sincronizarYCruzar(d.fecha);

      await marcarAtendido(d.fecha);
      setDrafts(prev => prev.filter(x => x.fecha !== d.fecha));
      setReviewing(null);
      // El día SÍ quedó registrado — eso no se discute. Lo que puede haber fallado es el informe,
      // y por eso se avisa sin deshacer nada.
      setToast(avisoCruce ?? `✓ Registrado el despacho del ${fechaBonita(d.fecha)}`);
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
