'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Zap, Search, X } from 'lucide-react';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import { mergeTiendas, type DbTiendaRow } from '@/features/despacho/rutas/data/tiendasMerge';
import { addTiendaAdelanto, zonaForStore, type ZonaAdelanto } from '@/features/despacho/shared/tiendasAdelanto';
import { desgloseEnPalabras, type DiaDeApertura } from '@/features/despacho/shared/aperturaOdoo';

interface Props {
  /** Fecha (YYYY-MM-DD) en que la tienda entra al flujo (hoy). */
  date: string;
  /** Quién la agrega (para auditoría). */
  creadoPor?: string;
  onClose: () => void;
  /** Se llama tras agregar con éxito (para refrescar la lista). */
  onAdded: () => void;
  /** Tiendas que ya están en la lista de hoy: se pueden elegir (para cambiar su despacho), pero se avisa. */
  yaHoy?: ReadonlySet<string>;
}

const ZONA_LABEL: Record<ZonaAdelanto, string> = {
  rm:    'Santiago (RM)',
  costa: 'Costa',
  fal:   'Regiones (Nacional)',
};

/**
 * Diálogo para agregar una tienda de "adelanto" al flujo del día desde Picking:
 * buscar la tienda, confirmar la zona (Bodega destino) y la fecha de despacho.
 * No toca el calendario de abastecimiento — solo agrega un extra para hoy.
 */
export function AgregarAdelantoDialog({ date, creadoPor, onClose, onAdded, yaHoy }: Props) {
  const [q, setQ]             = useState('');
  const [sel, setSel]         = useState<{ cod: string; name: string } | null>(null);
  const [zona, setZona]       = useState<ZonaAdelanto>('rm');
  const [fechaDesp, setFecha] = useState<string>(date);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  // [APERTURA] Lo que se encontró en Odoo para esta tienda, y el día que se va a usar.
  // `buscando` arranca en false: solo se pone en true cuando hay una tienda elegida.
  const [buscando, setBuscando] = useState(false);
  const [aperturas, setAperturas] = useState<DiaDeApertura[]>([]);
  const [diaMov, setDiaMov] = useState<string>('');
  const [verCalendario, setVerCalendario] = useState(false);

  const panelRef       = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // `onClose` por ref: la pantalla lo pasa como función nueva en cada render (y re-renderiza cada
  // 60 s con la recarga de unidades). Con `onClose` en las dependencias, el efecto se rearmaba y su
  // limpieza devolvía el foco al botón de atrás: quien estaba escribiendo la fecha lo perdía.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Foco atrapado dentro del diálogo + cierre con Escape + foco inicial en el buscador. Una vez.
  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement;
    searchInputRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, []);

  // Catálogo = estático + tiendas de la BD (Config), para que las nuevas sean buscables.
  const [dbRows, setDbRows] = useState<DbTiendaRow[]>([]);
  useEffect(() => {
    fetch('/api/tiendas')
      .then(r => r.ok ? r.json() : null)
      .then((j: { tiendas?: DbTiendaRow[] } | null) => { if (j?.tiendas) setDbRows(j.tiendas); })
      .catch(() => {}); // resiliente: si falla, queda el catálogo estático
  }, []);
  const catalogo = useMemo(() => mergeTiendas(TIENDAS_INICIAL, dbRows), [dbRows]);

  const results = useMemo(() => {
    const upper = q.trim().toUpperCase();
    if (!upper) return [] as { cod: string; name: string }[];
    return Object.entries(catalogo)
      .filter(([cod, info]) => cod.includes(upper) || info.n.toUpperCase().includes(upper))
      .slice(0, 12)
      .map(([cod, info]) => ({ cod, name: info.n }));
  }, [q, catalogo]);

  function pick(store: { cod: string; name: string }) {
    setSel(store);
    setZona(zonaForStore(store.cod, catalogo[store.cod])); // default desde catálogo fusionado (incluye BD)
    setError(null);
    setAperturas([]); setDiaMov(''); setVerCalendario(false);
    void buscarApertura(store.cod);
  }

  /**
   * [APERTURA] Busca movimientos de apertura de días anteriores. Se dispara SOLO al elegir una
   * tienda, no al escribir: una búsqueda por tecla pegaría a Odoo en cada letra.
   *
   * Si no encuentra nada no pasa nada: queda la línea discreta para elegir el día a mano. Un fallo
   * tampoco bloquea — agregar la tienda tiene que seguir funcionando aunque Odoo no conteste.
   */
  async function buscarApertura(cod: string) {
    setBuscando(true);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'movimientos_apertura', cod }),
      });
      const json = await res.json() as { dias?: DiaDeApertura[] };
      setAperturas(json.dias ?? []);
    } catch {
      setAperturas([]);
    } finally {
      setBuscando(false);
    }
  }

  async function confirm() {
    if (!sel) return;
    setSaving(true); setError(null);
    const res = await addTiendaAdelanto({
      fecha:          date,
      store_cod:      sel.cod,
      zona,
      fecha_despacho: fechaDesp || null,
      creado_por:     creadoPor,
      dia_movimientos: diaMov || null,
    });
    setSaving(false);
    if (!res.ok) { setError(res.error ?? 'No se pudo agregar'); return; }
    onAdded();
    onClose();
  }

  /** «viernes 30 de octubre», como lo dice la gente. */
  function fechaLarga(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso
      : d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  /** «vie 30», para que entre en un botón. */
  function fechaCorta(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime()) ? iso
      : d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric' }).replace('.', '');
  }

  const bigBtn: React.CSSProperties = {
    width: '100%', textAlign: 'left', borderRadius: 12, padding: '10px 12px',
    border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer',
  };

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)' }} onClick={onClose}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="adelanto-dialog-title"
        className="w-full max-w-md overflow-hidden rounded-lg bg-white"
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
          <span id="adelanto-dialog-title" className="font-bold text-[17px] flex items-center gap-2" style={{ color: '#0F172A' }}>
            <Zap size={16} aria-hidden="true" /> Agregar tienda (adelanto)
          </span>
          <button onClick={onClose} aria-label="Cerrar"
            className="flex items-center cursor-pointer" style={{ color: '#94A3B8', background: 'none', border: 'none' }}><X size={20} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {!sel ? (
            <>
              <p className="text-[13px]" style={{ color: '#475569' }}>
                Busca la tienda que se adelanta o que saldrá fuera de su día de calendario.
              </p>
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ border: '1.5px solid #CBD5E1' }}>
                <Search size={15} style={{ color: '#94A3B8' }} aria-hidden="true" />
                <label htmlFor="adelanto-search" className="sr-only">Código o nombre de tienda</label>
                <input
                  id="adelanto-search" ref={searchInputRef} value={q} onChange={e => setQ(e.target.value)}
                  placeholder="Código o nombre (ej. 12LAS, Las Condes)"
                  className="flex-1 text-[15px] font-medium outline-none"
                  style={{ color: '#0F172A', border: 'none' }}
                />
              </div>
              <div className="flex flex-col gap-1.5 max-h-[40vh] overflow-y-auto">
                {results.map(r => (
                  <button key={r.cod} style={bigBtn} onClick={() => pick(r)}>
                    <span className="font-mono font-bold text-[13px] mr-2" style={{ color: '#1E40AF' }}>{r.cod}</span>
                    <span className="text-[14px]" style={{ color: '#0F172A' }}>{r.name}</span>
                    {yaHoy?.has(r.cod) && (
                      <span className="text-[11px] font-semibold ml-2" style={{ color: '#B45309' }}>Ya está hoy</span>
                    )}
                  </button>
                ))}
                {q.trim() && results.length === 0 && (
                  <div className="text-[13px] text-center py-3" style={{ color: '#94A3B8' }}>Sin coincidencias.</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: '#F8FAFF', border: '1px solid #BFDBFE' }}>
                <div>
                  <span className="font-mono font-bold text-[14px] mr-2" style={{ color: '#1E40AF' }}>{sel.cod}</span>
                  <span className="text-[14px] font-semibold" style={{ color: '#0F172A' }}>{sel.name}</span>
                </div>
                <button onClick={() => { setSel(null); setError(null); }}
                  className="text-[12px] font-bold cursor-pointer" style={{ color: '#64748B', background: 'none', border: 'none' }}>cambiar</button>
              </div>

              {/* Zona / bodega destino */}
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748B' }}>Bodega destino</div>
                <div className="flex gap-2">
                  {(['rm', 'costa', 'fal'] as ZonaAdelanto[]).map(z => (
                    <button key={z} onClick={() => setZona(z)}
                      className="flex-1 py-2 rounded-lg text-[12px] font-bold cursor-pointer transition-colors"
                      style={zona === z
                        ? { background: '#1E40AF', color: '#fff', border: '1.5px solid #1E40AF' }
                        : { background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0' }}>
                      {ZONA_LABEL[z]}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── APERTURA ────────────────────────────────────────────────────────────────
                  UN bloque con dos estados, no dos controles. Cuando Odoo tiene movimientos de
                  apertura preparados en otro día, se ofrece el más reciente con su desglose;
                  cuando no, queda una línea discreta para elegir el día a mano.

                  «Otro día» está en los DOS estados a propósito: si algún día Abastecimiento
                  cambia la palabra «Apertura» y la detección deja de encontrar, el calendario
                  sigue a mano y nadie queda encerrado en lo que el sistema propuso. */}
              {buscando && (
                <div className="rounded-xl px-3 py-2.5 text-[12.5px]" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#475569' }}>
                  Buscando movimientos de apertura…
                </div>
              )}

              {!buscando && aperturas.length > 0 && !verCalendario && (
                <div className="rounded-xl px-3 py-3" style={{ background: '#FFFBEB', border: '1.5px solid #D97706' }}>
                  <div className="text-[13px] font-bold" style={{ color: '#7C2D12' }}>
                    {sel.cod} no tiene movimientos de hoy
                  </div>
                  <div className="text-[12.5px] mt-0.5" style={{ color: '#78350F' }}>
                    Hay <strong>{aperturas[0].total} de apertura del {fechaLarga(aperturas[0].dia)}</strong>, preparados y sin salir.
                  </div>
                  <div className="rounded-lg px-2.5 py-1.5 mt-2 text-[12px]" style={{ background: '#fff', border: '1px solid #FCD34D', color: '#334155' }}>
                    {desgloseEnPalabras(aperturas[0])}
                  </div>
                  <div className="flex gap-2 mt-2.5">
                    <button type="button"
                      onClick={() => setDiaMov(d => d === aperturas[0].dia ? '' : aperturas[0].dia)}
                      className="flex-1 rounded-lg text-[13px] font-bold cursor-pointer"
                      style={{ minHeight: 44,
                        background: diaMov === aperturas[0].dia ? '#7C2D12' : '#B45309',
                        color: '#fff', border: 'none' }}>
                      {diaMov === aperturas[0].dia ? '✓ Se usarán esos' : `Usar los del ${fechaCorta(aperturas[0].dia)}`}
                    </button>
                    <button type="button" onClick={() => setVerCalendario(true)}
                      className="rounded-lg px-3 text-[12.5px] font-bold cursor-pointer"
                      style={{ minHeight: 44, background: '#fff', color: '#78350F', border: '1.5px solid #FCD34D' }}>
                      Otro día
                    </button>
                  </div>
                </div>
              )}

              {!buscando && aperturas.length === 0 && !verCalendario && (
                <div className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
                  style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                  <div className="flex-1">
                    <div className="text-[13px] font-bold" style={{ color: '#334155' }}>¿Es una apertura?</div>
                    <div className="text-[12px]" style={{ color: '#475569' }}>Trae sus movimientos de otro día</div>
                  </div>
                  <button type="button" onClick={() => setVerCalendario(true)}
                    className="rounded-lg px-3.5 text-[12.5px] font-bold cursor-pointer"
                    style={{ minHeight: 44, background: '#fff', color: '#334155', border: '1.5px solid #CBD5E1' }}>
                    Elegir día
                  </button>
                </div>
              )}

              {verCalendario && (
                <div className="rounded-xl px-3 py-3" style={{ background: '#FFFBEB', border: '1.5px solid #D97706' }}>
                  <label htmlFor="dia-mov" className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#78350F' }}>
                    Traer movimientos del día
                  </label>
                  <input id="dia-mov" type="date" value={diaMov} max={date} onChange={e => setDiaMov(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                    style={{ border: '1.5px solid #D97706', color: '#0F172A', background: '#fff' }} />
                  {diaMov && (
                    <div className="rounded-lg px-2.5 py-1.5 mt-2 text-[12.5px] flex items-center justify-between"
                      style={{ background: '#fff', border: '1px solid #FCD34D', color: '#334155' }}>
                      <span>Preparados ese día</span>
                      <strong style={{ color: '#7C2D12' }}>
                        {aperturas.find(d => d.dia === diaMov)?.total ?? 0}
                      </strong>
                    </div>
                  )}
                  <button type="button" onClick={() => { setVerCalendario(false); setDiaMov(''); }}
                    className="mt-2 text-[12px] font-bold cursor-pointer underline"
                    style={{ color: '#78350F', background: 'none', border: 'none' }}>
                    Quitar
                  </button>
                </div>
              )}

              {/* Fecha de despacho */}
              <div>
                <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#64748B' }}>Fecha de despacho</div>
                <input type="date" value={fechaDesp} onChange={e => setFecha(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                  style={{ border: '1.5px solid #CBD5E1', color: '#0F172A' }} />
              </div>

              {error && (
                <div className="rounded-xl px-3 py-2.5 text-[13px] font-medium"
                  style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
                  {error}
                </div>
              )}

              <div className="flex gap-2 mt-1">
                <button onClick={onClose}
                  className="flex-1 rounded-xl py-2.5 font-semibold text-[14px] cursor-pointer"
                  style={{ background: '#F1F5F9', color: '#475569', border: 'none' }}>
                  Cancelar
                </button>
                <button onClick={() => void confirm()} disabled={saving}
                  className="flex-1 rounded-xl py-2.5 font-bold text-[14px] cursor-pointer flex items-center justify-center gap-1.5"
                  style={{ background: saving ? '#94A3B8' : '#16A34A', color: '#fff', border: 'none' }}>
                  {saving ? 'Agregando…' : <><Zap size={14} aria-hidden="true" /> Agregar adelanto</>}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
