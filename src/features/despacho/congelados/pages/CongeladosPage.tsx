'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchCalendarioCongelados, subscribeToCalendarioCongelados, type CalRecord } from '@/lib/calendarioCongeladosSync';
import { subscribeToPickingPallets } from '@/lib/pickingPalletsChannel';
import { tiendasCongeladosDelDia, cajasCongeladosPorTienda, type ConteoCajas } from '../utils/congeladosData';
import { esCongeladoContenido } from '../../shared/congeladosBodega';
import { useOdooProgress } from '../../shared/useOdooProgress';
import { computeStoreStatus } from '../../shared/storeStatus';
import { gruposDeZona, perteneceAZona, tiendasGrillaCongelados, type ZonaCongelados } from '../utils/congeladosGrid';
import { TIENDAS as TIENDAS_NACIONAL } from '../../regiones/data/tiendas';
import { getTiendaSantiagoByCod } from '../../santiago/data/tiendasSantiago';
import { CongeladoGridCard } from '../components/CongeladoGridCard';

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

interface Props {
  zona: ZonaCongelados;
}

/**
 * Pantalla CONGELADOS (Nacional / RM-Costa según `zona`) — grilla read-only de tiendas con
 * sus cajas de picking congelados. El detalle CC/CN y el botón "Registrar" llegan en el PR
 * siguiente (Entrega 2C-3b-ii).
 */
export function CongeladosPage({ zona }: Props) {
  const [cal, setCal] = useState<CalRecord | null>(null);
  const [slotsPorTienda, setSlotsPorTienda] = useState<Record<string, { tipo: string; contenido: string }[]>>({});
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const odooProgress = useOdooProgress();

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
     directamente (no por nombre — CONGELADOS cruza los dos catálogos, Nacional y RM/Costa). ── */
  useEffect(() => {
    const dateStr = todayISO();

    const load = async () => {
      const { data } = await supabase
        .from('picking_pallets')
        .select('id,store_cod,tipo,contenido')
        .eq('date', dateStr)
        .eq('is_active', true)
        .order('id', { ascending: true });
      if (!data) return;
      const slots: Record<string, { tipo: string; contenido: string }[]> = {};
      for (const row of data) {
        const contenido = (row.contenido as string) || '';
        if (!esCongeladoContenido(contenido)) continue;
        const cod = row.store_cod as string;
        if (!cod) continue;
        if (!slots[cod]) slots[cod] = [];
        slots[cod].push({ tipo: (row.tipo as string) || 'CC', contenido });
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
            />
          );
        })}
      </div>
    </div>
  );
}
