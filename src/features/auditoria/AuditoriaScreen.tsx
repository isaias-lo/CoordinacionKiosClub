'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '../../context/AppContext';
import { TODAS_LAS_TIENDAS } from './data/todasLasTiendas';
import { buscarOperaciones, getOdooConfig, saveOdooConfig } from './utils/odooApi';
import { sheetsAuditoriaWrite } from './utils/sheetsAuditoria';
import type {
  TipoAuditoria, CorreccionAuditoria, ResultadoAuditoria,
  TiendaRef, OperacionOdoo, OdooConfig, AuditEntry,
} from './types';

/* ── Constants ── */
const TIPOS: { value: TipoAuditoria; label: string }[] = [
  { value: 'comida',      label: 'Comida' },
  { value: 'hogar',       label: 'Hogar' },
  { value: 'aseo',        label: 'Aseo' },
  { value: 'completo',    label: 'Completo' },
  { value: 'comida-aseo', label: 'Com-Aseo' },
  { value: 'aseo-hogar',  label: 'Aseo-Hogar' },
];
const CORRECCIONES: { value: CorreccionAuditoria; label: string }[] = [
  { value: 'correcto',  label: 'Correcto' },
  { value: 'cruce',     label: 'Cruce' },
  { value: 'faltante',  label: 'Faltante' },
  { value: 'sobrante',  label: 'Sobrante' },
];
const TIPO_COLOR: Record<TipoAuditoria, string> = {
  comida:      'bg-[rgba(217,119,6,0.10)] border-warn text-warn',
  hogar:       'bg-[rgba(124,58,237,0.10)] border-hogar text-hogar',
  aseo:        'bg-[rgba(8,145,178,0.10)] border-mixto text-mixto',
  completo:    'bg-[rgba(22,163,74,0.10)] border-success text-success',
  'comida-aseo': 'bg-[rgba(211,47,47,0.10)] border-red text-red',
  'aseo-hogar':  'bg-[rgba(37,99,235,0.10)] border-info text-info',
};
const CORR_COLOR: Record<CorreccionAuditoria, string> = {
  correcto: 'bg-[rgba(22,163,74,0.12)] border-success text-success',
  cruce:    'bg-[rgba(37,99,235,0.12)] border-info text-info',
  faltante: 'bg-[rgba(211,47,47,0.12)] border-red text-red',
  sobrante: 'bg-[rgba(217,119,6,0.12)] border-warn text-warn',
};

/* ── Section label ── */
function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-barlow-condensed text-[12px] font-bold uppercase tracking-[0.14em] text-text-3 mb-2 mt-4 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-border">
      {children}
    </div>
  );
}

/* ── Odoo config modal ── */
function OdooConfigModal({
  initial, onSave, onClose,
}: {
  initial: OdooConfig;
  onSave: (c: OdooConfig) => void;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<OdooConfig>(initial);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [dbList, setDbList] = useState<string[]>([]);
  const [dbListLoading, setDbListLoading] = useState(false);

  const set = (k: keyof OdooConfig, v: string) => {
    setCfg(p => ({ ...p, [k]: v }));
    setTestResult(null);
    if (k === 'url') setDbList([]);
  };

  const detectarDbs = async () => {
    if (!cfg.url) { setTestResult({ ok: false, msg: 'Ingresa la URL primero.' }); return; }
    setDbListLoading(true);
    setDbList([]);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_databases', config: cfg }),
      });
      const data = (await res.json()) as { databases?: string[]; error?: string };
      if (res.ok && data.databases?.length) {
        setDbList(data.databases);
      } else if (res.ok && data.databases?.length === 0) {
        setTestResult({ ok: false, msg: 'El servidor no expone la lista de bases de datos (list_db=False en odoo.conf). Pide el nombre al administrador.' });
      } else {
        setTestResult({ ok: false, msg: data.error || 'No se pudo obtener la lista' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Error de red al detectar bases de datos' });
    } finally {
      setDbListLoading(false);
    }
  };

  const probarConexion = async () => {
    if (!cfg.url || !cfg.db || !cfg.username || !cfg.apiKey) {
      setTestResult({ ok: false, msg: 'Completa todos los campos antes de probar.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_connection', config: cfg }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setTestResult({ ok: true, msg: `✓ Conexión exitosa. ${data.message ?? ''}` });
      } else {
        setTestResult({ ok: false, msg: data.error || 'Error desconocido' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Error de red al contactar /api/odoo' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[600] bg-navy/60 backdrop-blur-sm flex items-end">
      <div className="bg-white rounded-t-[20px] w-full px-4 pb-10 pt-5 max-h-[90vh] overflow-y-auto"
           style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.22)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mb-4" />
        <h3 className="font-barlow-condensed text-[22px] font-bold text-navy mb-1">Configurar Odoo</h3>
        <p className="text-[13px] text-text-3 mb-4">Credenciales para buscar operaciones</p>

        {/* URL */}
        <div className="mb-3">
          <label className="text-[12px] font-semibold text-text-3 uppercase tracking-wide block mb-1">URL del servidor</label>
          <input type="text" value={cfg.url} onChange={e => set('url', e.target.value)}
            placeholder="kiosclub.odoo.com"
            className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
        </div>

        {/* DB — con botón detectar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[12px] font-semibold text-text-3 uppercase tracking-wide">Base de datos</label>
            <button onClick={detectarDbs} disabled={dbListLoading || !cfg.url}
              className="text-[11px] font-bold text-navy border-none bg-transparent cursor-pointer disabled:opacity-40 flex items-center gap-1 px-0">
              {dbListLoading
                ? <><div className="w-2.5 h-2.5 border border-navy/30 border-t-navy rounded-full animate-spin" />Detectando…</>
                : '🔍 Detectar automático'}
            </button>
          </div>
          <input type="text" value={cfg.db} onChange={e => set('db', e.target.value)}
            placeholder="nombre_base_de_datos"
            className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
          {/* Detected DB list */}
          {dbList.length > 0 && (
            <div className="mt-1.5 border border-border rounded-btn overflow-hidden">
              <div className="px-3 py-1 bg-bg border-b border-border text-[11px] text-text-3 uppercase tracking-wide">
                Bases de datos encontradas — toca para seleccionar
              </div>
              {dbList.map(d => (
                <button key={d} onClick={() => { set('db', d); setDbList([]); }}
                  className={`w-full text-left px-3 py-2 font-mono text-[14px] border-b border-border/40 last:border-b-0 cursor-pointer transition-all ${
                    cfg.db === d ? 'bg-[rgba(26,37,80,0.08)] text-navy font-bold' : 'bg-white text-text hover:bg-bg'
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Usuario */}
        <div className="mb-3">
          <label className="text-[12px] font-semibold text-text-3 uppercase tracking-wide block mb-1">Usuario / Email</label>
          <input type="text" value={cfg.username} onChange={e => set('username', e.target.value)}
            placeholder="admin@empresa.com"
            className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
        </div>

        {/* API Key */}
        <div className="mb-3">
          <label className="text-[12px] font-semibold text-text-3 uppercase tracking-wide block mb-1">Contraseña / API Key</label>
          <input type="password" value={cfg.apiKey} onChange={e => set('apiKey', e.target.value)}
            placeholder=""
            className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[15px] outline-none focus:border-navy [-webkit-appearance:none]" />
        </div>

        {/* Test result banner */}
        {testResult && (
          <div className={`mt-1 mb-3 px-3 py-2.5 rounded-btn text-[13px] border ${
            testResult.ok
              ? 'bg-[rgba(22,163,74,0.08)] border-success text-success'
              : 'bg-[rgba(211,47,47,0.07)] border-red text-red'
          }`}>
            {testResult.msg}
          </div>
        )}

        {/* Probar conexión */}
        <button
          onClick={probarConexion}
          disabled={testing}
          className="w-full py-3 mb-3 border-2 border-dashed border-navy/30 rounded-btn text-navy/70 font-barlow-condensed text-[15px] font-bold cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 bg-transparent transition-all hover:border-navy/50 hover:text-navy">
          {testing
            ? <><div className="w-3 h-3 border-2 border-navy/30 border-t-navy rounded-full animate-spin" />Probando…</>
            : '⚡ Probar conexión'}
        </button>

        <div className="flex gap-2.5">
          <button onClick={onClose}
            className="flex-1 py-3.5 bg-bg-2 text-text-2 rounded-card font-barlow-condensed text-lg font-bold border-none cursor-pointer">
            Cancelar
          </button>
          <button onClick={() => { onSave(cfg); onClose(); }}
            className="flex-1 py-3.5 bg-navy text-white rounded-card font-barlow-condensed text-lg font-bold border-none cursor-pointer"
            style={{ boxShadow: '0 4px 16px rgba(26,37,80,0.28)' }}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   MAIN SCREEN
════════════════════════════════════════ */
export function AuditoriaScreen() {
  const { showToast, state } = useApp();
  const router = useRouter();

  /* ── Form state ── */
  const [auditor,    setAuditor]    = useState('');
  const [tienda,     setTienda]     = useState<TiendaRef | null>(null);
  const [tipo,       setTipo]       = useState<TipoAuditoria>('comida');
  const [opOdoo,     setOpOdoo]     = useState('');
  const [pallets,    setPallets]    = useState('');
  const [errores,    setErrores]    = useState('');
  const [correccion, setCorreccion] = useState<CorreccionAuditoria>('correcto');
  const [resultado,  setResultado]  = useState<ResultadoAuditoria | null>(null);

  /* ── Tienda search ── */
  const [tiendaQuery,   setTiendaQuery]   = useState('');
  const [tiendaOpen,    setTiendaOpen]    = useState(false);
  const tiendaRef = useRef<HTMLDivElement>(null);

  /* ── Odoo search ── */
  const [odooLoading,  setOdooLoading]  = useState(false);
  const [odooResults,  setOdooResults]  = useState<OperacionOdoo[]>([]);
  const [odooError,    setOdooError]    = useState('');
  const [odooOpen,     setOdooOpen]     = useState(false);
  const [showOdooConf, setShowOdooConf] = useState(false);
  const [odooConfig,   setOdooConfig]   = useState<OdooConfig>({ url: '', db: '', username: '', apiKey: '' });

  /* ── History ── */
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const cfg = getOdooConfig();
    if (cfg) setOdooConfig(cfg);
    try {
      const h = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[];
      setHistory(h.slice(-50).reverse());
    } catch { /* empty */ }
  }, []);

  /* ── Close tienda dropdown on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (tiendaRef.current && !tiendaRef.current.contains(e.target as Node)) setTiendaOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Tienda filtered list ── */
  const tiendaFiltered = TODAS_LAS_TIENDAS.filter(t => {
    const q = tiendaQuery.toLowerCase();
    return !q || t.nombre.toLowerCase().includes(q) || t.cod.toLowerCase().includes(q) || t.region.toLowerCase().includes(q);
  });

  /* ── Odoo search ── */
  const buscarOdoo = useCallback(async () => {
    if (!odooConfig.url) { setShowOdooConf(true); return; }
    setOdooLoading(true); setOdooError(''); setOdooResults([]); setOdooOpen(false);
    try {
      const results = await buscarOperaciones(odooConfig, opOdoo);
      setOdooResults(results);
      setOdooOpen(true);
      if (!results.length) setOdooError('Sin resultados para esa búsqueda');
    } catch (err) {
      setOdooError(err instanceof Error ? err.message : 'Error al conectar con Odoo');
    } finally {
      setOdooLoading(false);
    }
  }, [odooConfig, opOdoo]);

  /* ── Submit ── */
  const handleSubmit = () => {
    if (!auditor.trim())   { showToast('Ingresa el nombre del auditor', '#D97706'); return; }
    if (!tienda)           { showToast('Selecciona una tienda', '#D97706'); return; }
    if (!opOdoo.trim())    { showToast('Ingresa el código de operación', '#D97706'); return; }
    if (!pallets || parseInt(pallets) < 0) { showToast('Ingresa la cantidad de pallets', '#D97706'); return; }
    if (!errores || parseInt(errores) < 0) { showToast('Ingresa la cantidad de errores', '#D97706'); return; }
    if (!resultado)        { showToast('Selecciona el resultado', '#D97706'); return; }

    const now = new Date();
    const entry: AuditEntry = {
      id: `AUD-${Date.now()}`,
      fecha: now.toLocaleDateString('es-CL'),
      hora: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      auditor: auditor.trim(),
      tiendaCod: tienda.cod,
      tiendaNombre: tienda.nombre,
      tiendaArea: tienda.area,
      tipo,
      operacionOdoo: opOdoo.trim().toUpperCase(),
      pallets: parseInt(pallets) || 0,
      errores: parseInt(errores) || 0,
      correccion,
      resultado,
    };

    /* persist */
    try {
      const prev = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[];
      prev.push(entry);
      localStorage.setItem('auditHistory', JSON.stringify(prev));
      setHistory([entry, ...history.slice(0, 49)]);
    } catch { /* empty */ }

    /* send to sheets */
    sheetsAuditoriaWrite(entry, state.sheetsUrl);

    showToast(`✓ Auditoría registrada — ${resultado === 'bueno' ? 'Resultado BUENO' : 'Resultado MALO'}`,
      resultado === 'bueno' ? '#16A34A' : '#D32F2F');

    /* reset form */
    setTienda(null); setTiendaQuery('');
    setOpOdoo(''); setPallets(''); setErrores('');
    setTipo('comida'); setCorreccion('correcto'); setResultado(null);
    setOdooResults([]); setOdooOpen(false);
  };

  /* ── Derived ── */
  const canSubmit = !!auditor.trim() && !!tienda && !!opOdoo.trim() &&
    !!pallets && !!errores && !!resultado;

  /* ════════════════════════════════════════
     HISTORY VIEW
  ════════════════════════════════════════ */
  if (showHistory) {
    return (
      <div className="fixed inset-0 bg-bg overflow-y-auto">
        <div className="bg-navy px-4 py-3.5 flex items-center gap-3.5 sticky top-0 z-10">
          <button onClick={() => setShowHistory(false)}
            className="border-none text-white/70 text-sm cursor-pointer font-barlow flex items-center gap-1.5 py-1 bg-transparent">
            ← Volver
          </button>
          <div className="font-barlow-condensed text-xl font-bold text-white tracking-wide">Historial auditorías</div>
        </div>
        <div className="p-3.5">
          {!history.length ? (
            <div className="text-center py-16 text-text-3 text-[15px]">Sin auditorías registradas aún.</div>
          ) : history.map(e => (
            <div key={e.id} className="bg-white border-[1.5px] border-border rounded-card p-3.5 mb-3 shadow-card">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                <div className="font-barlow-condensed text-base font-bold text-navy">{e.tiendaNombre}</div>
                <div className="flex gap-1.5 flex-wrap items-center">
                  <span className={`font-barlow-condensed text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    e.resultado === 'bueno'
                      ? 'bg-[rgba(22,163,74,0.10)] border-success text-success'
                      : 'bg-[rgba(211,47,47,0.10)] border-red text-red'
                  }`}>{e.resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                <div><span className="text-text-3">Auditor:</span> <strong>{e.auditor}</strong></div>
                <div><span className="text-text-3">Fecha:</span> <strong>{e.fecha} {e.hora}</strong></div>
                <div><span className="text-text-3">Tipo:</span> <strong className="capitalize">{e.tipo}</strong></div>
                <div><span className="text-text-3">Op. Odoo:</span> <strong className="font-mono">{e.operacionOdoo}</strong></div>
                <div><span className="text-text-3">Pallets:</span> <strong>{e.pallets}</strong></div>
                <div><span className="text-text-3">Errores:</span> <strong className={e.errores > 0 ? 'text-red' : 'text-success'}>{e.errores}</strong></div>
                <div><span className="text-text-3">Corrección:</span> <strong className="capitalize">{e.correccion}</strong></div>
                <div><span className="text-text-3">Área:</span> <strong className="capitalize">{e.tiendaArea}</strong></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════
     FORM VIEW
  ════════════════════════════════════════ */
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* Header */}
      <div className="bg-navy px-4 py-3 flex items-center gap-3 flex-shrink-0"
           style={{ boxShadow: '0 2px 12px rgba(26,37,80,0.25)' }}>
        <button onClick={() => router.push('/')}
          className="border-none bg-white/10 text-white/80 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full transition-all active:bg-white/20">
          ← Inicio
        </button>
        <div className="flex-1">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase">Auditoría</div>
          <div className="text-[11px] text-white/45 uppercase tracking-widest">Control de calidad pallet</div>
        </div>
        <button
          onClick={() => setShowHistory(true)}
          className="border-none bg-white/10 text-white/70 text-[13px] cursor-pointer font-barlow px-3 py-1.5 rounded-full transition-all active:bg-white/20">
          📋 Historial
        </button>
        <button
          onClick={() => setShowOdooConf(true)}
          title="Configurar Odoo"
          className="border-none bg-white/10 text-white/60 text-[15px] cursor-pointer px-2.5 py-1.5 rounded-full transition-all active:bg-white/20">
          ⚙
        </button>
      </div>

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">

        {/* AUDITOR */}
        <SLabel>Auditor</SLabel>
        <input
          type="text"
          value={auditor}
          onChange={e => setAuditor(e.target.value)}
          placeholder="Nombre del auditor"
          className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-3 text-text font-barlow text-[16px] outline-none transition-all focus:border-navy focus:shadow-[0_0_0_3px_rgba(26,37,80,0.08)] [-webkit-appearance:none]"
        />

        {/* TIENDA */}
        <SLabel>Tienda</SLabel>
        <div ref={tiendaRef} className="relative">
          <div
            onClick={() => setTiendaOpen(o => !o)}
            className={`w-full bg-white border-[1.5px] rounded-btn px-3 py-3 flex items-center justify-between cursor-pointer transition-all ${
              tiendaOpen ? 'border-navy shadow-[0_0_0_3px_rgba(26,37,80,0.08)]' : 'border-border'
            }`}>
            {tienda ? (
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-text text-[15px]">{tienda.nombre}</span>
                <span className="font-mono text-[11px] text-text-3 ml-2">{tienda.cod}</span>
                <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tienda.area === 'santiago'
                    ? 'bg-[rgba(37,99,235,0.10)] text-info'
                    : 'bg-[rgba(211,47,47,0.10)] text-red'
                }`}>{tienda.area === 'santiago' ? 'STG' : 'REG'}</span>
              </div>
            ) : (
              <span className="text-text-3 font-barlow text-[15px]">Seleccionar tienda…</span>
            )}
            <span className="text-text-3 ml-2 flex-shrink-0">{tiendaOpen ? '▲' : '▼'}</span>
          </div>

          {tiendaOpen && (
            <div className="absolute top-full left-0 right-0 z-50 bg-white border border-border rounded-card mt-1 shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-border">
                <input
                  autoFocus
                  type="text"
                  value={tiendaQuery}
                  onChange={e => setTiendaQuery(e.target.value)}
                  placeholder="Buscar por nombre, código, región…"
                  className="w-full bg-bg border border-border rounded-btn px-3 py-2 text-text font-barlow text-[14px] outline-none focus:border-navy"
                />
              </div>
              <div className="max-h-56 overflow-y-auto">
                {tiendaFiltered.length === 0 && (
                  <div className="py-6 text-center text-text-3 text-[13px]">Sin resultados</div>
                )}
                {tiendaFiltered.map(t => (
                  <div
                    key={t.cod}
                    onClick={() => { setTienda(t); setTiendaOpen(false); setTiendaQuery(''); }}
                    className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 transition-all ${
                      tienda?.cod === t.cod ? 'bg-[rgba(26,37,80,0.06)]' : 'hover:bg-bg'
                    }`}>
                    <span className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border px-1.5 py-0.5 rounded flex-shrink-0 min-w-[42px] text-center">{t.cod}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[14px] text-text truncate">{t.nombre}</div>
                      <div className="text-[11px] text-text-3 truncate">{t.comuna || t.region}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                      t.area === 'santiago'
                        ? 'bg-[rgba(37,99,235,0.10)] text-info'
                        : 'bg-[rgba(211,47,47,0.10)] text-red'
                    }`}>{t.area === 'santiago' ? 'STG' : 'REG'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TIPO */}
        <SLabel>Tipo de contenido</SLabel>
        <div className="grid grid-cols-3 gap-1.5">
          {TIPOS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTipo(value)}
              className={`py-2.5 rounded-btn border-[1.5px] font-barlow-condensed text-[14px] font-bold cursor-pointer transition-all ${
                tipo === value ? TIPO_COLOR[value] : 'border-border bg-white text-text-2'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* OPERACIÓN ODOO */}
        <SLabel>Operación Odoo</SLabel>
        <div className="flex gap-2">
          <input
            type="text"
            value={opOdoo}
            onChange={e => { setOpOdoo(e.target.value.toUpperCase()); setOdooOpen(false); }}
            onKeyDown={e => { if (e.key === 'Enter') buscarOdoo(); }}
            placeholder="WH/OUT/00000"
            className="flex-1 bg-white border-[1.5px] border-border rounded-btn px-3 py-3 text-text font-mono text-[15px] outline-none transition-all focus:border-navy focus:shadow-[0_0_0_3px_rgba(26,37,80,0.08)] uppercase placeholder:normal-case placeholder:font-barlow placeholder:text-text-3"
          />
          <button
            onClick={buscarOdoo}
            disabled={odooLoading}
            className="px-4 py-3 bg-navy text-white border-none rounded-btn font-barlow-condensed text-[14px] font-bold cursor-pointer disabled:opacity-50 transition-all active:opacity-80 flex items-center gap-1.5 flex-shrink-0"
            style={{ boxShadow: '0 3px 10px rgba(26,37,80,0.25)' }}>
            {odooLoading
              ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Buscando</>
              : '🔍 Buscar'}
          </button>
        </div>

        {/* Odoo error */}
        {odooError && (
          <div className="mt-1.5 text-[12px] text-red bg-[rgba(211,47,47,0.07)] border border-[rgba(211,47,47,0.20)] rounded-btn px-3 py-2">
            ⚠ {odooError}
          </div>
        )}

        {/* Odoo results dropdown */}
        {odooOpen && odooResults.length > 0 && (
          <div className="mt-1.5 bg-white border border-border rounded-card shadow-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-bg border-b border-border">
              <span className="font-barlow-condensed text-[11px] uppercase tracking-widest text-text-3">
                {odooResults.length} resultado{odooResults.length !== 1 ? 's' : ''} en Odoo
              </span>
            </div>
            {odooResults.map(op => (
              <div
                key={op.id}
                onClick={() => { setOpOdoo(op.name); setOdooOpen(false); setOdooResults([]); }}
                className={`px-3 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 transition-all hover:bg-bg flex items-start gap-3 ${
                  opOdoo === op.name ? 'bg-[rgba(26,37,80,0.05)]' : ''
                }`}>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[13px] font-bold text-navy">{op.name}</div>
                  <div className="text-[11px] text-text-3 truncate mt-0.5">{op.partner}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    op.state === 'Listo' ? 'bg-[rgba(22,163,74,0.10)] text-success' :
                    op.state === 'Hecho' ? 'bg-[rgba(37,99,235,0.10)] text-info' :
                    'bg-[rgba(217,119,6,0.10)] text-warn'
                  }`}>{op.state}</div>
                  {op.fecha && <div className="text-[10px] text-text-3 mt-0.5">{op.fecha}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PALLETS + ERRORES */}
        <SLabel>Cantidades</SLabel>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] text-text-3 font-semibold uppercase tracking-wide block mb-1.5">
              Pallets auditados
            </label>
            <input
              type="number" inputMode="numeric" min="0" max="99"
              value={pallets} onChange={e => setPallets(e.target.value)}
              placeholder="0"
              className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-3 text-text font-barlow text-[20px] text-center outline-none transition-all focus:border-navy [-webkit-appearance:none]"
            />
          </div>
          <div>
            <label className="text-[12px] text-text-3 font-semibold uppercase tracking-wide block mb-1.5">
              Cantidad de errores
            </label>
            <input
              type="number" inputMode="numeric" min="0" max="99"
              value={errores} onChange={e => setErrores(e.target.value)}
              placeholder="0"
              className={`w-full bg-white border-[1.5px] rounded-btn px-3 py-3 font-barlow text-[20px] text-center outline-none transition-all [-webkit-appearance:none] ${
                errores && parseInt(errores) > 0
                  ? 'border-red text-red bg-[rgba(211,47,47,0.04)]'
                  : errores && parseInt(errores) === 0
                  ? 'border-success text-success bg-[rgba(22,163,74,0.04)]'
                  : 'border-border text-text focus:border-navy'
              }`}
            />
          </div>
        </div>

        {/* CORRECCIÓN */}
        <SLabel>Corrección</SLabel>
        <div className="grid grid-cols-2 gap-1.5">
          {CORRECCIONES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setCorreccion(value)}
              className={`py-3 rounded-btn border-[1.5px] font-barlow-condensed text-[15px] font-bold cursor-pointer transition-all ${
                correccion === value ? CORR_COLOR[value] : 'border-border bg-white text-text-2'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* RESULTADO */}
        <SLabel>Resultado</SLabel>
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => setResultado('bueno')}
            className={`py-5 rounded-card border-2 font-barlow-condensed text-[22px] font-extrabold cursor-pointer transition-all ${
              resultado === 'bueno'
                ? 'bg-[rgba(22,163,74,0.12)] border-success text-success'
                : 'bg-white border-border text-text-2'
            }`}
            style={resultado === 'bueno' ? { boxShadow: '0 4px 16px rgba(22,163,74,0.20)' } : {}}>
            ✓ BUENO
          </button>
          <button
            onClick={() => setResultado('malo')}
            className={`py-5 rounded-card border-2 font-barlow-condensed text-[22px] font-extrabold cursor-pointer transition-all ${
              resultado === 'malo'
                ? 'bg-[rgba(211,47,47,0.12)] border-red text-red'
                : 'bg-white border-border text-text-2'
            }`}
            style={resultado === 'malo' ? { boxShadow: '0 4px 16px rgba(211,47,47,0.20)' } : {}}>
            ✗ MALO
          </button>
        </div>

        {/* SUBMIT */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-4 bg-red text-white border-none rounded-card font-barlow-condensed text-[22px] font-bold tracking-wide cursor-pointer disabled:opacity-35 transition-all active:scale-[0.99]"
          style={{ boxShadow: canSubmit ? '0 4px 16px rgba(211,47,47,0.32)' : 'none' }}>
          ✓ Registrar auditoría
        </button>
      </div>

      {/* Odoo config modal */}
      {showOdooConf && (
        <OdooConfigModal
          initial={odooConfig}
          onSave={cfg => { saveOdooConfig(cfg); setOdooConfig(cfg); showToast('✓ Config Odoo guardada', '#16A34A'); }}
          onClose={() => setShowOdooConf(false)}
        />
      )}
    </div>
  );
}
