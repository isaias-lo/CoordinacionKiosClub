'use client';

// «¿Algo se trabó?» arriba del panel de Ayuda: Reportar un problema y Empezar de cero. La lógica
// (qué se borra, qué se manda) vive en salidaYReporte.ts; acá solo la pantalla y la red.

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fechaChile } from '@/lib/fechaChile';
import { InlineConfirm } from '../components/InlineConfirm';
import { armarReporte, clavesABorrar, TEXTO_MAX, type EstadoPicking, type MotivoReporte } from './salidaYReporte';

/** Empezar de cero no espera más que esto al reporte automático: salir del trabado va primero. */
const TOPE_MS = 2500;

async function enviar(motivo: MotivoReporte, texto: string, estado: EstadoPicking, nombre?: string | null): Promise<string | null> {
  const fila = armarReporte(motivo, texto, estado, {
    fecha: fechaChile(), ahora: new Date(), ancho: window.innerWidth, alto: window.innerHeight,
    url: window.location.pathname, version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev', nombre,
  });
  if ('error' in fila) return fila.error;
  try {
    const { error } = await supabase.from('picking_reportes').insert(fila);
    return error ? 'No se pudo enviar. Revisa la conexión y prueba otra vez.' : null;
  } catch {
    return 'No se pudo enviar. Revisa la conexión y prueba otra vez.';
  }
}

function borrarAlmacenamiento(alm: Storage): void {
  const claves: string[] = [];
  for (let i = 0; i < alm.length; i++) { const c = alm.key(i); if (c) claves.push(c); }
  for (const c of clavesABorrar(claves)) alm.removeItem(c);
}

export function AlgoSeTrabo({ estado, nombre }: { estado: () => EstadoPicking; nombre?: string | null }) {
  const [modo, setModo] = useState<'nada' | 'reportar' | 'confirmar'>('nada');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  const reportar = async () => {
    setEnviando(true);
    const error = await enviar('reporte', texto, estado(), nombre);
    setEnviando(false);
    if (error) { setAviso({ ok: false, texto: error }); return; }
    setTexto(''); setModo('nada');
    setAviso({ ok: true, texto: 'Enviado. Llegó con lo que estabas viendo, gracias.' });
  };

  const empezarDeCero = async () => {
    setEnviando(true);
    // La foto del estado ANTES de borrarlo: es justo lo que hay que mirar para arreglarlo.
    await Promise.race([enviar('empezar-de-cero', '', estado(), nombre), new Promise(r => setTimeout(r, TOPE_MS))]);
    try { borrarAlmacenamiento(localStorage); } catch { /* bloqueado: la recarga igual limpia la memoria */ }
    try { borrarAlmacenamiento(sessionStorage); } catch { /* idem */ }
    window.location.reload();
  };

  return (
    <section className="pk-ayuda-tema pk-trabo">
      <h3>¿Algo se trabó?</h3>
      {modo === 'nada' && (
        <div className="pk-trabo-bot">
          <button type="button" className="pk-btn" onClick={() => { setAviso(null); setModo('reportar'); }}>Reportar un problema</button>
          <button type="button" className="pk-btn" onClick={() => { setAviso(null); setModo('confirmar'); }}>Empezar de cero</button>
        </div>
      )}
      {modo === 'reportar' && (
        <div className="pk-trabo-form">
          <label htmlFor="pk-reporte" className="pk-sub">Qué pasó, en una frase. Se manda junto con lo que tienes en pantalla.</label>
          <textarea id="pk-reporte" rows={3} maxLength={TEXTO_MAX} value={texto} onChange={e => setTexto(e.target.value)}
            placeholder="Ej.: quedé en 59EGN y no puedo salir" />
          <div className="pk-trabo-bot">
            <button type="button" className="pk-btn" onClick={() => setModo('nada')} disabled={enviando}>Cancelar</button>
            <button type="button" className="pk-btn pri" onClick={() => void reportar()} disabled={enviando || !texto.trim()}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
      {modo === 'confirmar' && (
        <InlineConfirm tone="warning" confirmLabel={enviando ? 'Reiniciando…' : 'Empezar de cero'}
          message="Se quitan las tiendas elegidas, la pestaña y los filtros de este equipo, y Picking se recarga. Los pallets, las impresiones y lo que falte enviar no se pierden."
          onCancel={() => setModo('nada')} onConfirm={() => { if (!enviando) void empezarDeCero(); }} />
      )}
      {aviso && <p className={`pk-trabo-aviso${aviso.ok ? ' ok' : ''}`} role="status">{aviso.texto}</p>}
    </section>
  );
}
