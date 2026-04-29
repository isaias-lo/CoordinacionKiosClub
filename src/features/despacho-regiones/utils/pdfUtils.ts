import type { PdfData, PdfGuia } from '../../../types';

export async function processPdf(file: File): Promise<PdfData> {
  // Importación dinámica para evitar que pdfjs-dist (que usa DOMMatrix) se cargue en el servidor
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const c = await page.getTextContent();
    text += (c.items as { str: string }[]).map(s => s.str).join(' ') + '\n';
  }

  return parseGuias(text, file.name);
}

function parseGuias(text: string, fileName: string): PdfData {
  const gr = /N[°º]\s*[:\s]\s*(\d{5,7})/g;
  const tr = /Total\s*:\s*\$\s*([\d.,]+)/g;

  const guiaNums: string[] = [];
  const totals: number[] = [];
  let m: RegExpExecArray | null;

  while ((m = gr.exec(text)) !== null) guiaNums.push(m[1]);
  while ((m = tr.exec(text)) !== null) totals.push(parseInt(m[1].replace(/\./g, '').replace(',', '.')));

  const seen = new Set<string>();
  const guias: PdfGuia[] = [];
  for (const n of guiaNums) {
    if (!seen.has(n)) {
      seen.add(n);
      guias.push({ num: n, total: totals[guias.length] || 0 });
    }
  }

  const totalSum = guias.reduce((a, g) => a + g.total, 0);
  return { fileName, guias, totalSum };
}
