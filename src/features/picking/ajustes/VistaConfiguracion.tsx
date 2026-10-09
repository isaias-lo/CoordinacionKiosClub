'use client';

// Configuración en escritorio: etiqueta, nombres de pickers y pantalla, en pestañas.
// Diseño: /mnt/project-files/disenos/picking/Configuracion.dc.html. Los cambios se guardan solos,
// igual que antes (ConfigTab): por eso no hay botón «Guardar cambios».

import { useEffect, useState } from 'react';
import { LabelConfig, DEFAULT_LABEL_CONFIG, BarcodeCard } from '@/features/despacho/shared/BarcodeCard';
import { InlineConfirm } from '../components/InlineConfirm';

type Pestana = 'etiqueta' | 'nombres' | 'pantalla';
type Numero = { [K in keyof LabelConfig]: LabelConfig[K] extends number ? K : never }[keyof LabelConfig];
type Interruptor = { [K in keyof LabelConfig]: LabelConfig[K] extends boolean ? K : never }[keyof LabelConfig];

const TIPOGRAFIA: { label: string; field: Numero; min: number; max: number }[] = [
  { label: 'Picker', field: 'pickerFontSize', min: 20, max: 50 },
  { label: 'N.º pallet', field: 'palletNumSize', min: 50, max: 120 },
  { label: 'Código (#)', field: 'slotIdFontSize', min: 10, max: 28 },
  { label: 'Código tienda', field: 'storeFontSize', min: 80, max: 240 },
  { label: 'Nombre tienda', field: 'storeNameFontSize', min: 24, max: 72 },
  { label: 'Secciones', field: 'catFontSize', min: 12, max: 30 },
  { label: 'Fecha', field: 'dateFontSize', min: 8, max: 48 },
  { label: 'Batch', field: 'batchFontSize', min: 14, max: 60 },
  { label: 'Hora de término', field: 'finishTimeFontSize', min: 12, max: 48 },
];
const BARRAS: { label: string; field: Numero; min: number; max: number; unidad?: string }[] = [
  { label: 'Grosor de barras', field: 'barcodeBarWidth', min: 1, max: 4, unidad: '' },
  { label: 'Altura', field: 'barcodeHeight', min: 40, max: 130 },
  { label: 'Ancho', field: 'barcodeContainerWidth', min: 60, max: 100, unidad: '%' },
];
const FORMA: { label: string; field: Numero; min: number; max: number }[] = [
  { label: 'Grosor del borde', field: 'borderWidth', min: 0, max: 4 },
  { label: 'Radio de esquinas', field: 'cornerRadius', min: 0, max: 20 },
];
const MUESTRA: { label: string; desc: string; field: Interruptor }[] = [
  { label: 'Responsable', desc: 'El nombre en Odoo, por ejemplo Pickers 3', field: 'showResponsable' },
  { label: 'Secciones', desc: 'Comida, Aseo… bajo el nombre', field: 'showCategories' },
  { label: 'Nombre de la tienda', desc: 'Texto bajo el código', field: 'showStoreName' },
  { label: 'Fecha de impresión', desc: 'Abajo, junto al código de barras', field: 'showDate' },
  { label: 'Batch', desc: 'Solo si el encargado tiene uno', field: 'showBatch' },
  { label: 'Hora de término', desc: 'Cuándo se terminó el picking', field: 'showFinishTime' },
];

const ESCALA = 0.5;

function Deslizador({ label, valor, min, max, unidad = 'px', onCambio }: {
  label: string; valor: number; min: number; max: number; unidad?: string; onCambio: (v: number) => void;
}) {
  const id = `desl-${label}`;
  const pct = `${(((valor - min) / (max - min)) * 100).toFixed(1)}%`;
  return (
    <div className="pk-desl">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={min} max={max} step={1} value={valor}
        style={{ ['--pct' as string]: pct }} onChange={e => onCambio(Number(e.target.value))} />
      <span className="n">{valor}{unidad ? ` ${unidad}` : ''}</span>
    </div>
  );
}

interface Props {
  labelConfig: LabelConfig;
  onLabelConfigChange: (cfg: LabelConfig) => void;
  pickerKeys: string[];
  canonicalNames: Record<string, string>;
  esAgregado: (key: string) => boolean;
  onGuardarNombre: (key: string, val: string) => void;
  onAgregarPicker: (key: string) => string | null;
  onQuitarPicker: (key: string) => void;
  colsPerRow: number;
  onColsPerRowChange: (n: number) => void;
}

export function VistaConfiguracion(p: Props) {
  const [pestana, setPestana] = useState<Pestana>('etiqueta');
  const [restaurar, setRestaurar] = useState(false);
  const cfg = p.labelConfig;
  const upd = (field: keyof LabelConfig, val: number | boolean) => p.onLabelConfigChange({ ...cfg, [field]: val });
  const conNombre = p.pickerKeys.filter(k => p.canonicalNames[k]).length;

  return (
    <main className="pk-main pk-seguimiento" aria-label="Configuración">
      <div className="pk-head" style={{ paddingBottom: 0 }}>
        <div className="pk-hrow">
          <span className="pk-h1">Configuración</span>
          <span className="pk-sp" />
          <span className="pk-sub">Los cambios se guardan solos.</span>
          {pestana === 'etiqueta' && (
            <button type="button" className="pk-btn" onClick={() => setRestaurar(true)}>Restaurar valores de fábrica</button>
          )}
        </div>
        {restaurar && (
          <div style={{ maxWidth: 520 }}>
            <InlineConfirm tone="warning" message="¿Volver la etiqueta a como venía de fábrica? Se pierden los tamaños y opciones que ajustaste."
              confirmLabel="Restaurar" onCancel={() => setRestaurar(false)}
              onConfirm={() => { p.onLabelConfigChange({ ...DEFAULT_LABEL_CONFIG }); setRestaurar(false); }} />
          </div>
        )}
        <div className="pk-tabs" role="tablist" aria-label="Configuración">
          {([['etiqueta', 'Etiqueta'], ['nombres', 'Nombres de pickers'], ['pantalla', 'Pantalla']] as const).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={pestana === k}
              className={`pk-tab${pestana === k ? ' on' : ''}`} onClick={() => setPestana(k)}>
              {l}{k === 'nombres' && <span className="k">{conNombre}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="pk-content">
        {pestana === 'etiqueta' && (
          <div className="pk-config">
            <div className="pk-card pk-controles">
              <span className="pk-lbl-sec">TIPOGRAFÍA</span>
              {TIPOGRAFIA.map(t => <Deslizador key={t.field} label={t.label} valor={cfg[t.field]} min={t.min} max={t.max} onCambio={v => upd(t.field, v)} />)}
              <span className="pk-lbl-sec">CÓDIGO DE BARRAS</span>
              {BARRAS.map(t => <Deslizador key={t.field} label={t.label} valor={cfg[t.field]} min={t.min} max={t.max} unidad={t.unidad} onCambio={v => upd(t.field, v)} />)}
              <span className="pk-lbl-sec">FORMA</span>
              {FORMA.map(t => <Deslizador key={t.field} label={t.label} valor={cfg[t.field]} min={t.min} max={t.max} onCambio={v => upd(t.field, v)} />)}
              <span className="pk-lbl-sec">QUÉ MUESTRA</span>
              {MUESTRA.map(m => (
                <div key={m.field} className="pk-interr">
                  <span className="t"><b>{m.label}</b><span className="pk-sub">{m.desc}</span></span>
                  <button type="button" role="switch" aria-checked={cfg[m.field]} aria-label={m.label} className="pk-sw"
                    onClick={() => upd(m.field, !cfg[m.field])}><i /></button>
                </div>
              ))}
            </div>
            <div className="pk-previa">
              <span className="pk-sub">Vista previa a la mitad del tamaño real · se actualiza al mover cada control</span>
              <div className="marco" style={{ width: 720 * ESCALA, height: 780 * ESCALA }}>
                <div style={{ transform: `scale(${ESCALA})`, transformOrigin: 'top left', width: 720, pointerEvents: 'none' }}>
                  <BarcodeCard
                    value="18FLO;JuanPerez;WH/PICK/1234;P1;Comida,Aseo"
                    palletNum={1} total={2} slotId={1}
                    storeCod="18FLO" pickerLabel="Juan Pérez" responsibleKey="Pickers 1"
                    allCategories={['Comida', 'Aseo']} totalPickers={4}
                    batch="BATCH/40112" finishedAt="2026-10-08 13:47:00"
                    compact={false} labelConfig={cfg}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {pestana === 'nombres' && <Nombres {...p} />}

        {pestana === 'pantalla' && (
          <div className="pk-card pk-controles" style={{ maxWidth: 460 }}>
            <span className="pk-lbl-sec">ETIQUETAS POR FILA</span>
            <span className="pk-sub" style={{ paddingBottom: 10 }}>Cuántas etiquetas caben de lado en la vista de tarjetas (teléfono y handheld).</span>
            <span className="pk-seg" role="group" aria-label="Etiquetas por fila" style={{ alignSelf: 'flex-start' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" className={p.colsPerRow === n ? 'on' : ''} aria-pressed={p.colsPerRow === n}
                  onClick={() => p.onColsPerRowChange(n)}>{n}</button>
              ))}
            </span>
          </div>
        )}
      </div>
    </main>
  );
}

function Nombres(p: Props) {
  const [nuevo, setNuevo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const agregar = () => {
    if (!nuevo.trim()) return;
    const e = p.onAgregarPicker(nuevo.trim());
    setError(e);
    if (!e) setNuevo('');
  };
  return (
    <div className="pk-card pk-nombres" style={{ maxWidth: 720 }}>
      <div className="pk-card-t" style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        Nombres de pickers<span className="pk-sp" /><span className="pk-sub" style={{ fontWeight: 400 }}>Cómo sale en Odoo → cómo sale en la etiqueta</span>
      </div>
      <div className="pk-hrow" style={{ padding: '10px 14px', borderBottom: '1px solid #E4E7EC', background: '#F8F9FB' }}>
        <span className="pk-field" style={{ flex: 1 }}>
          <input value={nuevo} placeholder="Nuevo picker o pistola (ej. Pickers 19, Mario Patiño)…" aria-label="Nuevo picker o pistola"
            onChange={e => { setNuevo(e.target.value); setError(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
        </span>
        <button type="button" className="pk-btn pri" onClick={agregar} disabled={!nuevo.trim()}>Agregar</button>
      </div>
      {error && <div className="pk-alert" role="alert" style={{ margin: '10px 14px' }}><span>{error}</span></div>}
      <table className="pk-tabla" aria-label="Nombres de pickers">
        <tbody>
          {p.pickerKeys.map(k => (
            <FilaNombre key={k} pickerKey={k} guardado={p.canonicalNames[k] ?? ''} onGuardar={p.onGuardarNombre}
              onQuitar={p.esAgregado(k) ? p.onQuitarPicker : undefined} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Misma lógica que PickerNameRow (ConfigTab): guardar y quitar piden confirmación. */
function FilaNombre({ pickerKey, guardado, onGuardar, onQuitar }: {
  pickerKey: string; guardado: string;
  onGuardar: (key: string, val: string) => void;
  onQuitar?: (key: string) => void;
}) {
  const [borrador, setBorrador] = useState(guardado);
  const [listo, setListo] = useState(false);
  const [pendiente, setPendiente] = useState<'guardar' | 'quitar' | null>(null);
  useEffect(() => { setBorrador(guardado); }, [guardado]);
  const cambiado = borrador !== guardado;
  const confirmar = () => {
    onGuardar(pickerKey, borrador);
    setPendiente(null); setListo(true);
    setTimeout(() => setListo(false), 2000);
  };
  return (
    <>
      <tr>
        <td className="pk-mono" style={{ width: 170 }} title={pickerKey}>{pickerKey}</td>
        <td>
          <span className={`pk-field${cambiado ? ' cambiado' : listo ? ' listo' : ''}`}>
            <input value={borrador} placeholder="Nombre en la etiqueta…" aria-label={`Nombre para ${pickerKey}`}
              onChange={e => setBorrador(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && cambiado) { e.preventDefault(); setPendiente('guardar'); } }} />
          </span>
        </td>
        <td style={{ width: 110, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {cambiado
            ? <button type="button" className="pk-btn pri" style={{ padding: '4px 10px' }} onClick={() => setPendiente('guardar')}>Guardar</button>
            : listo ? <span className="pk-pill ok" aria-live="polite">Guardado</span>
            : onQuitar ? <button type="button" className="pk-x" aria-label={`Eliminar ${pickerKey}`} onClick={() => setPendiente('quitar')}>✕</button>
            : null}
        </td>
      </tr>
      {pendiente && (
        <tr><td colSpan={3}>
          {pendiente === 'guardar' ? (
            <InlineConfirm message={`Cambiar nombre: «${guardado || pickerKey}» → «${borrador.trim() || '(sin nombre)'}». Lo verán todos.`}
              confirmLabel="Guardar" onCancel={() => setPendiente(null)} onConfirm={confirmar} />
          ) : (
            <InlineConfirm message={`¿Eliminar el picker o pistola «${pickerKey}»? Desaparece para todos.`}
              confirmLabel="Eliminar" onCancel={() => setPendiente(null)}
              onConfirm={() => { onQuitar?.(pickerKey); setPendiente(null); }} />
          )}
        </td></tr>
      )}
    </>
  );
}
