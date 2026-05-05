import { TMPL_B64 } from '../../../../data/template';
import type { DispatchItem } from '../../../../types';
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

function doExport(XLSX: typeof import('xlsx'), b64: string, rows: ExportRow[], filename: string) {
  const bin   = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const wb = XLSX.read(bytes, { type: 'array' });

  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('carga')) ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('Plantilla sin hojas');
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('Hoja no encontrada');

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:AB999');
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

export async function exportToTemplate(rows: ExportRow[], filename: string): Promise<void> {
  if (!rows.length) return;
  const XLSX = await import('xlsx');

  // Attempt 1: custom template from localStorage
  const saved = localStorage.getItem('templateB64');
  if (saved) {
    try {
      doExport(XLSX, saved, rows, filename);
      return;
    } catch {
      // Corrupted saved template — purge it and fall through to bundled
      localStorage.removeItem('templateB64');
    }
  }

  // Attempt 2: bundled template (always valid)
  doExport(XLSX, TMPL_B64, rows, filename);
}
