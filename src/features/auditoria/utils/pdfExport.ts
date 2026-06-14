import { CORR_COLORS, CORR_LABEL } from '../constants';
import type { AuditEntry, TipoError } from '../types';

function calcAuditado(u: number, tipo: TipoError, esp: number) {
  return tipo === 'faltante' ? esp - u : esp + u;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function exportarPDF(entries: AuditEntry[], fechaLabel: string) {
  const totalBueno = entries.filter(e => e.resultado === 'bueno').length;
  const totalMalo = entries.filter(e => e.resultado === 'malo').length;
  const passPct = entries.length ? Math.round((totalBueno / entries.length) * 100) : 0;
  const filas = entries.map(e => {
    const ops = e.operaciones?.map(op => op.codigo).join(', ') || '—';
    const cc = CORR_COLORS[e.correccion];
    const extras = [
      e.productos?.length ? `<tr><td colspan="9" style="font-size:10px;color:#555;padding:2px 8px 5px;border-bottom:1px solid #eee"><b>Productos:</b> ${e.productos.map(p => { const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`; return `[${escapeHtml(p.codigo)}] ${escapeHtml(p.nombre)} <span style="color:${p.tipo === 'faltante' ? '#D32F2F' : '#D97706'}">${escapeHtml(p.tipo)} ${r}</span>`; }).join(' | ')}</td></tr>` : '',
      e.observaciones ? `<tr><td colspan="9" style="font-size:10px;color:#555;font-style:italic;padding:2px 8px 5px;border-bottom:1px solid #eee"><b>Obs:</b> ${escapeHtml(e.observaciones)}</td></tr>` : '',
    ].join('');
    const reaud = e.reauditoriaDeId ? ' <span style="background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:3px;font-size:9px">↩ Re</span>' : '';
    const pickerDisp = e.picker ? escapeHtml(e.picker) : '—';
    return `<tr><td>${escapeHtml(e.hora)}${reaud}</td><td><b>${escapeHtml(e.tiendaNombre)}</b></td><td>${pickerDisp}</td><td>${escapeHtml(e.auditor)}</td><td style="text-transform:capitalize">${escapeHtml(e.tipo)}</td><td style="text-align:center">${e.pallets}</td><td style="font-family:monospace;font-size:10px">${ops}</td><td style="color:${cc};font-weight:bold">${CORR_LABEL[e.correccion]}</td><td style="text-align:center"><span style="padding:2px 8px;border-radius:4px;font-weight:bold;font-size:11px;background:${e.resultado === 'bueno' ? 'rgba(22,163,74,0.12)' : 'rgba(211,47,47,0.12)'};color:${e.resultado === 'bueno' ? '#16A34A' : '#D32F2F'}">${e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}</span></td></tr>${extras}`;
  }).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe ${fechaLabel}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:12px;color:#1a2550;padding:24px}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid #1a2550;padding-bottom:12px}h1{font-size:20px;font-weight:900;text-transform:uppercase;letter-spacing:2px}.stats{display:flex;gap:12px;margin-bottom:20px}.stat{padding:10px 20px;border-radius:8px;text-align:center}.stat .n{font-size:24px;font-weight:900}.stat .l{font-size:10px;text-transform:uppercase}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#1a2550;color:#fff;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:6px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}tr:nth-child(even) td{background:#f9fafb}.footer{margin-top:36px;border-top:1px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-around;font-size:11px;color:#666}@media print{button{display:none!important}}</style></head>
<body><div class="header"><div><h1>Informe de Auditoría</h1><div style="font-size:11px;color:#888;margin-top:2px">Fecha: <b>${fechaLabel}</b> · Generado: ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</div></div>
<button onclick="window.print()" style="padding:8px 18px;background:#1a2550;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold">🖨 Imprimir / PDF</button></div>
<div class="stats"><div class="stat" style="background:#f0f2f7;color:#1a2550"><div class="n">${entries.length}</div><div class="l">Total</div></div><div class="stat" style="background:rgba(22,163,74,0.10);color:#16A34A"><div class="n">${totalBueno}</div><div class="l">Bueno</div></div><div class="stat" style="background:rgba(211,47,47,0.10);color:#D32F2F"><div class="n">${totalMalo}</div><div class="l">Malo</div></div><div class="stat" style="background:rgba(26,37,80,0.08);color:#1a2550"><div class="n">${passPct}%</div><div class="l">Aprobación</div></div></div>
<table><thead><tr><th>Hora</th><th>Tienda</th><th>Picker</th><th>Auditor</th><th>Tipo</th><th>Pallets</th><th>Operaciones</th><th>Corrección</th><th>Resultado</th></tr></thead><tbody>${filas}</tbody></table>
<div class="footer"><div>Firma Auditor: ___________________________</div><div>Firma Supervisor: ___________________________</div></div></body></html>`;
  const win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
}
