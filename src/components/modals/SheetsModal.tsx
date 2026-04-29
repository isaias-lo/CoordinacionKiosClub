import { useApp } from '../../context/AppContext';

const APPS_SCRIPT_CODE = `// ─── KiosClub Despacho · Script combinado ───────────────────────────────────
// Pega este código en Extensions → Apps Script del Google Sheet donde
// ya tenías la integración con Santiago. Luego re-implementa.
// ─────────────────────────────────────────────────────────────────────────────
const SS = SpreadsheetApp.getActiveSpreadsheet();

const HEADERS = {
  DespachoSantiago: [
    'ID','FECHA','COD','TIENDA','TIPO','REGIMEN','TRANSPORTE','CARGA',
    'REGION','COMUNA','TIPO_COMUNA','PESO_KG','ALTO','LARGO','ANCHO',
    'PESO_V','VENTANA','ESTADO','N_PALLET_BULTO','FECHA_LLEGADA'
  ],
  DespachoRegiones: [
    'ID','FECHA','COD','TIENDA','REGION','COMUNA',
    'TIPO','CONTENIDO','ORDEN','PESO_KG','ALTO','ANCHO','LARGO','GUIA','VALOR'
  ],
};

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  if (data.action === 'write') {
    writeRows(data.rows, data.sheetName || 'DespachoSantiago');
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function writeRows(rows, sheetName) {
  let sheet = SS.getSheetByName(sheetName);
  if (!sheet) {
    sheet = SS.insertSheet(sheetName);
    sheet.appendRow(HEADERS[sheetName] || HEADERS['DespachoSantiago']);
    sheet.setFrozenRows(1);
  }
  rows.forEach(function(r) {
    if (sheetName === 'DespachoSantiago') {
      sheet.appendRow([
        r.ID, r.FECHA, r.COD, r.TIENDA, r.TIPO, r.REGIMEN, r.TRANSPORTE,
        r.CARGA, r.REGION, r.COMUNA, r.TIPO_COMUNA, r.PESO_KG, r.ALTO,
        r.LARGO, r.ANCHO, r.PESO_V, r.VENTANA, r.ESTADO, r.N_PALLET_BULTO,
        r.FECHA_LLEGADA
      ]);
    } else if (sheetName === 'DespachoRegiones') {
      sheet.appendRow([
        r.ID, r.FECHA, r.COD, r.TIENDA, r.REGION, r.COMUNA,
        r.TIPO, r.CONTENIDO, r.ORDEN, r.PESO_KG, r.ALTO, r.ANCHO,
        r.LARGO, r.GUIA, r.VALOR
      ]);
    }
  });
}`;

interface Props { open: boolean; onClose: () => void; }

export function SheetsModal({ open, onClose }: Props) {
  const { showToast } = useApp();

  if (!open) return null;

  const copyScript = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE)
      .then(() => showToast('✓ Código copiado al portapapeles', '#16A34A'))
      .catch(() => showToast('Selecciona y copia el código manualmente', '#D97706'));
  };

  return (
    <div className="fixed inset-0 bg-navy/60 z-[500] flex items-end backdrop-blur-sm"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[20px] px-4 pb-9 pt-6 w-full max-h-[85vh] overflow-y-auto"
           style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.2)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />
        <h3 className="font-barlow-condensed text-[22px] font-bold text-navy mb-1 tracking-wide">
          🔗 Google Sheets — Configuración
        </h3>
        <p className="text-sm text-text-2 mb-4">
          Despacho Regiones escribe en la pestaña <strong>DespachoRegiones</strong> y
          Despacho Santiago en <strong>DespachoSantiago</strong>, ambas en el mismo Google Sheet.
          Si ya tienes el script de Santiago desplegado, actualízalo con el código de abajo.
        </p>

        <div className="bg-[rgba(22,163,74,0.08)] border border-[rgba(22,163,74,0.25)] rounded-btn px-3 py-2.5 mb-4 text-[12px] text-success">
          ✓ URL configurada permanentemente · No requiere ajuste
        </div>

        <div className="bg-bg-2 rounded-btn px-3 py-3 text-[12px] text-text-2 leading-relaxed mb-3">
          <strong className="text-navy">📋 Actualizar script existente (5 min):</strong><br />
          1. Abre tu Google Sheet · <strong>Extensiones → Apps Script</strong><br />
          2. Reemplaza <strong>todo</strong> el código por el de abajo<br />
          3. <strong>Implementar → Administrar implementaciones → ✏ Editar</strong><br />
          4. Guarda una nueva versión y haz clic en <strong>Implementar</strong>
        </div>

        <div className="bg-navy rounded-btn px-3 py-3 overflow-x-auto mb-1">
          <pre className="font-mono text-[10px] text-cyan-300 whitespace-pre-wrap break-all">{APPS_SCRIPT_CODE}</pre>
        </div>
        <button onClick={copyScript}
          className="w-full py-2.5 bg-bg-2 border-[1.5px] border-border rounded-btn font-barlow text-[13px] cursor-pointer text-text-2 mb-0.5">
          📋 Copiar código Apps Script
        </button>

        <button onClick={onClose}
          className="w-full mt-3 py-3.5 bg-red text-white rounded-card border-none font-barlow-condensed text-lg font-bold cursor-pointer"
          style={{ boxShadow: '0 4px 14px rgba(211,47,47,0.28)' }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
