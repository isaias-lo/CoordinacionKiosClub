// Manifiesto POR TIENDA (detalle ítem-a-ítem, para recepción).
// Lógica pura de armado de HTML — separada de ManifiestoPanel.tsx para poder testearla
// sin depender de React/Supabase. NO afecta el manifiesto MAESTRO (buildManifiestoHTML/fromRuta
// en ManifiestoPanel.tsx), que sigue viviendo ahí.
import type { TiendaInfo } from '../data/tiendas';
import { qrDataUri } from '@/lib/qrLocal';

/* ── Tienda dentro de un manifiesto de ruta (compartido con ManifiestoPanel) ── */
export interface TiendaManifiesto {
  store_cod: string;
  nombre: string;
  ventana: string;
  orden: number;
  pallets: number;
  bultos: number;
  chocolates: number;
  contenedores: number;
}

/* ── Detalle ítem-a-ítem por tienda (para el manifiesto por tienda) ── */
export interface ItemDetalle {
  id: number;         // PK de picking_pallets = número de etiqueta física impresa en el pallet/bulto
                       // (mismo valor que "slotId" en BarcodeCard, mostrado ahí como "#{slotId}")
  canonical_id: string;
  tipo: string;      // P | B | C | CH
  seq: number | null;
  contenido: string;
  peso_kg: number | null;
  alto: number | null;
  largo: number | null;
  ancho: number | null;
  refs: string;      // guías/DTE separadas por +
}

const TIPO_LABEL: Record<string, string> = { P: 'Pallet', B: 'Bulto', C: 'Contenedor', CH: 'Chocolate' };
const CONTENIDO_LABEL: Record<string, string> = {
  hogar: 'Hogar', comida: 'Comida', 'comida-hogar': 'Mixto', 'comida-aseo': 'Comida/Aseo',
  aseo: 'Aseo', chocolate: 'Chocolate', mixto: 'Mixto',
};

export function guiasDeItems(items: ItemDetalle[]): string[] {
  const set = new Set<string>();
  for (const it of items) (it.refs || '').split('+').map(s => s.trim()).filter(Boolean).forEach(g => set.add(g));
  return [...set];
}

/**
 * URL de recepción que codifica el QR por tienda. `driveUrl` opcional → RecepcionClient
 * muestra el botón "Descargar Guías PDF" al terminar. Pura y testeable (el QR se genera
 * localmente y no expone la URL como texto en el HTML).
 */
export function buildRecepcionQrUrl(params: {
  origin: string; store_cod: string; nP: number; nBch: number; guias: string[]; driveUrl?: string;
}): string {
  const { origin, store_cod, nP, nBch, guias, driveUrl } = params;
  return `${origin}/recepcion?cod=${encodeURIComponent(store_cod)}&p=${nP}&b=${nBch}`
    + (guias.length ? `&g=${encodeURIComponent(guias.join(','))}` : '')
    + (driveUrl ? `&drv=${encodeURIComponent(driveUrl)}` : '');
}

export function buildManifiestoTiendaHTML(
  t: TiendaManifiesto,
  info: (TiendaInfo & { _parada?: boolean }) | undefined,
  items: ItemDetalle[],
  meta: { fecha: string; codigo_ruta: string; chofer: string; patente: string; supervisor: string; origin: string; driveUrl?: string },
  copia: 'ORIGINAL' | 'CEDIBLE' = 'ORIGINAL',
): string {
  // Marca de copia (esquina inferior izquierda del comprobante): ORIGINAL (navy) vs CEDIBLE (rojo).
  const copiaColor = copia === 'ORIGINAL' ? '#1a2550' : '#C62828';
  const copiaMark  = `<span style="font-weight:900;font-size:11px;letter-spacing:1.5px;padding:3px 12px;border-radius:4px;border:1.5px solid ${copiaColor};color:${copiaColor};white-space:nowrap">${copia}</span>`;
  const fechaLabel = new Date(meta.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  const nP  = items.filter(i => i.tipo === 'P').length;
  const nB  = items.filter(i => i.tipo === 'B').length;
  const nCH = items.filter(i => i.tipo === 'CH').length;
  const nC  = items.filter(i => i.tipo === 'C').length;
  const pesoTotal = Math.round(items.reduce((s, i) => s + (Number(i.peso_kg) || 0), 0) * 10) / 10;
  const guias = guiasDeItems(items);
  // `drv` = link a las Guías DTE (PDF en Drive) de esta tienda → RecepcionClient muestra el botón
  // "Descargar Guías PDF" al terminar la recepción. Sin drv, no aparece el botón.
  const qrUrl = buildRecepcionQrUrl({ origin: meta.origin, store_cod: t.store_cod, nP, nBch: nB + nCH, guias, driveUrl: meta.driveUrl });

  const filas = items.length ? items.map(it => {
    const dims = it.tipo === 'P' ? '120×100' : (it.alto && it.largo && it.ancho) ? `${it.alto}×${it.largo}×${it.ancho}` : '—';
    const guia = (it.refs || '').split('+').map(s => s.trim()).filter(Boolean).join(', ') || '—';
    return `<tr>
      <td style="width:26px;text-align:center;font-size:15px">☐</td>
      <td style="font-family:monospace;font-weight:700;font-size:12px">#${it.id}</td>
      <td><strong>${it.tipo}${it.seq ?? ''}</strong> <span style="color:#555">${TIPO_LABEL[it.tipo] ?? it.tipo}</span></td>
      <td>${CONTENIDO_LABEL[it.contenido] ?? it.contenido}</td>
      <td style="text-align:center;font-weight:700">${it.peso_kg ?? '—'}</td>
      <td style="text-align:center;font-size:9px;color:#555">${dims}</td>
      <td style="font-size:9px;color:#444">${guia}</td>
    </tr>`;
  }).join('') : `<tr><td colspan="7" style="text-align:center;color:#888;padding:16px">Sin detalle de ítems etiquetados para esta tienda.</td></tr>`;

  return `<div class="manifiesto-page">
<div class="hdr">
  <div>
    <img src="${meta.origin}/logo-kiosclub.webp" alt="KIOS Club — American Supermarket" style="height:46px;display:block;margin-bottom:3px" onerror="this.outerHTML='<div class=logo>KIOSClub</div>'">
    <div class="razon">Kiosclub American Supermarket SPA</div>
    <div class="rut">RUT 76.360.868-9</div>
    <div class="logo-sub">Manifiesto de recepción · Tienda</div>
  </div>
  <div>
    <div class="title">RECEPCIÓN TIENDA</div>
    <div class="code-lbl">Manifiesto de ruta</div>
    <div class="code">${meta.codigo_ruta}</div>
  </div>
</div>

<div class="tienda-hdr">
  <div class="tienda-hdr-info">
    <div class="tienda-hdr-grid">
      <div class="mi"><label>Tienda</label><span>${info?.n ?? t.nombre}</span></div>
      <div class="mi"><label>Código de tienda</label><span>${t.store_cod}</span></div>
      <div class="mi"><label>Fecha</label><span>${fechaLabel}</span></div>
      <div class="mi"><label>Patente</label><span>${meta.patente}</span></div>
      <div class="mi"><label>Corredor</label><span>${info?.z ?? '—'}</span></div>
      <div class="mi"><label>Ventana horaria</label><span>${info?.v ?? t.ventana ?? '—'}</span></div>
    </div>
  </div>
  <div class="tienda-hdr-qr">
    <img src="${qrDataUri(qrUrl)}" width="100" height="100" alt="QR Recepción"/>
    <div class="tienda-hdr-qr-lbl">Escanear para recibir</div>
  </div>
</div>

<div class="sec">Detalle de la carga — marque cada ítem al recibirlo (coteje el código con la etiqueta física)</div>
<table>
  <thead><tr><th>✓</th><th>Código etiqueta</th><th>Ítem</th><th>Contenido</th><th>Peso kg</th><th>Dimensiones</th><th>Guía / DTE</th></tr></thead>
  <tbody>${filas}</tbody>
</table>

<div class="totals" style="grid-template-columns:repeat(5,1fr)">
  <div class="tc"><div class="n">${nP}</div><div class="l">Pallets</div></div>
  <div class="tc"><div class="n">${nB}</div><div class="l">Bultos</div></div>
  <div class="tc"><div class="n">${nCH}</div><div class="l">Choc.</div></div>
  <div class="tc"><div class="n">${nC}</div><div class="l">Cont.</div></div>
  <div class="tc"><div class="n">${pesoTotal}</div><div class="l">Kg total</div></div>
</div>

<div class="sec">Guías / DTE asociadas (${guias.length})</div>
<div style="padding:8px 12px;background:#f5f5f5;border-radius:5px;font-size:11px;color:#333;margin-bottom:14px;border:1px solid #ddd;font-family:monospace">
  ${guias.length ? guias.join(' · ') : 'Sin guías registradas'}
</div>

<div class="sec">Observaciones</div>
<div style="display:flex;gap:18px;font-size:11px;font-weight:700;color:#333;margin-bottom:8px">
  <span>☐ Recibido conforme</span><span>☐ Recibido con observaciones</span>
</div>
<div style="border:1px solid #ccc;border-radius:6px;padding:8px 12px;margin-bottom:10px">
  <div style="font-size:8px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px">Faltantes / daños</div>
</div>

<div class="firma-section">
  <div class="sec" style="margin-bottom:10px">Firmas</div>
  <div class="firma-box" style="grid-template-columns:1fr 1fr">
    <div class="firma">
      <div class="firma-hdr">Entrega — Chofer</div>
      <div class="firma-space"></div>
      <div class="firma-fields">
        <div class="firma-field"><span class="firma-field-lbl">Patente</span><span class="firma-field-val">${meta.patente}</span></div>
        <div class="firma-field"><span class="firma-field-lbl">Nombre</span><span class="firma-field-val">${meta.chofer}</span></div>
      </div>
    </div>
    <div class="firma">
      <div class="firma-hdr">Recepción — Tienda</div>
      <div class="firma-space"></div>
      <div class="firma-fields">
        <div class="firma-field"><span class="firma-field-lbl">Nombre</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">RUT</span><span class="firma-field-blank"></span></div>
        <div class="firma-field"><span class="firma-field-lbl">Hora</span><span class="firma-field-blank"></span></div>
      </div>
    </div>
  </div>
</div>

<div class="footer" style="display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left">
  ${copiaMark}
  <span style="flex:1;text-align:center">KiosClub · Comprobante de recepción por tienda · ${new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
  <span style="width:78px;flex-shrink:0"></span>
</div>
</div>`;
}
