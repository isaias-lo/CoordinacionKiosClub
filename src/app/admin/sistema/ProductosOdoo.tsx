'use client';

// /admin/sistema › Productos de Odoo. El administrador busca un producto en Odoo por su código,
// revisa lo que trae (nombre, código de barras, peso, medidas), y si es el correcto lo guarda en
// `productos_bodega`. En Bodega, la handheld escanea el código de barras del producto para sacar
// el peso de un bulto (ver `features/despacho/shared/productosBodega.ts`).

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Package, Search, Trash2 } from 'lucide-react';
import type { ProductoBodega, ProductoDeOdoo } from '@/features/despacho/shared/productosBodega';

const C = {
  surface: '#fff', border: '#E2E8F0', borderSoft: '#F1F5F9',
  ink: '#0F172A', muted: '#475569', muted2: '#64748B', faint: '#94A3B8', navy: '#1B2A6B',
};

const CAMPO: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
  fontSize: 14, color: C.ink, background: '#fff', outline: 'none', boxSizing: 'border-box',
};

type Medidas = { peso_kg: string; alto_cm: string; ancho_cm: string; largo_cm: string };
const aTexto = (n: number | null) => (n == null ? '' : String(n));
const kg = (n: number | null) => (n == null ? '—' : `${String(n).replace('.', ',')} kg`);
const dims = (p: ProductoBodega) => {
  const v = [p.alto_cm, p.ancho_cm, p.largo_cm];
  return v.every(x => x == null) ? 'sin medidas' : v.map(x => (x == null ? '—' : String(x).replace('.', ','))).join(' × ') + ' cm';
};

export default function ProductosOdoo({ odooActivo }: { odooActivo: boolean | null }) {
  const [lista, setLista] = useState<ProductoBodega[] | null>(null);
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [encontrado, setEncontrado] = useState<ProductoDeOdoo | null>(null);
  const [medidas, setMedidas] = useState<Medidas>({ peso_kg: '', alto_cm: '', ancho_cm: '', largo_cm: '' });
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tono: 'error' | 'ok'; texto: string } | null>(null);

  const cargar = useCallback(() => {
    fetch('/api/productos-bodega')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((j: { productos?: ProductoBodega[] }) => setLista(j.productos ?? []))
      .catch(() => setAviso({ tono: 'error', texto: 'No se pudo cargar la lista de productos.' }));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const buscar = async () => {
    const q = codigo.trim();
    if (!q || buscando) return;
    setBuscando(true); setAviso(null); setEncontrado(null);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'producto_detalle', query: q }),
      });
      const j = await res.json() as { producto?: ProductoDeOdoo | null; error?: string };
      if (j.error) { setAviso({ tono: 'error', texto: j.error }); return; }
      if (!j.producto) { setAviso({ tono: 'error', texto: `No hay ningún producto con el código ${q} en Odoo.` }); return; }
      setEncontrado(j.producto);
      setMedidas({
        peso_kg: aTexto(j.producto.peso_kg), alto_cm: aTexto(j.producto.alto_cm),
        ancho_cm: aTexto(j.producto.ancho_cm), largo_cm: aTexto(j.producto.largo_cm),
      });
    } catch {
      setAviso({ tono: 'error', texto: 'No se pudo consultar Odoo. Intenta de nuevo.' });
    } finally {
      setBuscando(false);
    }
  };

  const agregar = async () => {
    if (!encontrado || guardando) return;
    setGuardando(true); setAviso(null);
    try {
      const res = await fetch('/api/productos-bodega', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: encontrado.codigo, odoo_id: encontrado.odoo_id, barcode: encontrado.barcode, nombre: encontrado.nombre,
          ...medidas,
        }),
      });
      const j = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setAviso({ tono: 'error', texto: j.error ?? 'No se pudo guardar.' }); return; }
      setAviso({ tono: 'ok', texto: `${encontrado.nombre} quedó guardado.` });
      setEncontrado(null); setCodigo('');
      cargar();
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (p: ProductoBodega) => {
    if (!confirm(`¿Quitar ${p.nombre} (${p.codigo})? Bodega deja de reconocer su código de barras.`)) return;
    const res = await fetch(`/api/productos-bodega?codigo=${encodeURIComponent(p.codigo)}`, { method: 'DELETE' });
    if (!res.ok) { setAviso({ tono: 'error', texto: 'No se pudo quitar el producto.' }); return; }
    cargar();
  };

  const yaGuardado = encontrado ? lista?.some(p => p.codigo === encontrado.codigo) : false;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginTop: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>Productos de Odoo</div>
      <div style={{ fontSize: 12, color: C.muted2, marginTop: 2, marginBottom: 14 }}>
        Los productos guardados acá se pueden escanear en Bodega para calcular el peso de un bulto.
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Código del producto o código de barras"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void buscar(); } }}
          aria-label="Código del producto" style={CAMPO} />
        <button onClick={buscar} disabled={!codigo.trim() || buscando || odooActivo === false}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 8, border: 'none',
            background: C.navy, color: '#fff', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
            cursor: !codigo.trim() || buscando ? 'default' : 'pointer', opacity: !codigo.trim() || buscando || odooActivo === false ? 0.6 : 1 }}>
          <Search size={14} aria-hidden="true" /> {buscando ? 'Buscando…' : 'Buscar en Odoo'}
        </button>
      </div>
      {odooActivo === false && (
        <div style={{ fontSize: 12, color: C.muted2, marginTop: 8 }}>Odoo está desactivado arriba: actívalo para buscar productos.</div>
      )}

      {aviso && (
        <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: aviso.tono === 'error' ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${aviso.tono === 'error' ? '#FECACA' : '#BBF7D0'}`,
          color: aviso.tono === 'error' ? '#DC2626' : '#16A34A' }}>
          {aviso.tono === 'error' && <AlertTriangle size={14} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />}
          <span>{aviso.texto}</span>
        </div>
      )}

      {encontrado && (
        <div style={{ marginTop: 14, border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, background: '#F8FAFC' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{encontrado.nombre}</div>
          <div style={{ fontSize: 12, color: C.muted2, marginTop: 2 }}>
            Código {encontrado.codigo} · Código de barras {encontrado.barcode ?? <strong style={{ color: '#D97706' }}>sin código de barras en Odoo</strong>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            {([['peso_kg', 'Peso (kg)'], ['alto_cm', 'Alto (cm)'], ['ancho_cm', 'Ancho (cm)'], ['largo_cm', 'Largo (cm)']] as const).map(([k, rotulo]) => (
              <label key={k} style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase' }}>
                {rotulo}
                <input value={medidas[k]} inputMode="decimal" placeholder="—"
                  onChange={e => setMedidas(m => ({ ...m, [k]: e.target.value }))} style={{ ...CAMPO, marginTop: 4 }} />
              </label>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8, lineHeight: 1.5 }}>
            Son los datos de Odoo, por unidad. Puedes corregirlos antes de guardar; los que queden vacíos se guardan sin dato.
            {encontrado.medidasSinConvertir && (
              <> <strong style={{ color: '#D97706' }}>Odoo no dice en qué unidad están las medidas:</strong> revisa que sean centímetros.</>
            )}
            {encontrado.alto_cm == null && encontrado.ancho_cm == null && encontrado.largo_cm == null && (
              <> <strong style={{ color: '#D97706' }}>Odoo no trae medidas en un campo conocido.</strong>
                {encontrado.otrosCampos?.length
                  ? <> Campos con valor en este producto: {encontrado.otrosCampos.map(c => `${c.etiqueta} (${c.campo}) = ${c.valor}`).join(' · ')}.</>
                  : ' Este producto no tiene ningún campo numérico con valor en Odoo.'}
              </>
            )}
            {encontrado.peso_kg == null && (
              <> <strong style={{ color: '#D97706' }}>Sin peso en Odoo:</strong> en Bodega no se podrá calcular el peso con este producto.</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={agregar} disabled={guardando}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: '#16A34A', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando…' : yaGuardado ? 'Actualizar en la base' : 'Agregar a la base'}
            </button>
            <button onClick={() => setEncontrado(null)}
              style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', color: C.muted, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              Descartar
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18, fontSize: 11, fontWeight: 700, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        Guardados {lista ? `(${lista.length})` : ''}
      </div>
      {lista === null ? (
        <div style={{ fontSize: 13, color: C.faint, marginTop: 8 }}>Cargando…</div>
      ) : lista.length === 0 ? (
        <div style={{ fontSize: 13, color: C.faint, marginTop: 8 }}>Todavía no hay productos guardados.</div>
      ) : (
        <div style={{ marginTop: 6 }}>
          {lista.map(p => (
            <div key={p.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: `1px solid ${C.borderSoft}` }}>
              <Package size={16} color={C.faint} aria-hidden="true" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                <div style={{ fontSize: 11.5, color: C.muted2 }}>
                  {p.codigo} · {p.barcode ?? 'sin código de barras'} · {kg(p.peso_kg)} · {dims(p)}
                </div>
              </div>
              <button onClick={() => quitar(p)} aria-label={`Quitar ${p.nombre}`}
                style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8, border: 'none', background: 'transparent', color: C.faint, cursor: 'pointer' }}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
