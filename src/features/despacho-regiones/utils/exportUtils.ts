import * as XLSX from 'xlsx';
import { TMPL_B64 } from '../../../data/template';
import type { DispatchItem } from '../../../types';
import { TIENDAS } from '../data/tiendas';

// 27 columnas exactas que espera la plantilla "Carga tus pedidos"
type ExportRow = [
  string, string, string, string, string,
  string|number, string, string, string, string, string, string,
  string, string, string,
  number, number|'', number|'', number|'',
  string, string, string, number|'',
  number, string, string, string
];

export function buildRows(
  dispatchData: Record<string, DispatchItem[]>,
  filter: Record<string, Set<number>> | null = null
): ExportRow[] {
  const rows: ExportRow[] = [];
  for (const [name, items] of Object.entries(dispatchData)) {
    if (!items.length) continue;
    const t = TIENDAS[name];
    if (!t) continue;
    items.forEach((item, idx) => {
      if (filter && !filter[name]?.has(idx)) return;
      rows.push([
        'Bodega', item.orden, item.tipo,
        t.nombre_dest, t.email,
        parseInt(t.celular) || t.celular,
        t.rut, t.region_sendu, t.comuna, '', '', '',
        t.calle, t.numero, t.complemento,
        item.peso, item.alto || '', item.ancho || '', item.largo || '',
        'No', 'Guia', item.guia || '', item.valor || '',
        1, '', t.str_val, item.pkg,
      ]);
    });
  }
  return rows;
}

export function exportToTemplate(rows: ExportRow[], filename: string) {
  if (!rows.length) return;
  const b64 = localStorage.getItem('templateB64') || TMPL_B64;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const wb = XLSX.read(bytes, { type: 'array' });
  const ws = wb.Sheets['Carga tus pedidos'];

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:AA999');
  for (let r = 1; r <= range.e.r; r++)
    for (let c = 0; c <= 26; c++)
      delete ws[XLSX.utils.encode_cell({ r, c })];

  rows.forEach((row, ri) => {
    row.forEach((val, ci) => {
      if (val === '' || val === null || val === undefined) return;
      ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = {
        v: val,
        t: typeof val === 'number' ? 'n' : 's',
      };
    });
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: 26 } });
  XLSX.writeFile(wb, filename);
}
