'use client';

// «Escanear producto» en la tarjeta de un bulto (Nacional y RM/Costa). La handheld lee el código
// de barras del producto, se busca en los productos que el administrador guardó desde Odoo
// (/admin/sistema), y con la cantidad se calcula el peso: peso unitario × cantidad. El peso cae en
// el campo Peso, junto con las medidas guardadas del producto, y todo se puede corregir a mano.
// El bulto sigue contando como UN bulto.
//
// Los campos de acá NO llevan `data-campo` a propósito: el lector global de Bodega
// (`useLectorBodega`) solo se queda las lecturas hechas en campos de la tarjeta o en el buscador.
// En cualquier otro campo la lectura se escribe tal cual, que es lo que se quiere acá.
//
// Si el código no está guardado, «Pedir que se agregue» deja la petición (código + quién la pidió)
// en /admin/sistema (Isaias, 20/10/2026). Ver `api/productos-bodega/peticiones`.

import { useEffect, useId, useRef, useState } from 'react';
import { ScanBarcode, Send } from 'lucide-react';
import { buscarProducto, camposDesdeProducto, pesoParaCampo, pesoPorCantidad, MAX_CANTIDAD, type CamposDelBulto, type ProductoBodega } from './productosBodega';

// La lista es corta y cambia poco: se pide una vez y se reusa en todas las tarjetas un rato.
const VIGENCIA_MS = 5 * 60_000;
let cache: { hora: number; lista: ProductoBodega[] } | null = null;

async function cargarProductos(forzar = false): Promise<ProductoBodega[]> {
  if (!forzar && cache && Date.now() - cache.hora < VIGENCIA_MS) return cache.lista;
  const r = await fetch('/api/productos-bodega');
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json() as { productos?: ProductoBodega[] };
  cache = { hora: Date.now(), lista: j.productos ?? [] };
  return cache.lista;
}

const CAMPO = 'w-full bg-white border border-border rounded-btn px-2.5 py-2 text-text font-barlow text-[16px] outline-none focus:border-[#1E40AF] placeholder:text-text-3';

export default function EscanearProducto({ onUsar }: { onUsar: (campos: CamposDelBulto) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [leido, setLeido] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [producto, setProducto] = useState<ProductoBodega | null>(null);
  const [aviso, setAviso] = useState('');
  const [usado, setUsado] = useState('');
  // El código leído que no está en los productos guardados, para ofrecer pedirlo.
  const [noEsta, setNoEsta] = useState('');
  const [pedido, setPedido] = useState<'no' | 'enviando' | 'listo'>('no');
  const raiz = useRef<HTMLDivElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const campoCantidad = useRef<HTMLInputElement>(null);
  const ultima = useRef({ texto: '', hora: 0 });
  const idCodigo = useId();
  const idCantidad = useId();

  useEffect(() => { if (abierto) campoCodigo.current?.focus(); }, [abierto]);

  // Pistolas configuradas sin Enter al final: un código de barras completo (8 dígitos o más) se
  // busca solo, apenas la lectura se detiene.
  useEffect(() => {
    if (!/^\d{8,}$/.test(leido.trim())) return;
    const t = setTimeout(() => { void buscar(leido); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leido]);

  const buscar = async (codigo: string) => {
    const texto = codigo.trim();
    if (!texto) return;
    // El Enter de la pistola y la búsqueda por pausa pueden pedir lo mismo casi juntas.
    if (ultima.current.texto === texto && Date.now() - ultima.current.hora < 1500) return;
    ultima.current = { texto, hora: Date.now() };
    setAviso(''); setNoEsta(''); setPedido('no');
    try {
      let p = buscarProducto(await cargarProductos(), texto);
      // Recién agregado en /admin/sistema y todavía no en la lista de este equipo: una vuelta más.
      if (!p) p = buscarProducto(await cargarProductos(true), texto);
      if (!p) { setProducto(null); setNoEsta(texto); setAviso(`${texto} todavía no está en los productos guardados.`); return; }
      setProducto(p);
      setLeido('');
      setCantidad('');
      if (p.peso_kg == null) { setAviso('Este producto no tiene peso en Odoo: ingresa el peso a mano.'); return; }
      setTimeout(() => campoCantidad.current?.focus(), 0);
    } catch {
      setAviso('No se pudo cargar la lista de productos. Revisa la conexión.');
    }
  };

  const peso = producto ? pesoPorCantidad(producto.peso_kg, cantidad) : null;

  const pedir = async () => {
    if (!noEsta || pedido !== 'no') return;
    setPedido('enviando');
    try {
      const r = await fetch('/api/productos-bodega/peticiones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: noEsta }),
      });
      const j = await r.json().catch(() => ({})) as { error?: string; yaPedido?: boolean; pedidoPor?: string };
      if (!r.ok) { setPedido('no'); setAviso(j.error ?? 'No se pudo enviar la petición. Intenta de nuevo.'); return; }
      setPedido('listo');
      setAviso(j.yaPedido
        ? `${noEsta} ya estaba pedido${j.pedidoPor ? ` por ${j.pedidoPor}` : ''}: se sumó tu pedido. Mientras, ingresa el peso a mano.`
        : `Listo: se pidió agregar ${noEsta}. Lo verá el administrador en Sistema. Mientras, ingresa el peso a mano.`);
    } catch {
      setPedido('no');
      setAviso('No se pudo enviar la petición. Revisa la conexión.');
    }
  };

  const usar = () => {
    if (!producto || peso == null) return;
    const campos = camposDesdeProducto(producto, cantidad);
    if (!campos) return;
    onUsar(campos);
    setUsado(`${cantidad} × ${producto.nombre}`);
    setAbierto(false); setProducto(null); setCantidad(''); setAviso('');
    // De vuelta al Peso de la tarjeta: Enter sigue al próximo campo, como siempre.
    setTimeout(() => {
      const campo = raiz.current?.closest('[data-tarjeta-bodega]')?.querySelector<HTMLInputElement>('input[data-campo="peso"]');
      campo?.focus(); campo?.select();
    }, 0);
  };

  if (!abierto) {
    return (
      <div ref={raiz} className="mb-1.5 flex items-center gap-2">
        <button type="button" onClick={() => setAbierto(true)}
          className="flex items-center gap-1.5 text-apoyo font-bold text-navy bg-bg-2 active:bg-bg-3 border-none rounded-btn px-2.5 py-1.5 cursor-pointer">
          <ScanBarcode size={14} aria-hidden="true" /> Escanear producto
        </button>
        {usado && <span className="text-rotulo text-text-2 normal-case tracking-normal truncate">Peso de {usado}</span>}
      </div>
    );
  }

  return (
    <div ref={raiz} className="mb-1.5 rounded-btn border border-border bg-bg px-2.5 py-2">
      {!producto ? (
        <>
          <label htmlFor={idCodigo} className="text-rotulo font-bold text-text-sub uppercase block mb-1">Código de barras del producto</label>
          <input id={idCodigo} ref={campoCodigo} type="text" value={leido} onChange={e => setLeido(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void buscar(leido); } }}
            placeholder="Escanea o escribe" inputMode="numeric" className={CAMPO} />
        </>
      ) : (
        <>
          <div className="text-cuerpo font-bold text-text leading-tight">{producto.nombre}</div>
          <div className="text-rotulo text-text-2 normal-case tracking-normal mb-1.5">
            {producto.peso_kg != null ? `${pesoParaCampo(producto.peso_kg)} kg por unidad` : 'sin peso en Odoo'}
          </div>
          {producto.peso_kg != null && (
            <div className="flex items-end gap-2">
              <div className="w-24">
                <label htmlFor={idCantidad} className="text-rotulo font-bold text-text-sub uppercase block mb-1">Cantidad</label>
                <input id={idCantidad} ref={campoCantidad} type="text" value={cantidad} inputMode="numeric" placeholder="unid."
                  onChange={e => setCantidad(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    // Más de MAX_CANTIDAD no es una cantidad: es otro código que la pistola escribió acá.
                    if (Number(cantidad) > MAX_CANTIDAD) { const otro = cantidad; setCantidad(''); void buscar(otro); return; }
                    usar();
                  }}
                  className={CAMPO} />
              </div>
              <div className="flex-1 pb-2 text-cuerpo text-text tabular-nums">
                {peso != null ? <>= <span className="font-barlow-condensed font-extrabold">{pesoParaCampo(peso)} kg</span></> : null}
              </div>
              <button type="button" onClick={usar} disabled={peso == null}
                className="text-apoyo font-bold text-white bg-navy disabled:opacity-50 border-none rounded-btn px-3 py-2 cursor-pointer">
                Usar peso
              </button>
            </div>
          )}
        </>
      )}
      {aviso && <div className={`mt-1.5 text-rotulo normal-case tracking-normal ${pedido === 'listo' ? 'text-est-ok' : 'text-warn'}`}>{aviso}</div>}
      {noEsta && !producto && pedido !== 'listo' && (
        <button type="button" onClick={() => void pedir()} disabled={pedido === 'enviando'}
          className="mt-1.5 flex items-center gap-1.5 text-apoyo font-bold text-white bg-navy disabled:opacity-50 border-none rounded-btn px-3 py-2 cursor-pointer">
          <Send size={14} aria-hidden="true" /> {pedido === 'enviando' ? 'Enviando…' : 'Pedir que se agregue'}
        </button>
      )}
      <div className="mt-1.5 flex gap-3">
        {producto && (
          <button type="button" onClick={() => { setProducto(null); setAviso(''); setTimeout(() => campoCodigo.current?.focus(), 0); }}
            className="text-rotulo font-bold text-navy bg-transparent border-none p-0 cursor-pointer">Otro producto</button>
        )}
        <button type="button" onClick={() => { setAbierto(false); setProducto(null); setLeido(''); setCantidad(''); setAviso(''); setNoEsta(''); setPedido('no'); }}
          className="text-rotulo font-bold text-text-sub bg-transparent border-none p-0 cursor-pointer">Cerrar</button>
      </div>
    </div>
  );
}
