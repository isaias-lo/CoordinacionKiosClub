'use client';

import { useEffect, useRef } from 'react';
import { TIENDAS_INICIAL } from '@/features/despacho/rutas/data/tiendas';

// ─── LabelConfig ─────────────────────────────────────────────────────────────

export interface LabelConfig {
  borderWidth: number;           // 0–4
  pickerFontSize: number;        // 20–50
  storeFontSize: number;         // 80–200
  catFontSize: number;           // 12–30
  barcodeBarWidth: number;       // 1–4
  barcodeHeight: number;         // 40–130
  barcodeContainerWidth: number; // 60–100 (%)
  showResponsable: boolean;
  showCategories: boolean;
  showStoreName: boolean;
  dateFontSize: number;          // 8–20
  palletNumSize: number;         // 50–120
  storeNameFontSize: number;     // 24–72
  cornerRadius: number;          // 0–20
  showDate: boolean;
  slotIdFontSize: number;        // 10–28
}

export const DEFAULT_LABEL_CONFIG: LabelConfig = {
  borderWidth: 2, pickerFontSize: 34, storeFontSize: 128, catFontSize: 22,
  barcodeBarWidth: 2, barcodeHeight: 113, barcodeContainerWidth: 85,
  showResponsable: true, showCategories: true, showStoreName: true,
  dateFontSize: 12, palletNumSize: 80, storeNameFontSize: 52, cornerRadius: 12, showDate: true,
  slotIdFontSize: 18,
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
        style={{ width: 36, height: 20, background: val ? '#D97706' : '#CBD5E1' }}>
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
}: {
  value: string; palletNum: number; total: number;
  storeCod: string; pickerLabel: string; responsibleKey: string; allCategories: string[];
  totalPickers: number; tipo?: string; compact?: boolean; labelConfig?: LabelConfig; slotId?: number;
  canonicalId?: string;
  audited?: boolean;
  subLabel?: string;
  footerExtra?: string;
  storeName?: string;
}) {
  const storeName = storeNameProp ?? getStoreName(storeCod);
  const cfg = { ...DEFAULT_LABEL_CONFIG, ...labelConfig };

  const s = compact ? {
    outerMaxW: 340, outerMargin: '0 auto 6px',
    innerPad: '8px 10px 6px', innerMinH: 155,
    respSize: 9, pickerSize: 13, subSize: 11,
    palletSize: 28, deSize: 10,
    catSize: 9, catPad: '2px 6px', catGap: 4, catRadius: 4,
    centerPad: '4px 0',
    storeCodeSize: 'clamp(36px, 7vw, 52px)', storeCodeLS: '2px',
    storeNameSize: 17, storeNameMT: 3,
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

      <div className="flex flex-col" style={{ padding: s.innerPad, minHeight: s.innerMinH }}>

        {/* Top row */}
        <div className="flex items-start justify-between" style={{ marginBottom: compact ? 3 : 8 }}>
          <div className="min-w-0 flex-1 pr-3">
            {(!compact && cfg.showResponsable || compact) && (
              <div style={{ fontSize: s.respSize, color: '#D97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 1 }}>
                {responsibleKey}
              </div>
            )}
            <div style={{ fontSize: s.pickerSize, fontWeight: 800, color: '#111', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pickerLabel}
            </div>
            {!compact && showSubText && (
              <div style={{ fontSize: s.subSize, color: '#888', marginTop: 4, fontWeight: 500 }}>
                {subText}
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
          </div>
        </div>

        {/* Categorías / guías */}
        {allCategories.length > 0 && (cfg.showCategories || compact) && (
          <div style={{ display: 'flex', gap: s.catGap, marginBottom: compact ? 3 : 8, flexWrap: 'wrap' }}>
            {allCategories.map(c => (
              <span key={c} style={{
                fontSize: s.catSize, fontWeight: 800, color: '#1A2550',
                background: 'rgba(26,37,80,0.09)', borderRadius: s.catRadius,
                padding: s.catPad, letterSpacing: '0.5px',
              }}>{c}</span>
            ))}
          </div>
        )}

        {/* Centro: código + nombre + dirección */}
        <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ padding: s.centerPad }}>
          <div className="font-barlow-condensed font-black text-gray-900 tracking-widest uppercase leading-none"
            style={{ fontSize: s.storeCodeSize, letterSpacing: s.storeCodeLS }}>
            {storeCod}
          </div>
          {(cfg.showStoreName || compact) && (
            <div className="font-barlow-condensed font-semibold text-gray-600 uppercase tracking-wide"
              style={{ fontSize: s.storeNameSize, marginTop: s.storeNameMT }}>
              {storeName}
            </div>
          )}
        </div>

        {/* Código de barras */}
        <div style={{ marginTop: s.barMT }}>
          <div style={{ width: s.barW, margin: '0 auto' }}>
            <Barcode1D
              value={canonicalId || (slotId != null ? String(slotId) : value)}
              height={s.barH} barWidth={s.barBW}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <div style={{ fontSize: s.footerFS, fontFamily: 'monospace', color: '#bbb', wordBreak: 'break-all', lineHeight: 1.2, flex: 1 }}>
              {footerExtra && !compact && (
                <span style={{ fontWeight: 700, color: '#555', marginRight: 8 }}>{footerExtra}</span>
              )}
              {canonicalId
                ? (slotId != null ? `${canonicalId}  ·  #${slotId}` : canonicalId)
                : (slotId != null ? `ID #${slotId}` : value)}
            </div>
            {(compact || cfg.showDate) && (
              <div style={{ fontSize: s.footerDateFS, fontWeight: 700, color: '#888', fontFamily: 'monospace', whiteSpace: 'nowrap', marginLeft: 6 }}>
                {new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
