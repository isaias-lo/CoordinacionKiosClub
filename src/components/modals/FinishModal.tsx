'use client';

import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../components/AuthProvider';
import { supabase } from '../../lib/supabase';
import { buildRows } from '../../features/despacho/regiones/utils/exportUtils';
import { sheetsRegionesWrite } from '../../features/despacho/regiones/utils/sheetsRegiones';
import type { HistoryEntry } from '../../types';
import { todayStr } from '@/features/despacho/rutas/utils/helpers';
import { logActividad } from '@/lib/actividad';
import { fechaDespachoBodega } from '@/features/despacho/shared/fechaLocal';
import { marcarRegistro } from '@/features/despacho/shared/registroPorFecha';
import { sincronizarYCruzar, AVISO_CRUCE } from '@/features/despacho/shared/avisarCruce';
import { fechaChile } from '@/lib/fechaChile';
import { avisoNoRegistrado } from '@/features/despacho/shared/escribirPlanilla';

// Hoy en horario LOCAL (Chile). NO toISOString() (da UTC → de tarde rueda al día siguiente).
const todayKey = todayStr();
export const REGIONES_TERMINADO_KEY = `regionesTerminado_${todayKey}`;

interface Props { open: boolean; onClose: () => void; }

export function FinishModal({ open, onClose }: Props) {
  const { state, dispatch, showToast, flushPending } = useApp();
  const { dispatch: dispatchData, dispatchDate } = state;
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

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
    if (saving) return;
    setSaving(true);

    // LA MISMA cuenta que RM/Costa. De esta fecha sale el `stamp` del id de cada fila.
    //
    // Acá se pasaba `state.fechaDespacho` CRUDO, y ese campo está VACÍO mientras nadie toque el
    // selector a mano — verificado en vivo el 01/10. Con la fecha vacía, la función cae a HOY, así
    // que Nacional sellaba sus ids con el día de ARMADO mientras RM/Costa los sellaba con el de
    // DESPACHO. Medido el mismo día:
    //
    //     RM/Costa  sello 01102026  fecha 30/09   ← día siguiente, correcto
    //     Nacional  sello 01102026  fecha 01/10   ← mismo día, y el despacho era el 02/10
    //
    // Dos espejos sellando distinto es justo lo que hace que una misma unidad termine con dos ids
    // y se cuente dos veces. Ver `fechaDespachoBodega`: existe para que no haya dos cuentas.
    const fechaDespacho = fechaDespachoBodega(state.fechaDespacho);
    // Tras escribir en Sheets, refrescar la base de datos (despacho_regiones)
    // para que el dashboard de Inicio quede al día sin depender del botón
    // manual "Sincronizar". keepalive: sobrevive si el usuario navega.
    // TRANSPORTE de bodega = 'Luis Fica' (placeholder, igual que Santiago); el Enrutador lo
    // sobrescribe con la empresa del camión asignado (Luis Fica / Ortiz / Falabella…). REGIMEN='Seco'.
    // El CRUCE PESOS se escribe DESPUÉS del sync: lee los pesos de despacho_rm/despacho_regiones,
    // y hasta que ese sync no termina esas tablas no tienen lo que se acaba de registrar.
    // No rompe el registro si falla — ver `shared/avisarCruce.ts`.
    //
    // La fecha se toma ACÁ y no del `todayKey` de arriba: ese se fija al importar el módulo, así
    // que una pestaña abierta desde ayer registraría el cruce bajo el día equivocado.
    // `fechaChile()` y NO `todayKey`: ese se fija al IMPORTAR el módulo, así que una pestaña
    // abierta desde ayer escribiría la columna FECHA con el día de ayer. El comentario de arriba ya
    // avisaba de esto para el cruce; faltaba aplicarlo a la escritura de la planilla, que es
    // donde cambia el id de la fila.
    //
    // SE ESPERA la planilla antes de dar el día por registrado. Antes esto salía sin esperar y la
    // promesa nunca fallaba: con la sesión vencida o sin red se mostraba «✓ Guardado», el día
    // quedaba registrado y el aviso de «sin registrar» no volvía. Ver `escribirPlanilla`.
    try {
      await sheetsRegionesWrite(dispatchData, 'Luis Fica', fechaDespacho, fechaChile());
    } catch (e) {
      console.error('[registrar-dia]', e);
      showToast(avisoNoRegistrado(e), '#D32F2F');
      setSaving(false);
      return;
    }
    // El historial, recién con la planilla escrita: si fallaba, quedaba una entrada por intento.
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
      const isoDate = fechaChile();
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
    // Volcar la hoja a la base y rehacer el cruce del día. Ver `sincronizarYCruzar`. Esto sí va
    // sin esperar: la planilla ya tiene el día, y un informe que falla solo avisa.
    sincronizarYCruzar(fechaChile())
      .then(aviso => { if (aviso) showToast(aviso, '#D97706'); })
      .catch(() => showToast(AVISO_CRUCE, '#D97706'));
    showToast('✓ Registrado en Sheets', '#16A34A');

    // El `registros` se CALCULA acá y se empuja en la misma vuelta. Un `dispatch` no actualiza
    // `stateRef` hasta el próximo efecto, así que empujar «sin más» mandaba el estado de ANTES y
    // el día quedaba como no registrado. Ver `flushPending`.
    const registrosNuevos = marcarRegistro(state.registros, fechaDespachoBodega(state.fechaDespacho), true);
    dispatch({ type: 'SET_REGISTRADO', payload: true });
    logActividad({ accion: 'registrar_dia', fuente: 'nacional', tiendas: withItems.length, pallets: tp, bultos: tb });
    localStorage.setItem(REGIONES_TERMINADO_KEY, new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }));
    // Forzar el push inmediato del estado con registrado=true a shared_session_state,
    // así el banner "sin registrar" no reaparece al día siguiente ni en otro equipo.
    flushPending({ registrado: true, registros: registrosNuevos });
    setSaving(false);
    onClose();
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

        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-3.5 bg-bg-2 text-text-2 rounded-card border-none font-barlow-condensed text-lg font-bold cursor-pointer disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={finish} disabled={saving}
            className="flex-1 py-3.5 bg-red text-white rounded-card border-none font-barlow-condensed text-lg font-bold cursor-pointer disabled:opacity-60"
            style={{ boxShadow: '0 4px 16px rgba(211,47,47,0.3)' }}>
            {saving ? 'Registrando…' : '✓ Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
