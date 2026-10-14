// @vitest-environment jsdom
// El salto de punta a punta: la pistola lee en un espejo una etiqueta del otro, la pantalla anota la
// lectura y navega; al montar el otro espejo, la lectura se procesa sola y abre su tienda.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const lector: { alEscanear?: (c: string) => void } = {};
vi.mock('../useLectorBodega', () => ({
  useLectorBodega: (o: { alEscanear: (c: string) => void }) => { lector.alEscanear = o.alEscanear; },
  tarjetaAMedias: () => false,
}));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/avisoFisico', () => ({ avisoFisico: () => {} }));
const perfil: { allowedPaths?: string[] } = {};
vi.mock('@/components/AuthProvider', () => ({ useAuth: () => ({ profile: perfil }) }));

import { useEscaneoBodega, type OpcionesEscaneo } from '../useEscaneoBodega';
import type { SlotDePallet } from '../buscarPallet';
import type { EspejoBodega } from '../duenoDeTienda';
import { CLAVE_ESCANEO_PENDIENTE } from '../saltoEntreBodegas';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 41ANA es de Nacional; 06MQH de RM/Costa. Las dos pantallas indexan por código acá.
const slots: Record<string, SlotDePallet[]> = {
  '41ANA': [{ id: 500, canonical_id: '1P41ANA14102026P' }],
  '06MQH': [{ id: 600, canonical_id: '1P06MQH14102026P' }],
};
const esDeRegiones = (cod: string) => cod === '41ANA';

function montar(espejo: EspejoBodega, slotsPorTienda: Record<string, SlotDePallet[]>) {
  const r = { toasts: [] as string[], rutas: [] as string[], abiertas: [] as number[] };
  function Pantalla() {
    const o: OpcionesEscaneo<SlotDePallet> = {
      activo: true,
      slotsPorTienda,
      avisoDe: () => ({ texto: '', advertir: false }) as never,
      irA: p => { r.abiertas.push(p.slot.id); return true; },
      ofrecerPreexistente: () => false,
      showToast: m => { r.toasts.push(m); },
      codDeClave: c => c,
      deOtraBodega: cod => ((espejo === 'nacional') !== esDeRegiones(cod) ? `${cod} se pesa en la otra` : null),
      espejo,
      navegar: ruta => { r.rutas.push(ruta); },
    };
    useEscaneoBodega(o);
    return null;
  }
  const div = document.createElement('div');
  const root: Root = createRoot(div);
  act(() => { root.render(React.createElement(Pantalla)); });
  return { r, root };
}

describe('pistola: etiqueta de la otra bodega', () => {
  beforeEach(() => { sessionStorage.clear(); delete perfil.allowedPaths; });
  afterEach(() => { vi.useRealTimers(); });

  it('desde RM/Costa, una etiqueta de Nacional lleva a Nacional y allá se abre', () => {
    const rm = montar('rmcosta', slots);
    act(() => { lector.alEscanear!('1P41ANA14102026P'); });
    expect(rm.r.rutas).toEqual(['/despacho/regiones']);
    expect(rm.r.abiertas).toEqual([]);
    expect(rm.r.toasts[0]).toContain('41ANA es de Nacional · te llevo allá');
    act(() => { rm.root.unmount(); });

    const nac = montar('nacional', slots);
    expect(nac.r.abiertas).toEqual([500]);
    expect(nac.r.rutas).toEqual([]);
    expect(sessionStorage.getItem(CLAVE_ESCANEO_PENDIENTE)).toBeNull();
  });

  it('el destino espera a que el pallet aparezca en su carga', () => {
    const rm = montar('rmcosta', slots);
    act(() => { lector.alEscanear!('600'); });           // 06MQH desde RM: se abre ahí mismo
    expect(rm.r.abiertas).toEqual([600]);
    expect(rm.r.rutas).toEqual([]);
    act(() => { lector.alEscanear!('500'); });           // 41ANA: a Nacional
    act(() => { rm.root.unmount(); });

    // Nacional se monta con la carga vacía (todavía no llega)…
    const div = document.createElement('div');
    const root = createRoot(div);
    const abiertas: number[] = [];
    function Nac({ s }: { s: Record<string, SlotDePallet[]> }) {
      useEscaneoBodega({
        activo: true, slotsPorTienda: s, avisoDe: () => ({ texto: '', advertir: false }) as never,
        irA: p => { abiertas.push(p.slot.id); return true; }, ofrecerPreexistente: () => false,
        showToast: () => {}, codDeClave: c => c, deOtraBodega: () => null, espejo: 'nacional', navegar: () => {},
      });
      return null;
    }
    act(() => { root.render(React.createElement(Nac, { s: {} })); });
    expect(abiertas).toEqual([]);
    // …y cuando llega, abre el pallet.
    act(() => { root.render(React.createElement(Nac, { s: slots })); });
    expect(abiertas).toEqual([500]);
  });

  it('una lectura reenviada no rebota de vuelta', () => {
    sessionStorage.setItem(CLAVE_ESCANEO_PENDIENTE, JSON.stringify({ codigo: '600', espejo: 'nacional', en: Date.now() }));
    // Nacional opina que 06MQH es de RM/Costa: aviso rojo, sin navegar otra vez.
    const nac = montar('nacional', slots);
    expect(nac.r.rutas).toEqual([]);
    expect(nac.r.abiertas).toEqual([]);
    expect(nac.r.toasts[0]).toContain('se pesa en la otra');
  });

  it('sin permiso a la otra pestaña, queda el aviso de siempre', () => {
    perfil.allowedPaths = ['/picking', '/despacho/regiones'];
    const nac = montar('nacional', slots);
    act(() => { lector.alEscanear!('600'); });
    expect(nac.r.rutas).toEqual([]);
    expect(nac.r.toasts[0]).toContain('se pesa en la otra');
  });
});
