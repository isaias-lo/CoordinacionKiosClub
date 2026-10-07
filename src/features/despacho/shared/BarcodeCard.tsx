'use client';

import { useEffect, useRef } from 'react';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';
import { fmtHoraChile, odooDateToISO } from '@/lib/fechaChile';

// ─── LabelConfig ─────────────────────────────────────────────────────────────

export interface LabelConfig {
  borderWidth: number;           // 0–4
  pickerFontSize: number;        // 20–50
  storeFontSize: number;         // 80–240
  catFontSize: number;           // 12–30
  barcodeBarWidth: number;       // 1–4
  barcodeHeight: number;         // 40–130
  barcodeContainerWidth: number; // 60–100 (%)
  showResponsable: boolean;
  showCategories: boolean;
  showStoreName: boolean;
  dateFontSize: number;          // 8–48
  palletNumSize: number;         // 50–120
  storeNameFontSize: number;     // 24–72
  cornerRadius: number;          // 0–20
  showDate: boolean;
  slotIdFontSize: number;        // 10–28
  batchFontSize: number;         // 14–60
  finishTimeFontSize: number;    // 12–48
  showBatch: boolean;
  showFinishTime: boolean;
}

// ── LAS DOS TINTAS DE LA ETIQUETA ─────────────────────────────────────────────────────────────
//
// Esto se imprime, casi siempre en blanco y negro. No es una paleta de pantalla: son dos tintas.
// Van nombradas acá y no repetidas quince veces en línea, que es lo que pide el trinquete de
// `escalaBodega.test.ts` — y además deja cambiar el acento en un solo lugar el día que haga falta.
/** Negro de impresión: el texto, los bordes y la raya donde se escribe. */
const TINTA = '#111827';
/** El ámbar del número de unidad. En una impresora B/N sale gris oscuro y se lee igual. */
const ACENTO = '#D97706';
/** El gris del texto secundario: nombre de tienda, rótulos, pie. */
const GRIS = '#4B5563';
/** Las rayas finas que separan las tres bandas, y el borde del recuadro donde se escribe. */
const RAYA = '#D1D5DB';

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  borderWidth: 2, pickerFontSize: 34, storeFontSize: 150, catFontSize: 22,
  barcodeBarWidth: 2, barcodeHeight: 113, barcodeContainerWidth: 85,
  showResponsable: true, showCategories: true, showStoreName: true,
  dateFontSize: 30, palletNumSize: 80, storeNameFontSize: 52, cornerRadius: 12, showDate: true,
  slotIdFontSize: 18, batchFontSize: 34, finishTimeFontSize: 28, showBatch: true, showFinishTime: true,
};

// ─── Slider CSS ───────────────────────────────────────────────────────────────

export const CFG_SLIDER_CSS = `
  .cfg-slider{-webkit-appearance:none;appearance:none;height:2px;border-radius:9999px;outline:none;cursor:pointer;touch-action:none;padding:10px 0;box-sizing:content-box}
  .cfg-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#fff;border:2.5px solid #D97706;box-shadow:0 1px 6px rgba(217,119,6,.40);cursor:pointer;transition:box-shadow .12s,transform .12s;margin-top:-9px}
  .cfg-slider::-webkit-slider-thumb:hover{box-shadow:0 1px 6px rgba(217,119,6,.40),0 0 0 6px rgba(217,119,6,.12);transform:scale(1.1)}
  .cfg-slider::-webkit-slider-thumb:active{transform:scale(1.2);box-shadow:0 2px 10px rgba(217,119,6,.45),0 0 0 8px rgba(217,119,6,.10)}
  .cfg-slider::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:#fff;border:2.5px solid #D97706;cursor:pointer;box-shadow:0 1px 6px rgba(217,119,6,.40)}
  .cfg-slider::-webkit-slider-runnable-track{height:2px;border-radius:9999px}
  .cfg-slider::-moz-range-track{height:2px;border-radius:9999px}
  .cfg-num::-webkit-inner-spin-button,.cfg-num::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
  .cfg-num{-moz-appearance:textfield}
`;

// ─── Barcode 1D (Code128) ─────────────────────────────────────────────────────

export function Barcode1D({ value, height = 65, barWidth = 2 }: { value: string; height?: number; barWidth?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current || !value) return;
    import('jsbarcode').then(({ default: JsBarcode }) => {
      if (!svgRef.current) return;
      try {
        JsBarcode(svgRef.current, value, {
          format: 'CODE128', width: barWidth, height,
          displayValue: false, margin: 8,
          background: '#ffffff', lineColor: '#000000',
        });
      } catch {
        const safe = value.replace(/[^\x20-\x7E]/g, '');
        try { JsBarcode(svgRef.current!, safe, { format: 'CODE128', width: barWidth, height, displayValue: false, margin: 8 }); } catch { /* ignore */ }
      }
    });
  }, [value, height, barWidth]);
  return <svg ref={svgRef} style={{ width: '100%', display: 'block' }} />;
}

// ─── PropRow ─────────────────────────────────────────────────────────────────

export function PropRow({ label, field, min, max, unit = 'px', labelConfig, onUpdate }: {
  label: string; field: keyof LabelConfig; min: number; max: number; unit?: string;
  labelConfig: LabelConfig; onUpdate: (f: keyof LabelConfig, v: number | boolean) => void;
}) {
  const committed = labelConfig[field] as number;
  const rangeRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (dragging.current || !rangeRef.current) return;
    rangeRef.current.value = String(committed);
    const pct = ((committed - min) / (max - min) * 100).toFixed(1);
    rangeRef.current.style.background = `linear-gradient(to right,#D97706 ${pct}%,#E2E8F0 ${pct}%)`;
  }, [committed, min, max]);

  return (
    <div className="flex items-center gap-2 py-2 border-b border-[#F8FAFC] last:border-0">
      <span className="text-[11px] font-medium text-[#64748B] w-28 shrink-0 leading-tight">{label}</span>
      <input
        ref={rangeRef}
        type="range" min={min} max={max} step={0.01}
        defaultValue={committed}
        className="cfg-slider flex-1 min-w-0"
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onChange={e => {
          const v = Number(e.target.value);
          const pct = ((v - min) / (max - min) * 100).toFixed(1);
          e.target.style.background = `linear-gradient(to right,#D97706 ${pct}%,#E2E8F0 ${pct}%)`;
          onUpdate(field, Math.round(v));
        }}
      />
      <div className="flex items-center shrink-0 rounded-lg overflow-hidden"
        style={{ border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
        <button
          onClick={() => committed > min && onUpdate(field, committed - 1)}
          className="w-6 h-6 flex items-center justify-center text-[14px] leading-none text-[#94A3B8] hover:bg-[#F1F5F9] cursor-pointer transition-colors"
          style={{ borderRight: '1px solid #E2E8F0' }}>−</button>
        <input
          type="number" min={min} max={max} value={committed}
          className="cfg-num w-9 text-center text-[12px] font-mono font-semibold text-[#0F172A] bg-transparent outline-none border-none py-0"
          onChange={e => { const n = Math.min(max, Math.max(min, parseInt(e.target.value) || min)); onUpdate(field, n); }}
        />
        <button
          onClick={() => committed < max && onUpdate(field, committed + 1)}
          className="w-6 h-6 flex items-center justify-center text-[14px] leading-none text-[#94A3B8] hover:bg-[#F1F5F9] cursor-pointer transition-colors"
          style={{ borderLeft: '1px solid #E2E8F0' }}>+</button>
      </div>
      {unit && <span className="text-[10px] text-[#CBD5E1] w-4 shrink-0 font-medium">{unit}</span>}
    </div>
  );
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────

export function ToggleRow({ label, desc, field, labelConfig, onUpdate }: {
  label: string; desc?: string;
  field: keyof LabelConfig;
  labelConfig: LabelConfig;
  onUpdate: (f: keyof LabelConfig, v: boolean) => void;
}) {
  const val = labelConfig[field] as boolean;
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#F8FAFC] last:border-0 gap-3">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-[#334155] leading-tight">{label}</div>
        {desc && <div className="text-[10px] text-[#94A3B8] mt-0.5">{desc}</div>}
      </div>
      <button
        onClick={() => onUpdate(field, !val)}
        className="relative flex items-center rounded-full cursor-pointer transition-colors duration-200 shrink-0"
        style={{ width: 36, height: 20, background: val ? ACENTO : '#CBD5E1' }}>
        <span
          className="absolute bg-white rounded-full shadow-sm transition-all duration-200"
          style={{ width: 14, height: 14, left: val ? '19px' : '3px' }}
        />
      </button>
    </div>
  );
}

// ─── BarcodeCard — etiqueta 150mm × 100mm ────────────────────────────────────

function getStoreName(cod: string): string { return TIENDAS_INICIAL[cod]?.n ?? cod; }

export function BarcodeCard({
  value, palletNum, total, storeCod, pickerLabel, responsibleKey, allCategories,
  totalPickers, tipo = 'P', compact = false, labelConfig, slotId, canonicalId,
  audited, subLabel, footerExtra, storeName: storeNameProp,
  adelanto, adelantoFecha, batch, finishedAt, copia,
  tipoTienda, zonaTienda,
}: {
  value: string; palletNum: number; total: number;
  storeCod: string; pickerLabel: string; responsibleKey: string; allCategories: string[];
  totalPickers: number; tipo?: string; compact?: boolean; labelConfig?: LabelConfig; slotId?: number;
  canonicalId?: string;
  audited?: boolean;
  subLabel?: string;
  footerExtra?: string;
  storeName?: string;
  adelanto?: boolean;             // marca visual de tienda agregada como adelanto
  adelantoFecha?: string | null;  // fecha de despacho a mostrar en la etiqueta
  batch?: string;                 // "Transferir Agrupación" de Odoo (ej. BATCH/39934)
  finishedAt?: string | null;     // date_done de Odoo (naive UTC) — hora de término del picking
  /** Reimpresión de una etiqueta que ya existía: lleva el MISMO #. Se marca para que nadie la pegue
   *  en otro pallet creyendo que es nueva (51SER, 11/09/2026: dos pallets con el mismo #12718). */
  copia?: boolean;
  /** MALL / STRIPCENTER / TIENDA, del catálogo. `null` = el catálogo no lo dice: no se dibuja. */
  tipoTienda?: string | null;
  /** RM / COSTA / REGIÓN NORTE / REGIÓN SUR. `null` = sin dato: no se dibuja. Ver `zonaTienda`. */
  zonaTienda?: string | null;
}) {
  const storeName = storeNameProp ?? getStoreName(storeCod);
  const cfg = { ...DEFAULT_LABEL_CONFIG, ...labelConfig };
  // Los dos rótulos nuevos y la franja KG/CM se escalan con el nombre de la tienda: así siguen la
  // configuración de la etiqueta en vez de quedar clavados, y no suman tamaños sueltos al trinquete.
  const tamRotuloTienda = Math.round(cfg.storeNameFontSize * 0.77);
  const tamUnidadManual = Math.round(cfg.storeNameFontSize * 0.73);
  // El recuadro de KG/CM sube a la altura del código de la tienda (lo pidió el coordinador: «los
  // KG y CM más arriba, casi a la par del Código»). Su ancho y el alto del renglón donde se
  // escribe salen del tamaño del código, así que la franja crece y se achica con la etiqueta.
  const anchoCasilla = Math.round(cfg.storeFontSize * 0.78);
  const altoRenglon  = Math.round(cfg.storeFontSize * 0.46);

  const s = compact ? {
    // innerMinH: 0 → la tarjeta abraza su contenido (no se estira hacia abajo);
    // proporción cercana a la etiqueta real y responsiva al ancho disponible.
    outerMaxW: 340, outerMargin: '0 auto 6px',
    innerPad: '8px 10px 7px', innerMinH: 0,
    respSize: 9, pickerSize: 13, subSize: 11,
    palletSize: 28, deSize: 10,
    catSize: 9, catPad: '2px 6px', catGap: 4, catRadius: 4,
    centerPad: '2px 0',
    // cqw = relativo al ANCHO de la tarjeta (no del viewport) → nunca se desborda/corta
    storeCodeSize: 'clamp(22px, 22cqw, 42px)', storeCodeLS: '1px',
    storeNameSize: 15, storeNameMT: 3,
    barMT: 4, barW: '88%', barH: 36, barBW: 2,
    footerFS: 7, footerDateFS: 9,
  } : {
    outerMaxW: 720, outerMargin: '0 auto 20px',
    innerPad: '20px 22px 14px', innerMinH: 480,
    respSize: 12, pickerSize: cfg.pickerFontSize, subSize: 15,
    palletSize: cfg.palletNumSize, deSize: 13,
    catSize: cfg.catFontSize, catPad: '4px 14px', catGap: 8, catRadius: 8,
    centerPad: '12px 0',
    storeCodeSize: `clamp(${Math.round(cfg.storeFontSize * 0.6)}px, 28vw, ${cfg.storeFontSize}px)`, storeCodeLS: '6px',
    storeNameSize: cfg.storeNameFontSize, storeNameMT: 10,
    barMT: 8, barW: `${cfg.barcodeContainerWidth}%`, barH: cfg.barcodeHeight, barBW: cfg.barcodeBarWidth,
    footerFS: 9, footerDateFS: cfg.dateFontSize,
  };

  // Sub text below pickerLabel: explicit subLabel > totalPickers text > nothing
  const showSubText = compact
    ? totalPickers > 0
    : (subLabel !== undefined ? true : totalPickers > 0);
  const subText = subLabel !== undefined
    ? subLabel
    : `${totalPickers} picker${totalPickers !== 1 ? 's' : ''} en tienda`;

  return (
    <div
      className="picking-label bg-white overflow-hidden print:break-after-page print:rounded-none print:border-0"
      style={{
        maxWidth: s.outerMaxW, margin: s.outerMargin,
        border: `${compact ? 2 : cfg.borderWidth}px solid #E5E7EB`,
        borderRadius: compact ? 12 : cfg.cornerRadius,
        position: 'relative',
        containerType: 'inline-size',  // habilita unidades cqw (el código se ajusta al ancho de la tarjeta)
      }}
    >
      {/* Badge AUDITADO */}
      {audited && !compact && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: '#16A34A', color: '#fff',
          padding: '2px 10px', borderRadius: 6,
          fontFamily: 'Arial Black, sans-serif', fontSize: 11, fontWeight: 900,
          letterSpacing: '0.5px', textTransform: 'uppercase',
          boxShadow: '0 0 0 1.5px #fff, 0 0 0 2.5px #16A34A',
          zIndex: 10,
        }}>
          ✓ Auditado
        </div>
      )}

      {/* Badge ADELANTO (esquina superior izquierda; visible también en compact) */}
      {adelanto && (
        <div style={{
          position: 'absolute', top: compact ? 5 : 8, left: compact ? 5 : 8,
          background: ACENTO, color: '#fff',
          padding: compact ? '1px 6px' : '2px 10px', borderRadius: 6,
          fontFamily: 'Arial Black, sans-serif', fontSize: compact ? 9 : 11, fontWeight: 900,
          letterSpacing: '0.5px', textTransform: 'uppercase',
          boxShadow: '0 0 0 1.5px #fff, 0 0 0 2.5px #D97706',
          zIndex: 10, whiteSpace: 'nowrap',
        }}>
          ⚡ Adelanto{adelantoFecha ? ` · ${adelantoFecha}` : ''}
        </div>
      )}

      <div className="flex flex-col" style={{ padding: s.innerPad, minHeight: s.innerMinH }}>

        {/* Top row */}
        <div className="flex items-start justify-between" style={{ marginBottom: compact ? 3 : 8 }}>
          <div className="min-w-0 flex-1 pr-3">
            {(!compact && cfg.showResponsable || compact) && (
              <div style={{ fontSize: s.respSize, color: ACENTO, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 1 }}>
                {responsibleKey}
              </div>
            )}
            <div style={{ fontSize: s.pickerSize, fontWeight: 800, color: '#111', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickerLabel}
            </div>
            {!compact && showSubText && (
              <div style={{ fontSize: s.subSize, color: GRIS, marginTop: 4, fontWeight: 500 }}>
                {subText}
              </div>
            )}
            {/* Los chips de contenido van ACA, pegados al nombre del picker. Antes eran una fila
                propia mas abajo y la etiqueta quedaba cargada hacia el codigo de barras. */}
            {!compact && allCategories.length > 0 && cfg.showCategories && (
              <div style={{ display: 'flex', gap: s.catGap, flexWrap: 'wrap', marginTop: 10 }}>
                {allCategories.map(c => (
                  <span key={c} style={{
                    fontSize: s.catSize, fontWeight: 800, color: TINTA,
                    background: 'rgba(17,24,39,0.09)', borderRadius: s.catRadius,
                    padding: s.catPad, letterSpacing: '0.5px',
                  }}>{c}</span>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-barlow-condensed font-black text-amber-600 leading-none" style={{ fontSize: s.palletSize }}>
              {tipo}-{palletNum}
            </div>
            <div style={{ fontSize: s.deSize, color: '#aaa', textAlign: 'right', fontWeight: 600 }}>de {total}</div>
            {slotId != null && (
              <div style={{ fontSize: compact ? 10 : cfg.slotIdFontSize, fontWeight: 900, color: '#1A2550', textAlign: 'right', marginTop: compact ? 1 : 4, fontFamily: 'monospace', letterSpacing: '0.5px' }}>
                #{slotId}
              </div>
            )}
            {copia && (
              // Negro y con borde: tiene que leerse en una impresora blanco y negro.
              <div style={{
                marginTop: compact ? 2 : 6, display: 'inline-block', float: 'right',
                fontSize: compact ? 9 : Math.max(14, Math.round(cfg.slotIdFontSize * 0.9)), fontWeight: 900,
                color: '#000', border: `${compact ? 1 : 2}px solid #000`, borderRadius: 4,
                padding: compact ? '0 4px' : '1px 8px', letterSpacing: '1px',
              }}>
                COPIA
              </div>
            )}
          </div>
        </div>

        {/* Categorias — en la etiqueta grande ya salieron arriba, junto al picker */}
        {compact && allCategories.length > 0 && (
          <div style={{ display: 'flex', gap: s.catGap, marginBottom: 3, flexWrap: 'wrap' }}>
            {allCategories.map(c => (
              <span key={c} style={{
                fontSize: s.catSize, fontWeight: 800, color: '#1A2550',
                background: 'rgba(26,37,80,0.09)', borderRadius: s.catRadius,
                padding: s.catPad, letterSpacing: '0.5px',
              }}>{c}</span>
            ))}
          </div>
        )}

        {/* Batch (Transferir Agrupación) + Hora término — solo etiqueta grande, solo si hay dato */}
        {!compact && (() => {
          const showBatchVal  = !!batch && cfg.showBatch;
          const showFinishVal = !!finishedAt && cfg.showFinishTime;
          if (!showBatchVal && !showFinishVal) return null;
          const microStyle = { fontSize: 12, color: GRIS, fontWeight: 700 as const, textTransform: 'uppercase' as const, letterSpacing: '0.5px' };
          return (
            // Apretado contra las dos rayas, sin margen abajo: el coordinador pidio subirlo.
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              padding: '8px 0',
              borderTop: `1.5px solid ${RAYA}`, borderBottom: `1.5px solid ${RAYA}`,
            }}>
              <div>
                {showBatchVal && (
                  <>
                    <div style={microStyle}>Agrupación</div>
                    <div style={{ fontSize: cfg.batchFontSize, fontWeight: 900, color: '#111', fontFamily: 'monospace', lineHeight: 1.1 }}>{batch}</div>
                  </>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                {showFinishVal && (
                  <>
                    <div style={microStyle}>Término</div>
                    <div style={{ fontSize: cfg.finishTimeFontSize, fontWeight: 900, color: '#111', lineHeight: 1.1 }}>
                      {fmtHoraChile(odooDateToISO(finishedAt))}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* LA TIENDA, Y A SU LADO DONDE SE ESCRIBE.
            El CODIGO manda: es lo que se lee a diez metros. El nombre y los dos rotulos lo
            acompanan en la MISMA linea, sin gastar una fila entera y sin competirle.
            Los recuadros de KG y CM suben hasta aca —antes flanqueaban el codigo de barras, muy
            abajo— y los separa una raya vertical, porque "que tienda es" y "que hay que escribir"
            son dos cosas distintas. El codigo de barras queda limpio debajo: un plumon encima lo
            arruinaria, y por eso el espacio para escribir nunca va sobre el. */}
        {!compact ? (
          <div className="flex-1" style={{ display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', gap: 22, padding: s.centerPad }}>
            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="font-barlow-condensed font-black text-gray-900 uppercase leading-none"
                style={{ fontSize: s.storeCodeSize, letterSpacing: s.storeCodeLS }}>
                {storeCod}
              </div>
              {(cfg.showStoreName || tipoTienda || zonaTienda) && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginTop: s.storeNameMT }}>
                  {cfg.showStoreName && (
                    <span className="font-barlow-condensed font-semibold uppercase tracking-wide"
                      style={{ fontSize: s.storeNameSize, color: GRIS, whiteSpace: 'nowrap' }}>
                      {storeName}
                    </span>
                  )}
                  {(tipoTienda || zonaTienda) && (
                    <span style={{ display: 'flex', gap: 8 }}>
                      {tipoTienda && (
                        <span className="font-barlow-condensed" style={{
                          fontSize: tamRotuloTienda, fontWeight: 900, letterSpacing: '2px', color: '#fff',
                          background: TINTA, borderRadius: 6, padding: '1px 14px', lineHeight: 1.25, whiteSpace: 'nowrap',
                        }}>{tipoTienda}</span>
                      )}
                      {zonaTienda && (
                        <span className="font-barlow-condensed" style={{
                          fontSize: tamRotuloTienda, fontWeight: 900, letterSpacing: '2px', color: TINTA,
                          border: `2.5px solid ${TINTA}`, borderRadius: 6, padding: '0 14px', lineHeight: 1.25, whiteSpace: 'nowrap',
                        }}>{zonaTienda}</span>
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, width: 2, background: RAYA }} />

            <div style={{ flexShrink: 0, display: 'flex', gap: 14 }}>
              {(['KG', 'CM'] as const).map(rotulo => (
                <div key={rotulo} style={{
                  width: anchoCasilla, border: `4px solid ${TINTA}`, borderRadius: 11,
                  padding: '12px 14px 8px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{ flex: 1, minHeight: altoRenglon, borderBottom: `3px solid ${RAYA}` }} />
                  <div className="font-barlow-condensed" style={{
                    fontSize: tamUnidadManual, fontWeight: 900, letterSpacing: '4px', lineHeight: 1.05,
                    marginTop: 5, color: TINTA, textAlign: rotulo === 'CM' ? 'right' : 'left',
                  }}>{rotulo}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: s.centerPad }}>
            <div className="font-barlow-condensed font-black text-gray-900 tracking-widest uppercase leading-none"
              style={{ fontSize: s.storeCodeSize, letterSpacing: s.storeCodeLS }}>
              {storeCod}
            </div>
            <div className="font-barlow-condensed font-semibold text-gray-600 uppercase tracking-wide"
              style={{ fontSize: s.storeNameSize, marginTop: s.storeNameMT }}>
              {storeName}
            </div>
          </div>
        )}

        {/* Código de barras — y, a los lados, el espacio para escribir el peso y la altura.
            ARRIBA del código no: el lector tiene que seguir viendo el código limpio, y un plumón
            encima lo arruina. Por eso van flanqueándolo y no debajo.
            La raya es dónde se escribe; la palabra, abajo, es el rótulo. Solo etiqueta grande. */}
        <div style={{ marginTop: s.barMT }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: s.barW, flexShrink: 0 }}>
              <Barcode1D
                value={canonicalId || (slotId != null ? String(slotId) : value)}
                height={s.barH} barWidth={s.barBW}
              />
            </div>
          </div>
          {/* El pie, LEJOS del borde: quedaba a 2 px y la impresora se lo comia. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: compact ? 2 : 6, marginBottom: compact ? 0 : 10 }}>
            <div style={{ fontSize: s.footerFS, fontFamily: 'monospace', color: compact ? '#bbb' : GRIS, fontWeight: compact ? 400 : 600, wordBreak: 'break-all', lineHeight: 1.2, flex: 1 }}>
              {footerExtra && !compact && (
                <span style={{ fontWeight: 700, color: '#555', marginRight: 8 }}>{footerExtra}</span>
              )}
              {canonicalId
                ? (slotId != null ? `${canonicalId}  ·  #${slotId}` : canonicalId)
                : (slotId != null ? `ID #${slotId}` : value)}
            </div>
            {(compact || cfg.showDate) && (
              <div style={{ fontSize: s.footerDateFS, fontWeight: 700, color: compact ? '#888' : TINTA, fontFamily: 'monospace', whiteSpace: 'nowrap', marginLeft: 6 }}>
                {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
