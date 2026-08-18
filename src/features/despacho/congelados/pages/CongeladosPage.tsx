'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus, Loader2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { fetchCalendarioCongelados, subscribeToCalendarioCongelados, type CalRecord } from '@/lib/calendarioCongeladosSync';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import { pushCounts, type CountMap } from '@/lib/despachoSesion';
import { tiendasCongeladosDelDia, cajasCongeladosPorTienda, type ConteoCajas } from '../utils/congeladosData';
import { esCongeladoContenido } from '../../shared/congeladosBodega';
import { useOdooProgress } from '../../shared/useOdooProgress';
import { computeStoreStatus } from '../../shared/storeStatus';
import { gruposDeZona, perteneceAZona, tiendasGrillaCongelados, type ZonaCongelados } from '../utils/congeladosGrid';
import { formatCod } from '../../rutas/utils/helpers';
import { fechaDDMM } from '../../rutas/utils/flotaInterna';
import { TIENDAS as TIENDAS_NACIONAL } from '../../regiones/data/tiendas';
import { getTiendaSantiagoByCod } from '../../santiago/data/tiendasSantiago';
import { CongeladoGridCard } from '../components/CongeladoGridCard';
import { sheetsCongeladosWrite } from '../utils/sheetsCongelados';
import { construirItemsCongelados, type SlotCongelado } from '../utils/construirItemsCongelados';

// Slot de picking_pallets ya filtrado a congelados (esCongeladoContenido). Superset de
// SlotCongelado (agrega `contenido`, que ya no hace falta una vez filtrado pero se conserva
// porque el fetch lo trae de todas formas).
type PickingSlotCongelado = SlotCongelado & { contenido: string };

// Reverse lookup cod → tienda (catálogo Nacional), igual patrón que TiendasPage
// (COD_TO_TIENDA_NAME) pero quedándonos con el registro completo (nombre + región).
const COD_TO_NACIONAL = Object.fromEntries(
  Object.values(TIENDAS_NACIONAL).map(t => [t.cod, t])
);

function nombreDeTienda(cod: string, zona: ZonaCongelados): string {
  if (zona === 'nacional') return COD_TO_NACIONAL[cod]?.name ?? cod;
  return getTiendaSantiagoByCod(cod)?.tienda ?? cod;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadRegistradas(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

interface Props {
  zona: ZonaCongelados;
}

/* ── Stepper +/− para las cantidades de caja del detalle ── */
function StepperRow({ label, value, onChange, disabled }: {
  label: string; value: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[14px] font-semibold text-text-2">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={`Restar ${label}`}
          className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: 'rgba(8,145,178,0.35)', color: '#0891B2' }}
        >
          <Minus size={16} />
        </button>
        <span className="w-6 text-center font-barlow-condensed text-[19px] font-bold text-navy">{value}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          aria-label={`Sumar ${label}`}
          className="w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          style={{ borderColor: 'rgba(8,145,178,0.35)', color: '#0891B2' }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

/* ── Detalle CC/CN de una tienda + botón Registrar ── */
function CongeladoDetailModal({ cod, nombre, cc, cn, saving, onChangeCC, onChangeCN, onClose, onRegistrar }: {
  cod: string; nombre: string; cc: number; cn: number; saving: boolean;
  onChangeCC: (v: number) => void; onChangeCN: (v: number) => void;
  onClose: () => void; onRegistrar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-navy/50 backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-lg w-full sm:max-w-sm overflow-hidden"
        style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.10)' }}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ background: 'rgba(8,145,178,0.06)', borderColor: 'rgba(8,145,178,0.15)' }}>
          <div>
            <div className="font-barlow-condensed text-[13px] font-extrabold tracking-wide text-[#0891B2]">{formatCod(cod)}</div>
            <h3 className="font-barlow-condensed text-[19px] font-bold text-navy leading-tight">{nombre}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar"
            className="text-text-3 cursor-pointer p-1 disabled:opacity-30"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <StepperRow label="Caja Cartón (CC)" value={cc} onChange={onChangeCC} disabled={saving} />
          <StepperRow label="Caja Negra (CN)" value={cn} onChange={onChangeCN} disabled={saving} />
          <p className="text-[11px] text-text-3 text-center">desde Picking · sin pesar/medir</p>
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={onRegistrar}
            disabled={saving || (cc === 0 && cn === 0)}
            className="w-full py-3.5 rounded-btn font-barlow-condensed text-[17px] font-bold text-white cursor-pointer transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: '#0891B2' }}
          >
            {saving ? <><Loader2 size={18} className="animate-spin" /> Registrando…</> : 'Registrar Congelados'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Toast simple (sin AppContext: esta pantalla se monta fuera del Provider) ── */
function CongeladoToast({ msg, color }: { msg: string; color: string }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2.5 rounded-lg text-white font-barlow-condensed text-[15px] font-bold shadow-lg"
      style={{ background: color }}>
      {msg}
    </div>
  );
}

/**
 * Pantalla CONGELADOS (Nacional / RM-Costa según `zona`) — grilla de tiendas con sus cajas de
 * picking congelados; al tocar una tienda se abre el detalle CC/CN (steppers) y el botón
 * "Registrar Congelados" escribe a la hoja DESPACHO CONGELADOS del jefe + Supabase (counts).
 */
export function CongeladosPage({ zona }: Props) {
  const { profile, accessToken } = useAuth();
  const [cal, setCal] = useState<CalRecord | null>(null);
  const [slotsPorTienda, setSlotsPorTienda] = useState<Record<string, PickingSlotCongelado[]>>({});
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const odooProgress = useOdooProgress();

  const registradasKey = `congelados_registradas_${zona}_${todayISO()}`;
  const [selected, setSelected] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Record<string, { cc: number; cn: number }>>({});
  const [registradas, setRegistradas] = useState<Set<string>>(() => loadRegistradas(registradasKey));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);

  // Si cambia la zona (o cruza medianoche mientras la pantalla queda montada), recarga el set
  // de registradas desde la clave de localStorage correcta.
  useEffect(() => {
    setRegistradas(loadRegistradas(registradasKey));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registradasKey]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── Calendario de Congelados: fetch + realtime ── */
  useEffect(() => {
    let cancelled = false;
    fetchCalendarioCongelados().then(c => { if (!cancelled) setCal(c); });
    const unsub = subscribeToCalendarioCongelados(c => setCal(c));
    return () => { cancelled = true; unsub(); };
  }, []);

  /* ── Slots de picking_pallets de hoy, solo congelados (CC/CN), agrupados por store_cod.
     Espeja el fetch de TiendasPage (mismo cliente, mismos filtros date/is_active/order) pero
     se queda solo con los slots cuyo contenido es congelados y agrupa por código de tienda
     directamente (no por nombre — CONGELADOS cruza los dos catálogos, Nacional y RM/Costa).
     Incluye id/canonical_id/seq (no solo tipo/contenido) para poder registrar cada caja. ── */
  useEffect(() => {
    const dateStr = todayISO();

    const load = async () => {
      const { data } = await supabase
        .from('picking_pallets')
        .select('id,store_cod,tipo,contenido,canonical_id,seq')
        .eq('date', dateStr)
        .eq('is_active', true)
        .order('id', { ascending: true });
      if (!data) return;
      const slots: Record<string, PickingSlotCongelado[]> = {};
      for (const row of data) {
        const contenido = (row.contenido as string) || '';
        if (!esCongeladoContenido(contenido)) continue;
        const cod = row.store_cod as string;
        if (!cod) continue;
        if (!slots[cod]) slots[cod] = [];
        slots[cod].push({
          id: row.id as number,
          tipo: (row.tipo as string) || 'CC',
          contenido,
          canonical_id: row.canonical_id as string | null,
          seq: row.seq as number | null,
        });
      }
      setSlotsPorTienda(slots);
      setSlotsLoaded(true);
    };

    void load();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void load(); }, 600);
    };
    const unsub = subscribeToPickingPallets(debounced, load);
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);

  const cajasPorTienda = cajasCongeladosPorTienda(slotsPorTienda);

  const codsCalendario = cal ? gruposDeZona(zona).flatMap(g => tiendasCongeladosDelDia(cal, g)) : [];
  const codsConCajas = Object.keys(cajasPorTienda);
  const cods = tiendasGrillaCongelados(codsCalendario, codsConCajas, (cod) => perteneceAZona(cod, zona));

  const loaded = cal !== null && slotsLoaded;

  const showToast = (msg: string, color: string) => setToast({ msg, color });

  const abrirDetalle = (cod: string) => {
    setSelected(cod);
    setAjuste(prev => prev[cod] ? prev : {
      ...prev,
      [cod]: { cc: cajasPorTienda[cod]?.cc ?? 0, cn: cajasPorTienda[cod]?.cn ?? 0 },
    });
  };

  const cerrarDetalle = () => { if (!saving) setSelected(null); };

  const setCC = (cod: string, v: number) => setAjuste(prev => ({ ...prev, [cod]: { cc: v, cn: prev[cod]?.cn ?? 0 } }));
  const setCN = (cod: string, v: number) => setAjuste(prev => ({ ...prev, [cod]: { cc: prev[cod]?.cc ?? 0, cn: v } }));

  const registrar = async () => {
    if (!selected) return;
    const cod = selected;
    const vals = ajuste[cod] ?? { cc: 0, cn: 0 };
    setSaving(true);
    try {
      const tienda = nombreDeTienda(cod, zona);
      let region = '';
      let comuna = '';
      let ventana = '';
      if (zona === 'nacional') {
        const t = COD_TO_NACIONAL[cod];
        region = t?.region ?? '';
        comuna = t?.comuna ?? '';
        // Nacional (Sendu) no trae ventana horaria en el catálogo estático.
        ventana = '';
      } else {
        const t = getTiendaSantiagoByCod(cod);
        region = t?.region ?? '';
        comuna = t?.comuna ?? '';
        ventana = t?.ventanaHoraria ?? '';
      }
      // Ninguno de los dos catálogos trae tipo de comuna (urbano/extraurbano) para CONGELADOS
      // todavía — se deja vacío en vez de inventar una heurística nueva.
      const tipoComuna = '';

      const fechaArmadoISO = todayISO();
      const fecha = fechaDDMM(fechaArmadoISO);

      const items = construirItemsCongelados({
        cod, tienda, region, comuna, tipoComuna, ventana,
        fecha, fechaArmado: fechaArmadoISO,
        cuentaCC: vals.cc, cuentaCN: vals.cn,
        slots: slotsPorTienda[cod] ?? [],
      });

      const tabla = zona === 'nacional' ? 'despacho_regiones' : 'despacho_rm';
      await sheetsCongeladosWrite(items, { fecha, supervisor: profile?.full_name ?? '' }, tabla, accessToken ?? undefined);

      // Refleja la carga congelada del día de TODAS las tiendas de la grilla (para el
      // Enrutador) — no solo la que se acaba de registrar.
      const countsMap: CountMap = {};
      for (const c of cods) {
        countsMap[c] = {
          p: 0,
          b: c === cod ? vals.cc + vals.cn : (cajasPorTienda[c]?.total ?? 0),
          c: 0,
          ch: 0,
        };
      }
      await pushCounts(zona === 'nacional' ? 'congelados-regiones' : 'congelados-santiago', countsMap);

      setRegistradas(prev => {
        const next = new Set(prev);
        next.add(cod);
        try { localStorage.setItem(registradasKey, JSON.stringify([...next])); } catch { /* best-effort */ }
        return next;
      });
      showToast('✓ Registrado', '#16A34A');
      setSelected(null);
    } catch (err) {
      console.error('[CongeladosPage] registrar', err);
      showToast('Error al registrar. Intenta de nuevo.', '#D32F2F');
    } finally {
      setSaving(false);
    }
  };

  if (loaded && cods.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-[40px] mb-2 opacity-60" aria-hidden="true">❄</div>
          <p className="font-barlow-condensed text-[18px] font-bold text-text-2">Sin congelados para hoy</p>
        </div>
      </div>
    );
  }

  const selectedVals = selected ? (ajuste[selected] ?? { cc: 0, cn: 0 }) : null;

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {cods.map(cod => {
          const conteo: ConteoCajas = cajasPorTienda[cod] ?? { total: 0, cc: 0, cn: 0 };
          const prog = odooProgress.get(cod);
          const congTotal = prog?.congTotal ?? 0;
          const congDone = prog?.congDone ?? 0;
          const status = computeStoreStatus(congTotal, congDone);
          return (
            <CongeladoGridCard
              key={cod}
              cod={cod}
              nombre={nombreDeTienda(cod, zona)}
              cajas={conteo.total}
              congTotal={congTotal}
              congDone={congDone}
              status={status}
              registrada={registradas.has(cod)}
              onSelect={() => abrirDetalle(cod)}
            />
          );
        })}
      </div>

      {selected && selectedVals && (
        <CongeladoDetailModal
          cod={selected}
          nombre={nombreDeTienda(selected, zona)}
          cc={selectedVals.cc}
          cn={selectedVals.cn}
          saving={saving}
          onChangeCC={(v) => setCC(selected, v)}
          onChangeCN={(v) => setCN(selected, v)}
          onClose={cerrarDetalle}
          onRegistrar={registrar}
        />
      )}

      {toast && <CongeladoToast msg={toast.msg} color={toast.color} />}
    </div>
  );
}
