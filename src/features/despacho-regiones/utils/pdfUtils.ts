import type { PdfData, PdfGuia } from '../../../types';

export async function processPdf(file: File): Promise<PdfData> {
  // webpackIgnore evita que Next.js re-bundle pdfjs (que ya es un bundle webpack interno)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore – URL runtime, no resoluble por TypeScript
  const pdfjsLib = await import(/* webpackIgnore: true */ '/pdf.min.mjs') as typeof import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const ab = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise;

  let text = '';
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const c = await page.getTextContent();
      text += (c.items as { str: string }[]).map(s => s.str).join(' ') + '\n';
    }
  } finally {
    await pdf.destroy();
  }

  return parseGuias(text, file.name);
}

function parseGuias(text: string, fileName: string): PdfData {
  const seen = new Set<string>();
  const guiaNums: string[] = [];

  // Patrones para distintos formatos de guías chilenas
  const guiaPatterns: RegExp[] = [
    /N[°º°º][^0-9]{0,6}(\d{4,8})/g,   // N° 12345 / N°: 12345
    /[Nn]ro\.?\s*:?\s*(\d{4,8})/g,                // Nro. 12345 / Nro:12345
    /[Gg]u[ií]a[^0-9]{0,10}(\d{4,8})/g,           // Guía 12345 / Guia N° 12345
    /[Nn][uú]mero\s*:?\s*(\d{4,8})/g,             // Número: 12345
    /\bFolio\s*:?\s*(\d{4,8})\b/g,                // Folio: 12345
  ];

  for (const pattern of guiaPatterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        guiaNums.push(m[1]);
      }
    }
  }

  // Patrones para el monto total
  const totalPatterns: RegExp[] = [
    /[Tt]otal\s*[Nn]eto\s*:?\s*\$?\s*([\d.,]+)/g,
    /[Tt]otal\s*:?\s*\$?\s*([\d.,]+)/g,
    /[Mm]onto\s*[Tt]otal\s*:?\s*\$?\s*([\d.,]+)/g,
    /[Ii]mporte\s*:?\s*\$?\s*([\d.,]+)/g,
  ];

  const totals: number[] = [];
  for (const pattern of totalPatterns) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const val = parseInt(m[1].replace(/\./g, '').replace(',', '.'));
      if (!isNaN(val) && val > 0) totals.push(val);
    }
    if (totals.length) break;
  }

  const guias: PdfGuia[] = guiaNums.map((num, i) => ({
    num,
    total: totals[i] || 0,
  }));

  const totalSum = totals.length === 1
    ? totals[0]
    : guias.reduce((a, g) => a + g.total, 0);

  return { fileName, guias, totalSum };
}
