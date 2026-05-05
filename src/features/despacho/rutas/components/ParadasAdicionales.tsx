'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { cargarGMaps } from '../utils/maps';

let _geoGMapsIniciado = false;

async function esperarGoogleMaps(msTimeout = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!_geoGMapsIniciado) { _geoGMapsIniciado = true; cargarGMaps(); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.Geocoder) { resolve(); return; }
    const deadline = Date.now() + msTimeout;
    function verificar() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).google?.maps?.Geocoder) { resolve(); return; }
      if (Date.now() > deadline) { reject(new Error('Google Maps no cargó. Recarga la página e intenta de nuevo.')); return; }
      setTimeout(verificar, 200);
    }
    setTimeout(verificar, 200);
  });
}

async function geocodificar(direccion: string): Promise<{ gps: [number, number]; formatted: string }> {
  await esperarGoogleMaps();
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geocoder = new (window as any).google.maps.Geocoder();
    const clean = direccion.trim();
    const conChile = /chile/i.test(clean) ? clean : `${clean}, Chile`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geocoder.geocode({ address: conChile }, (results: any[], status: string) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        resolve({ gps: [loc.lat(), loc.lng()], formatted: results[0].formatted_address });
      } else if (status === 'ZERO_RESULTS') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fallback = new (window as any).google.maps.Geocoder();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fallback.geocode({ address: clean, bounds: new (window as any).google.maps.LatLngBounds(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new (window as any).google.maps.LatLng(-56.0, -75.0),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          new (window as any).google.maps.LatLng(-17.0, -66.0)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) }, (r2: any[], s2: string) => {
          if (s2 === 'OK' && r2[0]) {
            const loc = r2[0].geometry.location;
            resolve({ gps: [loc.lat(), loc.lng()], formatted: r2[0].formatted_address });
          } else {
            reject(new Error('Dirección no encontrada. Sé más específico (calle, número, ciudad).'));
          }
        });
      } else {
        reject(new Error(`Error del geocoder (${status}). Intenta de nuevo.`));
      }
    });
  });
}

export interface Parada {
  id: string;
  tipo: string;
  direccion: string;
  descripcion: string;
  p: number;
  b: number;
  gps: number[];
}

interface Props {
  isOpen: boolean;
  paradas: Parada[];
  onAgregar: (p: Omit<Parada, 'id'>) => void;
  onEliminar: (id: string) => void;
  onClose: () => void;
}

const EMPTY_FORM = { tipo: 'entrega', direccion: '', descripcion: '', p: '', b: '' };

export default function ParadasAdicionales({ isOpen, paradas, onAgregar, onEliminar, onClose }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [geo, setGeo]           = useState<{ loading: boolean; error: string | null; gps: [number, number] | null; formatted: string | null }>({ loading: false, error: null, gps: null, formatted: null });

  function resetForm() {
    setForm(EMPTY_FORM);
    setGeo({ loading: false, error: null, gps: null, formatted: null });
  }

  function handleClose() { resetForm(); setShowForm(false); onClose(); }

  async function handleBuscar() {
    if (!form.direccion.trim()) return;
    setGeo({ loading: true, error: null, gps: null, formatted: null });
    try {
      const result = await geocodificar(form.direccion.trim());
      setGeo({ loading: false, error: null, ...result });
    } catch (err) {
      setGeo({ loading: false, error: (err as Error).message, gps: null, formatted: null });
    }
  }

  function handleAgregar() {
    if (!geo.gps) return;
    onAgregar({
      tipo: form.tipo,
      direccion: geo.formatted || form.direccion.trim(),
      descripcion: form.descripcion.trim(),
      p: parseInt(form.p) || 0,
      b: parseInt(form.b) || 0,
      gps: geo.gps,
    });
    resetForm();
    setShowForm(false);
  }

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/[0.38] z-[900] backdrop-blur-sm" onClick={handleClose} />

      <div className="fixed top-0 right-0 w-[min(400px,100%)] h-full bg-kbg z-[901] overflow-y-auto flex flex-col shadow-[-4px_0_28px_rgba(0,0,0,0.16)] transition-transform duration-300 translate-x-0">

        <div className="px-4 py-3.5 border-b border-black/[0.09] bg-white flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="text-[15px] font-bold text-ktext">📍 Paradas adicionales</div>
            <div className="text-[11px] text-kmuted">Entregas o retiros fuera de las tiendas habituales</div>
          </div>
          <button onClick={handleClose} className="w-[32px] h-[32px] rounded-full bg-kbg border border-black/[0.09] flex items-center justify-center text-[16px] text-kmuted hover:text-ktext transition-colors">✕</button>
        </div>

        <div className="px-4 py-4 flex-1">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full h-[44px] rounded-kios2 border-[1.5px] border-dashed border-kred/40 text-kred text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-kred/[0.04] transition-all mb-4"
            >
              <span className="text-[20px] font-bold leading-none">+</span>
              Nueva parada
            </button>
          )}

          {showForm && (
            <div className="bg-white border border-black/[0.09] rounded-kios2 p-3.5 mb-4 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-bold text-ktext">Nueva parada</span>
                <button onClick={() => { setShowForm(false); resetForm(); }} className="text-[12px] text-kmuted hover:text-ktext">Cancelar</button>
              </div>

              <div>
                <div className="text-[10px] font-bold text-kmuted uppercase tracking-[0.5px] mb-1.5">Tipo de parada</div>
                <div className="flex gap-2">
                  {([['entrega', '📦 Entrega', 'Llevas algo'], ['retiro', '📥 Retiro', 'Recoges algo']] as [string, string, string][]).map(([val, lb, hint]) => (
                    <button
                      key={val}
                      onClick={() => setForm(f => ({ ...f, tipo: val }))}
                      className={`flex-1 py-2.5 rounded-[8px] text-[12px] font-semibold border-[1.5px] transition-all
                        ${form.tipo === val ? 'bg-kred/[0.07] border-kred text-kred' : 'bg-kbg border-black/[0.12] text-kmuted'}`}
                    >
                      <div>{lb}</div>
                      <div className={`text-[10px] font-normal mt-px ${form.tipo === val ? 'text-kred/70' : 'text-kmuted/60'}`}>{hint}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold text-kmuted uppercase tracking-[0.5px] mb-1.5">Dirección</div>
                <div className="flex gap-1.5">
                  <input
                    type="text" value={form.direccion}
                    onChange={e => { setForm(f => ({ ...f, direccion: e.target.value })); setGeo(g => ({ ...g, gps: null, formatted: null, error: null })); }}
                    onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                    placeholder="Av. Ejemplo 1234, Santiago"
                    className="flex-1 h-[38px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-kios2 text-[13px] text-ktext focus:border-kred focus:outline-none"
                  />
                  <button
                    onClick={handleBuscar}
                    disabled={!form.direccion.trim() || geo.loading}
                    className="h-[38px] px-3.5 rounded-kios2 bg-knavy text-white text-[12px] font-bold shrink-0 disabled:opacity-40 transition-all active:scale-[0.97]"
                  >
                    {geo.loading ? '···' : 'Buscar'}
                  </button>
                </div>
                {geo.error    && <div className="text-[11px] text-red-500 mt-1.5">{geo.error}</div>}
                {geo.formatted && <div className="text-[11px] text-green-600 mt-1.5">✓ {geo.formatted}</div>}
              </div>

              <div>
                <div className="text-[10px] font-bold text-kmuted uppercase tracking-[0.5px] mb-1.5">
                  ¿Qué se {form.tipo === 'entrega' ? 'lleva' : 'retira'}?
                </div>
                <input
                  type="text" value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder={form.tipo === 'entrega' ? 'Ej: Pallets vacíos...' : 'Ej: Devolución de mercadería...'}
                  className="w-full h-[38px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-kios2 text-[13px] text-ktext focus:border-kred focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                {([['p', `Pallets (${form.tipo === 'entrega' ? 'a entregar' : 'a retirar'})`, 30], ['b', `Bultos (${form.tipo === 'entrega' ? 'a entregar' : 'a retirar'})`, 99]] as [keyof typeof form, string, number][]).map(([key, label, max]) => (
                  <div key={key} className="flex-1">
                    <div className="text-[10px] font-bold text-kmuted uppercase tracking-[0.5px] mb-1.5">{label}</div>
                    <input
                      type="number" min="0" max={max} value={form[key]} placeholder="0"
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full h-[38px] px-3 bg-kbg border-[1.5px] border-black/[0.09] rounded-kios2 text-[13px] text-ktext focus:border-kred focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <button
                onClick={handleAgregar}
                disabled={!geo.gps}
                className={`w-full h-[42px] rounded-kios2 text-[13px] font-bold transition-all
                  ${geo.gps ? 'bg-kred text-white shadow-[0_3px_10px_rgba(212,43,43,0.25)] active:scale-[0.98]' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                {geo.gps ? '✓ Agregar a la ruta' : 'Primero busca la dirección'}
              </button>
            </div>
          )}

          {paradas.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-[32px] mb-2">📍</div>
              <div className="text-[13px] font-semibold text-ktext mb-1">Sin paradas adicionales</div>
              <div className="text-[12px] text-kmuted leading-relaxed">
                Agrega paradas para incluir entregas o retiros en cualquier dirección.
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-kmuted uppercase tracking-[0.5px] mb-2">
                {paradas.length} parada{paradas.length !== 1 ? 's' : ''} agregada{paradas.length !== 1 ? 's' : ''}
              </div>
              {paradas.map(p => (
                <ParadaRow key={p.id} parada={p} onEliminar={() => onEliminar(p.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

function ParadaRow({ parada: p, onEliminar }: { parada: Parada; onEliminar: () => void }) {
  const isEntrega = p.tipo === 'entrega';
  return (
    <div className={`rounded-kios2 border p-3 flex items-start gap-2.5
      ${isEntrega ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
      <div className={`shrink-0 w-[26px] h-[26px] rounded-full flex items-center justify-center text-[12px] font-bold
        ${isEntrega ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
        {isEntrega ? '↓' : '↑'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-px rounded border
            ${isEntrega ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-orange-100 text-orange-700 border-orange-200'}`}>
            {isEntrega ? 'ENTREGA' : 'RETIRO'}
          </span>
          {(p.p > 0 || p.b > 0) && (
            <span className="text-[10px] text-kmuted font-mono">
              {p.p > 0 && `${p.p}p`}{p.p > 0 && p.b > 0 && ' · '}{p.b > 0 && `${p.b}b`}
            </span>
          )}
        </div>
        <div className="text-[12px] font-semibold text-ktext leading-snug">{p.direccion}</div>
        {p.descripcion && <div className="text-[11px] text-kmuted mt-px">{p.descripcion}</div>}
      </div>
      <button
        onClick={onEliminar}
        className="shrink-0 w-[24px] h-[24px] rounded-full flex items-center justify-center text-[14px] leading-none text-kmuted/40 hover:text-red-400 hover:bg-red-50 transition-colors"
      >
        ×
      </button>
    </div>
  );
}
