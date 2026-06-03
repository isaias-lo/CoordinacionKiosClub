'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ClipboardPlus, BarChart3, PackageOpen, Search, Clock, Settings2, History, Radio, TableProperties } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../components/AuthProvider';
import { ProfilePill } from '../../components/ProfilePill';
import { supabase } from '../../lib/supabase';
import { entryToRow, rowToEntry } from './utils/converters';
import { TODAS_LAS_TIENDAS } from './data/todasLasTiendas';
import { PICKER_NAMES } from './data/pickerNames';
import { getOdooConfig } from './utils/odooApi';
import { sheetsAuditoriaWrite } from './utils/sheetsAuditoria';
import type {
  TipoAuditoria, CorreccionAuditoria, ResultadoAuditoria,
  TiendaRef, AuditEntry,
  SubTipo, TipoError, OperacionEntry, ProductoError,
} from './types';

// ── Extracted components ──
import { SLabel } from './components/ui/SLabel';
import { BarcodeInputScanner } from './components/scanner/BarcodeInputScanner';
import { CameraBarcodeScanner } from './components/scanner/CameraBarcodeScanner';
import { OperacionInput } from './components/fields/OperacionInput';
import { AuditorSelector } from './components/fields/AuditorSelector';
import { PickerOdooDisplay } from './components/fields/PickerOdooDisplay';
import { PickerNombreSelector } from './components/fields/PickerNombreSelector';
import { ProductSearch } from './components/fields/ProductSearch';
import { DashboardContent } from './tabs/dashboard/DashboardContent';
import { RankingContent } from './tabs/dashboard/RankingContent';
import { HistoryContent } from './tabs/history/HistoryContent';
import { StatsPanel } from './tabs/stats/StatsPanel';
import { LiveAuditsPanel } from './tabs/live/LiveAuditsPanel';
import { TrazabilidadPanel } from './tabs/trazabilidad/TrazabilidadPanel';
import { AdminDesktopPanel } from './tabs/admin/AdminDesktopPanel';
import { AdminAudStats } from './tabs/admin/AdminAudStats';
import { ProduccionPanel } from './tabs/admin/ProduccionPanel';
import { ConfigPanel } from './tabs/admin/ConfigPanel';
import { processPhoto } from './utils/photos';
import type { ProcessedPhoto } from './utils/photos';
import { exportarPDF } from './utils/pdfExport';
import {
  TIPO_TO_SUBTIPOS, TIPOS, TIPO_COLOR, CORR_COLOR, CORR_LABEL,
  AUDIT_SESSION_KEY, OFFLINE_QUEUE_KEY, sessionKey, formatTimer, catsToTipo,
} from './constants';
import { displayPicker } from './tabs/dashboard/helpers';

// BarcodeDetector Web API — available in Chrome 83+ / Safari 17.4+
declare global {
  interface BarcodeDetectorOptions { formats?: string[] }
  interface DetectedBarcode { rawValue: string; format: string }
  class BarcodeDetector {
    constructor(options?: BarcodeDetectorOptions);
    detect(image: ImageBitmapSource | HTMLVideoElement): Promise<DetectedBarcode[]>;
  }
}

interface OfflineQueueItem { row: Record<string, unknown>; userId: string; entryId: string; }

function loadOfflineQueue(): OfflineQueueItem[] {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); } catch { return []; }
}
function saveOfflineQueue(q: OfflineQueueItem[]) {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)); } catch { /* full */ }
}
async function flushOfflineQueue(onFlushed: (count: number) => void) {
  const q = loadOfflineQueue();
  if (q.length === 0) return;
  const remaining: OfflineQueueItem[] = [];
  let flushed = 0;
  for (const item of q) {
    const { error } = await supabase.from('audit_entries').upsert(item.row as Record<string, unknown>);
    if (error) { remaining.push(item); } else { flushed++; }
  }
  saveOfflineQueue(remaining);
  if (flushed > 0) onFlushed(flushed);
}

function calcAuditado(u: number, tipo: TipoError, esp: number) {
  return tipo === 'faltante' ? esp - u : esp + u;
}

function matchPickerNames(odooName: string, names: Record<string, string>): string | null {
  if (!odooName) return null;
  const lower = odooName.toLowerCase().trim();
  for (const [key, realName] of Object.entries(names)) {
    if (key.toLowerCase() === lower) return key;
    if (realName && realName.toLowerCase() === lower) return key;
  }
  return null;
}

/* ── Mobile Menu ── */
function MobileMenu({ onClose, onNavigate, onlyHistory = false }: {
  onClose: () => void;
  onNavigate: (v: 'dashboard' | 'history' | 'ranking') => void;
  onlyHistory?: boolean;
}) {
  const items = onlyHistory
    ? [{ Icon: History,        label: 'Historial',        sub: 'Tus auditorías por fecha',                   v: 'history'   as const }]
    : [
        { Icon: ClipboardPlus, label: 'Dashboard del día', sub: 'KPIs y métricas de hoy',                    v: 'dashboard' as const },
        { Icon: TableProperties, label: 'Ranking de Pickers', sub: 'Eficiencia y estadísticas de unidades', v: 'ranking'   as const },
        { Icon: History,        label: 'Historial',        sub: 'Auditorías por fecha + exportar PDF',        v: 'history'   as const },
      ];
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[24px] overflow-hidden" style={{ boxShadow: '0 -8px 40px rgba(26,37,80,0.22)' }}>
        <div className="w-10 h-1 bg-bg-3 rounded-full mx-auto mt-4 mb-1" />
        <div className="p-4 pb-8 space-y-2">
          {items.map(({ Icon, label, sub, v }) => (
            <button key={v} onClick={() => onNavigate(v)}
              className="w-full flex items-center gap-4 px-4 py-3.5 bg-bg hover:bg-bg-2 rounded-card cursor-pointer border border-border text-left transition-colors">
              <div className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ background: 'linear-gradient(145deg, rgba(26,37,80,0.10), rgba(26,37,80,0.05))', border: '1px solid rgba(26,37,80,0.12)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)' }}>
                <Icon size={22} color="#1a2550" strokeWidth={1.8} />
              </div>
              <div className="flex-1">
                <div className="font-barlow-condensed text-[17px] font-bold text-navy">{label}</div>
                <div className="text-[12px] text-text-3 mt-0.5">{sub}</div>
              </div>
              <span className="text-text-3 text-[18px]">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AuditoriaScreen() {
  const { user, profile, loading: authLoading } = useAuth();
  const { showToast, state } = useApp();
  const userRole        = profile?.role ?? 'auditor';
  const isAdminAud      = userRole === 'admin-auditoria' || userRole === 'admin';
  const isAuditorOnly   = userRole === 'auditor';
  const router = useRouter();

  const [auditor,           setAuditor]           = useState('');
  const auditorFromProfile = useRef(false); // true when auditor was set by auto-fill (not manually typed)
  const [picker,            setPicker]            = useState('');
  const [tienda,            setTienda]            = useState<TiendaRef | null>(null);
  const [tipo,              setTipo]              = useState<TipoAuditoria>('comida');
  const [operaciones,       setOperaciones]       = useState<OperacionEntry[]>([{ subTipo: 'comida', codigo: '' }]);
  const [pallets,           setPallets]           = useState('');
  const [tieneErrores,      setTieneErrores]      = useState<boolean | null>(null);
  const [tiposError,        setTiposError]        = useState<TipoError[]>([]);
  const [productos,         setProductos]         = useState<ProductoError[]>([]);
  const [observaciones,     setObservaciones]     = useState('');
  const [reauditoriaOrigen, setReauditoriaOrigen] = useState<AuditEntry | null>(null);
  const [showSecondScan,    setShowSecondScan]    = useState(false);
  const [firstScanDone,     setFirstScanDone]     = useState(false);
  const [remoteSession,     setRemoteSession]     = useState<Record<string, unknown> | null>(null);
  const [tipoLocked,        setTipoLocked]        = useState(false);
  const firstScanRef = useRef<{ tipo: TipoAuditoria; operaciones: OperacionEntry[]; tienda: TiendaRef | null; picker: string; pickerNombre: string } | null>(null);

  const [tiendaQuery, setTiendaQuery] = useState('');
  const [tiendaOpen,  setTiendaOpen]  = useState(false);
  const tiendaRef = useRef<HTMLDivElement>(null);

  const odooConfig = useMemo(() => getOdooConfig() ?? { url: '', db: '', username: '', apiKey: '' }, []);
  const [view, setView] = useState<'hub' | 'form' | 'history' | 'ranking' | 'dashboard' | 'stats' | 'revision' | 'config' | 'produccion' | 'live' | 'trazabilidad'>('form');
  const [viewInit,       setViewInit]       = useState(false);
  const [history,        setHistory]        = useState<AuditEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError,   setHistoryError]   = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const draftEntryIdRef    = useRef<string>('');
  const [palletFiles,      setPalletFiles]      = useState<Record<string, File>>({});
  const [palletPreviews,   setPalletPreviews]   = useState<Record<string, string>>({});
  const [palletWarnings,   setPalletWarnings]   = useState<Record<string, string>>({});
  const [palletStorageUrls,setPalletStorageUrls]= useState<Record<string, string>>({});
  const [fotoFiles,        setFotoFiles]        = useState<File[]>([]);
  const [fotoPreviews,     setFotoPreviews]     = useState<string[]>([]);
  const [fotoWarnings,     setFotoWarnings]     = useState<string[]>([]);
  const [fotoStorageUrls,  setFotoStorageUrls]  = useState<string[]>([]);
  const [fotoStoragePaths, setFotoStoragePaths] = useState<string[]>([]);
  const [errorFotoFiles,   setErrorFotoFiles]   = useState<File[]>([]);
  const [errorFotoPreviews,setErrorFotoPreviews]= useState<string[]>([]);
  const [errorFotoWarnings,setErrorFotoWarnings]= useState<string[]>([]);
  const [errorFotoStorageUrls, setErrorFotoStorageUrls] = useState<string[]>([]);
  const [errorFotoStoragePaths,setErrorFotoStoragePaths]= useState<string[]>([]);
  const [lightboxUrl,      setLightboxUrl]      = useState<string | null>(null);
  const [submitting,       setSubmitting]       = useState(false);
  const [uploadProgress,   setUploadProgress]   = useState('');
  const [pickerNombre,   setPickerNombre]   = useState('');
  const [pickerNombresList, setPickerNombresList] = useState<string[]>([]);
  const [auditorList,       setAuditorList]       = useState<string[]>([]);
  const [odooAutoDetected, setOdooAutoDetected] = useState(false);
  const [confirmSubmit,    setConfirmSubmit]    = useState(false);
  const [confirmCancel,    setConfirmCancel]    = useState(false);
  const [tipoPending,      setTipoPending]      = useState<TipoAuditoria | null>(null);
  const [isOnline,         setIsOnline]         = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [cameraOpen,          setCameraOpen]          = useState(false);
  const [sessionRestored,     setSessionRestored]     = useState(false);
  const [crossDeviceRestored, setCrossDeviceRestored] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const palletsInputRef  = useRef<HTMLInputElement>(null);
  const tieneErroresRef  = useRef<HTMLDivElement>(null);
  const operacionesRef   = useRef<HTMLDivElement>(null);
  const pendingScanRef  = useRef<OperacionEntry[] | null>(null);
  const [palletIdInput,   setPalletIdInput]   = useState('');
  const [palletIdLoading, setPalletIdLoading] = useState(false);
  const [palletIdError,   setPalletIdError]   = useState('');
  const [showPalletId2,   setShowPalletId2]   = useState(false);
  const [palletIdInput2,  setPalletIdInput2]  = useState('');
  const [palletIdError2,  setPalletIdError2]  = useState('');
  const [pickerNombres,   setPickerNombres]   = useState<string[]>([]);
  // canonical_id del pallet escaneado (P/B/CH/C{...}). Se resuelve via /api/pallet-lookup
  // y se persiste en audit_entries para cruzar trazabilidad con despacho_rm/regiones.
  const [scannedCanonicalId, setScannedCanonicalId] = useState<string | null>(null);
  // Clave incremental para forzar re-mount de inputs de foto en iOS (fix: onChange stale tras cámara)
  const [photoInputVer,   setPhotoInputVer]   = useState(0);
  const bumpPhotoInput = () => setPhotoInputVer(v => v + 1);
  // Estado visual mientras se comprime/sube una foto
  const [photoUploading,  setPhotoUploading]  = useState(false);
  const [photoUploadMsg,  setPhotoUploadMsg]  = useState('');
  const [photoProgress,   setPhotoProgress]   = useState({ done: 0, total: 0, phase: '' as '' | 'compress' | 'upload' });
  // Ref guard — previene ejecuciones concurrentes de handlers de foto (doble-tap iOS/Android)
  const photoUploadingRef = useRef(false);
  // Intentó hacer submit → resaltar campo bloqueante
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formPhase, setFormPhase] = useState<'scan' | 'setup' | 'execution' | 'result'>('scan');
  const [lastEntry, setLastEntry] = useState<AuditEntry | null>(null);
  const [lastDurationSeconds, setLastDurationSeconds] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [auditStartTime, setAuditStartTime] = useState('');
  const timerIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const auditStartTimeRef  = useRef('');
  auditStartTimeRef.current = auditStartTime;

  // Token de sesión para llamadas a APIs protegidas con verifyAuth (/api/picking-pallets, etc.)
  // Usar authedFetch en lugar de fetch() directo para cualquier ruta API que requiera auth.
  const tokenRef = useRef<string>('');
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      tokenRef.current = session?.access_token ?? '';
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      tokenRef.current = session?.access_token ?? '';
    });
    return () => subscription.unsubscribe();
  }, []);
  const authedFetch = useCallback((url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${tokenRef.current}` },
    }), []);

  // Set initial view once profile loads + kick off history load with correct user context
  useEffect(() => {
    if (!authLoading && !viewInit) {
      if (isAdminAud) setView('hub');
      setViewInit(true);
      loadHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAdminAud, viewInit]);

  // Online/offline detection + flush queue on reconnect
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue(count => showToast(`✓ ${count} auditoría${count > 1 ? 's' : ''} sincronizada${count > 1 ? 's' : ''}`, '#16A34A'));
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Flush on mount if online and queue has items
    if (navigator.onLine) flushOfflineQueue(count => showToast(`✓ ${count} auditoría${count > 1 ? 's' : ''} sincronizada${count > 1 ? 's' : ''}`, '#16A34A'));
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = async () => {
    setHistoryLoading(true); setHistoryError('');
    try {
      let query = supabase
        .from('audit_entries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      // Non-admin users only see their own entries
      if (!isAdminAud && user?.id) query = query.eq('user_id', user.id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        setHistory(data.map(r => rowToEntry(r as Record<string, unknown>)));
      } else {
        const h = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[];
        setHistory(h.slice(-200).reverse());
      }
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Error al cargar historial');
      try {
        const h = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[];
        setHistory(h.slice(-200).reverse());
      } catch { /* empty */ }
    } finally {
      setHistoryLoading(false);
    }
  };
  // Realtime: re-fetch history whenever any audit_entries row changes (debounced 1.5 s to absorb bursts)
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel('auditoria-screen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_entries' }, () => {
        if (!viewInit) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { loadHistory(); }, 1500);
      })
      .subscribe();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewInit]);

  // loadHistory is called in the viewInit effect (after auth resolves) to ensure user context is ready
  useEffect(() => {
    supabase.from('picker_config').select('auditores, picker_nombres').eq('id', 1).single()
      .then(({ data }) => {
        if (Array.isArray(data?.picker_nombres) && (data.picker_nombres as string[]).length > 0) {
          setPickerNombresList(data.picker_nombres as string[]);
        }
        if (Array.isArray(data?.auditores)) {
          setAuditorList(data.auditores as string[]);
        }
      });
  }, []);
  // Auto-fill auditor from logged-in profile name; also re-sync when profile name changes
  useEffect(() => {
    if (authLoading || !profile?.full_name) return;
    if (!auditor || auditorFromProfile.current) {
      setAuditor(profile.full_name);
      auditorFromProfile.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile?.full_name]);

  useEffect(() => {
    // No resetear operaciones ni fotos si la auditoría ya inició — el tipo
    // no cambia en execution/result y el efecto solo confundiría al restore.
    if (formPhase === 'execution' || formPhase === 'result') return;
    const pending = pendingScanRef.current;
    pendingScanRef.current = null;
    setOperaciones(TIPO_TO_SUBTIPOS[tipo].map((st, i) => pending?.[i] ?? { subTipo: st, codigo: '' }));
    Object.values(palletPreviews).forEach(url => URL.revokeObjectURL(url));
    setPalletFiles({}); setPalletPreviews({}); setPalletWarnings({}); setPalletStorageUrls({});
    fotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setFotoFiles([]); setFotoPreviews([]); setFotoWarnings([]); setFotoStorageUrls([]); setFotoStoragePaths([]);
    errorFotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setErrorFotoFiles([]); setErrorFotoPreviews([]); setErrorFotoWarnings([]); setErrorFotoStorageUrls([]); setErrorFotoStoragePaths([]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const handleTipoChange = (val: TipoAuditoria) => {
    if (val === tipo) return;
    const hasPhotos = Object.keys(palletFiles).length > 0 || fotoFiles.length > 0;
    if (hasPhotos) { setTipoPending(val); } else { setTipo(val); }
  };
  useEffect(() => { if (!tieneErrores) { setTiposError([]); setProductos([]); } }, [tieneErrores]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (tiendaRef.current && !tiendaRef.current.contains(e.target as Node)) setTiendaOpen(false); };
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler);
  }, []);

  const getDraftEntryId = () => {
    if (!draftEntryIdRef.current) draftEntryIdRef.current = `AUD-${Date.now()}`;
    return draftEntryIdRef.current;
  };
  const deleteStoragePath = (path: string) => {
    if (!path || !user) return;
    void supabase.storage.from('audit-photos').remove([path]).then(() => {}, () => {});
  };

  // ── Persistent session: save to localStorage + Supabase (cross-device sync) ──
  const saveSession = useCallback(() => {
    const uid = user?.id;
    if (formPhase === 'scan' || formPhase === 'result') {
      try { localStorage.removeItem(sessionKey(uid)); localStorage.removeItem(AUDIT_SESSION_KEY); } catch { /* */ }
      if (uid) void supabase.from('audit_active_sessions').delete().eq('user_id', uid).then(() => {}, () => {});
      return;
    }
    const data = {
      formPhase, auditStartTime, auditor, pickerNombre, pickerNombres, picker,
      tiendaCod: tienda?.cod ?? null, tipo, tipoLocked, operaciones, pallets,
      tieneErrores, tiposError, productos, observaciones,
      draftEntryId: draftEntryIdRef.current,
      palletStorageUrls, fotoStorageUrls, fotoStoragePaths,
      errorFotoStorageUrls, errorFotoStoragePaths,
      savedAt: new Date().toISOString(),
    };
    try { localStorage.setItem(sessionKey(uid), JSON.stringify(data)); } catch { /* storage full */ }
    // Sync to Supabase so other devices with the same account can restore this session
    if (uid && navigator.onLine) {
      supabase.from('audit_active_sessions')
        .upsert({ user_id: uid, session_data: data, updated_at: new Date().toISOString() })
        .then(() => {}, () => {});
    }
  }, [formPhase, auditStartTime, auditor, pickerNombre, pickerNombres, picker, tienda, tipo, tipoLocked, operaciones, pallets, tieneErrores, tiposError, productos, observaciones, palletStorageUrls, fotoStorageUrls, fotoStoragePaths, errorFotoStorageUrls, errorFotoStoragePaths, user?.id]);

  // Autosave every 2 s when setup/execution is active (localStorage + Supabase)
  useEffect(() => {
    if (formPhase !== 'execution' && formPhase !== 'setup') return;
    const handle = setTimeout(saveSession, 2000);
    return () => clearTimeout(handle);
  }, [formPhase, auditor, pickerNombre, pickerNombres, picker, tienda, tipo, operaciones, pallets, tieneErrores, tiposError, productos, observaciones, saveSession]);

  // Guardar inmediatamente cuando cambia pallets en ejecución — evita pérdida si iOS
  // mata el tab mientras el usuario abre la cámara justo después de ingresar el número
  useEffect(() => {
    if (formPhase === 'execution' && pallets) saveSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pallets]);

  // Bug 1 iOS/Android: guardar sesión inmediatamente al subir fotos (sin esperar debounce 2s)
  // Si el tab muere entre la subida y el guardado, las fotos se conservan en la sesión
  useEffect(() => {
    if (formPhase === 'execution') saveSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotoStorageUrls, errorFotoStorageUrls, palletStorageUrls]);

  // Save immediately when tab is hidden (user switches app)
  useEffect(() => {
    const onHide = () => saveSession();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [saveSession]);

  // Realtime: escucha cambios en la sesión del mismo usuario desde otro dispositivo.
  // Solo activo cuando no hay auditoría local (formPhase='scan').
  useEffect(() => {
    if (!user?.id || formPhase !== 'scan') { setRemoteSession(null); return; }
    const ch = supabase
      .channel(`audit_session_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_active_sessions', filter: `user_id=eq.${user.id}` },
        payload => {
          if (payload.eventType === 'DELETE') { setRemoteSession(null); return; }
          const row = (payload.new ?? {}) as Record<string, unknown>;
          const sd = row.session_data as Record<string, unknown> | null;
          if (sd?.formPhase === 'execution' || sd?.formPhase === 'setup') setRemoteSession(sd);
          else setRemoteSession(null);
        })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user?.id, formPhase]);

  // Warn before navigating away while audit is in progress
  useEffect(() => {
    if (formPhase !== 'execution') return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [formPhase]);

  // Wake Lock: prevent screen from turning off during execution
  useEffect(() => {
    if (formPhase !== 'execution' || typeof navigator === 'undefined' || !navigator.wakeLock) return;
    let cancelled = false;
    navigator.wakeLock.request('screen').then(lock => {
      if (!cancelled) wakeLockRef.current = lock;
    }).catch(() => { /* optional feature */ });
    return () => {
      cancelled = true;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [formPhase]);

  // Re-acquire wake lock when page becomes visible again (OS releases it on hide)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.wakeLock) return;
    const reacquire = () => {
      if (document.visibilityState === 'visible' && formPhase === 'execution') {
        navigator.wakeLock!.request('screen').then(lock => { wakeLockRef.current = lock; }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', reacquire);
    return () => document.removeEventListener('visibilitychange', reacquire);
  }, [formPhase]);

  // Legacy global key cleanup: remove any old unscoped session so it doesn't leak between users
  useEffect(() => {
    try { localStorage.removeItem(AUDIT_SESSION_KEY); } catch { /* empty */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-device session restore: runs after auth loads, only when no local session was found
  useEffect(() => {
    if (!user?.id || authLoading) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (formPhase !== 'scan') return; // don't override an already-active session

    type SD = { formPhase?: string; auditStartTime?: string; auditor?: string; pickerNombre?: string; pickerNombres?: string[]; picker?: string; tiendaCod?: string | null; tipo?: TipoAuditoria; tipoLocked?: boolean; operaciones?: OperacionEntry[]; pallets?: string; tieneErrores?: boolean | null; tiposError?: TipoError[]; productos?: ProductoError[]; observaciones?: string; savedAt?: string; draftEntryId?: string; palletStorageUrls?: Record<string, string>; fotoStorageUrls?: string[]; fotoStoragePaths?: string[]; errorFotoStorageUrls?: string[]; errorFotoStoragePaths?: string[]; };

    const applySD = (s: SD, isCrossDevice: boolean) => {
      if (!s.savedAt || Date.now() - new Date(s.savedAt).getTime() > 10 * 3600 * 1000) return false;
      if (s.auditor)        { setAuditor(s.auditor); auditorFromProfile.current = false; }
      if (s.pickerNombre)   setPickerNombre(s.pickerNombre);
      if (s.pickerNombres?.length) setPickerNombres(s.pickerNombres);
      if (s.picker)         setPicker(s.picker);
      if (s.tiendaCod)      setTienda(TODAS_LAS_TIENDAS.find(t => t.cod === s.tiendaCod) ?? null);
      if (s.tipo) {
        // Siempre setear directamente — si tipo no cambió, useEffect([tipo]) NO dispara
        // y pendingScanRef quedaría sin consumir, dejando operaciones vacías.
        if (s.operaciones?.length) {
          pendingScanRef.current = s.operaciones; // consumido si tipo cambia
          setOperaciones(s.operaciones as OperacionEntry[]); // fallback si tipo no cambia
        }
        setTipo(s.tipo);
      } else if (s.operaciones?.length) {
        setOperaciones(s.operaciones as OperacionEntry[]);
      }
      if (s.tipoLocked)     setTipoLocked(s.tipoLocked);
      if (s.pallets)        setPallets(s.pallets);
      if (s.tieneErrores !== undefined) setTieneErrores(s.tieneErrores ?? null);
      if (s.tiposError?.length)  setTiposError(s.tiposError);
      if (s.productos?.length)   setProductos(s.productos);
      if (s.observaciones)  setObservaciones(s.observaciones);
      if (s.draftEntryId) draftEntryIdRef.current = s.draftEntryId;
      if (s.palletStorageUrls && Object.keys(s.palletStorageUrls).length > 0) {
        setPalletStorageUrls(s.palletStorageUrls);
        setPalletPreviews(s.palletStorageUrls);
      }
      if (s.fotoStorageUrls?.length) {
        setFotoStorageUrls(s.fotoStorageUrls);
        setFotoStoragePaths(s.fotoStoragePaths ?? []);
        setFotoPreviews(s.fotoStorageUrls.filter(Boolean));
      }
      if (s.errorFotoStorageUrls?.length) {
        setErrorFotoStorageUrls(s.errorFotoStorageUrls);
        setErrorFotoStoragePaths(s.errorFotoStoragePaths ?? []);
        setErrorFotoPreviews(s.errorFotoStorageUrls.filter(Boolean));
      }
      if (s.formPhase === 'execution' || s.formPhase === 'setup') {
        setFormPhase(s.formPhase as 'execution' | 'setup');
        if (s.formPhase === 'execution' && s.auditStartTime) {
          auditStartTimeRef.current = s.auditStartTime;
          setAuditStartTime(s.auditStartTime);
          const elapsed = Math.floor((Date.now() - new Date(s.auditStartTime).getTime()) / 1000);
          setTimerSeconds(Math.max(0, elapsed));
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = setInterval(() => {
            const e = Math.floor((Date.now() - new Date(auditStartTimeRef.current).getTime()) / 1000);
            setTimerSeconds(Math.max(0, e));
          }, 1000);
          if (isCrossDevice) setCrossDeviceRestored(true); else setSessionRestored(true);
        }
      }
      return true;
    };

    // 1. Try per-user localStorage key (same device, same account, new key format)
    try {
      const localRaw = localStorage.getItem(sessionKey(user.id));
      if (localRaw) {
        const s = JSON.parse(localRaw) as SD;
        if (applySD(s, false)) return;
        localStorage.removeItem(sessionKey(user.id));
      }
    } catch { /* corrupt */ }

    // 2. Fallback to Supabase (different device with same account)
    supabase.from('audit_active_sessions')
      .select('session_data')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.session_data) return;
        const s = data.session_data as SD;
        if (!s.savedAt || Date.now() - new Date(s.savedAt).getTime() > 10 * 3600 * 1000) {
          void supabase.from('audit_active_sessions').delete().eq('user_id', user.id).then(() => {}, () => {});
          return;
        }
        applySD(s, true);
      }, () => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  useEffect(() => () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); }, []);

  const correccion = useMemo<CorreccionAuditoria>(() => {
    if (!tieneErrores) return 'correcto';
    const f = tiposError.includes('faltante'), s = tiposError.includes('sobrante');
    if (f && s) return 'cruce'; if (f) return 'faltante'; if (s) return 'sobrante'; return 'correcto';
  }, [tieneErrores, tiposError]);
  const resultado = useMemo<ResultadoAuditoria>(() => tieneErrores === true ? 'malo' : 'bueno', [tieneErrores]);

  const tiendaFiltered = TODAS_LAS_TIENDAS.filter(t => {
    const q = tiendaQuery.toLowerCase();
    return !q || t.nombre.toLowerCase().includes(q) || t.cod.toLowerCase().includes(q) || t.region.toLowerCase().includes(q);
  });

  const updateOperacion = (i: number, codigo: string) => setOperaciones(ops => ops.map((op, j) => j === i ? { ...op, codigo } : op));

  const handleOpSelect = (_codigo: string, responsable: string | undefined) => {
    if (responsable) {
      const match = matchPickerNames(responsable, PICKER_NAMES);
      if (match) {
        setPicker(match);
        setOdooAutoDetected(true);
        showToast(`Picker detectado: ${displayPicker(match, PICKER_NAMES)}`, '#2563EB');
      }
    }
  };

  // Carga un pallet por ID numérico desde picking_pallets y auto-rellena el formulario
  const ORIGIN_CATS: { kw: string; st: SubTipo }[] = [
    { kw: 'Abastecimiento Comida', st: 'comida' },
    { kw: 'Abastecimiento Aseo',   st: 'aseo' },
    { kw: 'Abastecimiento Hogar',  st: 'hogar' },
  ];

  // Obtiene datos de un pallet por ID: picker, tienda, mapa subtipo→código
  const fetchPalletCodeMap = async (idStr: string): Promise<{
    store_cod: string; picker_label: string; picker_key: string;
    codeBySubtipo: Partial<Record<SubTipo, string>>;
  } | null> => {
    const res  = await authedFetch(`/api/picking-pallets?id=${idStr.trim()}`);
    const json = await res.json() as { data?: { store_cod: string; state_key: string; picker_label: string; contenido: string; refs: string }; error?: string };
    if (!res.ok || !json.data) return null;
    const { store_cod, state_key, picker_label, contenido, refs: rawRefs } = json.data;
    // picker_key: parte de state_key después de '__', capitalizada → coincide con picker (Id. pistola)
    const rawKey = (state_key.split('__')[1] ?? '').trim();
    const picker_key = rawKey ? rawKey.replace(/\b\w/g, c => c.toUpperCase()) : '';

    const codeBySubtipo: Partial<Record<SubTipo, string>> = {};

    if (odooConfig.url) {
      try {
        const pickerKey = (state_key.split('__')[1] ?? '').toLowerCase().trim();
        const odooRes = await fetch('/api/odoo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'picking_today_operations', config: odooConfig, query: store_cod }),
        });
        const odooData = await odooRes.json() as { pickings?: Array<{ name: string; responsible: string; origin: string }> };
        if (odooRes.ok && odooData.pickings?.length) {
          const matching = odooData.pickings.filter(p =>
            (p.responsible ?? '').toLowerCase().trim() === pickerKey
          );
          for (const op of matching) {
            for (const { kw, st } of ORIGIN_CATS) {
              if ((op.origin ?? '').includes(kw)) { codeBySubtipo[st] = op.name; break; }
            }
          }
        }
      } catch { /* sigue con fallback */ }
    }

    // Fallback si Odoo no devolvió nada: contenido del DB + refs posicionales
    if (Object.keys(codeBySubtipo).length === 0) {
      const VALID_TIPOS: TipoAuditoria[] = ['comida','hogar','aseo','comida-aseo','aseo-hogar','completo'];
      const fallbackTipo = contenido === 'mixto' ? 'comida-aseo' :
        (VALID_TIPOS.includes(contenido as TipoAuditoria) ? contenido as TipoAuditoria : 'comida');
      rawRefs.split('+').filter(Boolean).forEach((code, i) => {
        const st = TIPO_TO_SUBTIPOS[fallbackTipo][i];
        if (st) codeBySubtipo[st] = code;
      });
    }

    return { store_cod, picker_label, picker_key, codeBySubtipo };
  };

  const handlePalletIdLookup = async (id1: string, id2?: string) => {
    const trimId1 = id1.trim();
    if (!trimId1 || !/^\d+$/.test(trimId1)) { setPalletIdError('Ingresa un número válido'); return; }
    const trimId2 = id2?.trim() ?? '';
    if (trimId2 && !/^\d+$/.test(trimId2)) { setPalletIdError2('Ingresa un número válido'); return; }

    setPalletIdLoading(true); setPalletIdError(''); setPalletIdError2('');
    try {
      // Pallet 1 (obligatorio)
      const p1 = await fetchPalletCodeMap(trimId1);
      if (!p1) { setPalletIdError('ID no encontrado'); return; }

      // Mapa combinado con atribución por picker
      const combined: Partial<Record<SubTipo, string>> = { ...p1.codeBySubtipo };
      const pickerNombreBySubtipo: Partial<Record<SubTipo, string>> = {};
      for (const st of Object.keys(p1.codeBySubtipo) as SubTipo[]) {
        pickerNombreBySubtipo[st] = p1.picker_label;
      }

      const involvedPickers: string[] = p1.picker_label.trim() ? [p1.picker_label.trim()] : [];
      const involvedPickerKeys: string[] = p1.picker_key ? [p1.picker_key] : [];

      if (trimId2) {
        const p2 = await fetchPalletCodeMap(trimId2);
        if (!p2) { setPalletIdError2('ID no encontrado'); return; }

        // Validar misma tienda
        if (p2.store_cod !== p1.store_cod) {
          setPalletIdError2(`Tienda diferente — el pallet #${trimId2} pertenece a ${p2.store_cod}`);
          return;
        }

        // Agregar operaciones del pallet 2 que no estaban en el 1
        for (const [st, code] of Object.entries(p2.codeBySubtipo) as [SubTipo, string][]) {
          if (!combined[st]) {
            combined[st] = code;
            pickerNombreBySubtipo[st] = p2.picker_label;
          }
        }

        if (p2.picker_label.trim() && p2.picker_label.trim() !== p1.picker_label.trim()) {
          involvedPickers.push(p2.picker_label.trim());
        }
        if (p2.picker_key && p2.picker_key !== p1.picker_key) {
          involvedPickerKeys.push(p2.picker_key);
        }
      }

      // Tipo desde el mapa combinado
      const foundSts = Object.keys(combined) as SubTipo[];
      const newTipo: TipoAuditoria = foundSts.length > 0 ? catsToTipo(foundSts.join(',')) : 'comida';

      const orderedCodes = TIPO_TO_SUBTIPOS[newTipo].map(st => combined[st] ?? '');
      const newOperaciones: OperacionEntry[] = TIPO_TO_SUBTIPOS[newTipo].map((st, i) => ({
        subTipo: st,
        codigo: orderedCodes[i],
        ...(involvedPickers.length > 1 && pickerNombreBySubtipo[st]
          ? { pickerNombre: pickerNombreBySubtipo[st] }
          : {}),
      }));

      if (p1.picker_label.trim()) setPickerNombre(p1.picker_label.trim());
      setPickerNombres(involvedPickers);
      // Id. pistola: combinar todos los grupos Odoo involucrados
      if (involvedPickerKeys.length > 0) {
        setPicker(involvedPickerKeys.join(' + '));
        setOdooAutoDetected(true);
      }

      const matchedTienda = TODAS_LAS_TIENDAS.find(t => t.cod === p1.store_cod);
      if (matchedTienda) setTienda(matchedTienda);

      if (newTipo !== tipo) {
        pendingScanRef.current = newOperaciones;
        setTipo(newTipo);
      } else {
        setOperaciones(newOperaciones);
      }

      const idLabel = trimId2 ? `#${trimId1}+${trimId2}` : `#${trimId1}`;
      const pickerLabel = involvedPickers.length > 1 ? involvedPickers.join(' + ') : (involvedPickers[0] ?? '');
      showToast(`✓ ${idLabel} · ${p1.store_cod} · ${pickerLabel} · ${newTipo.toUpperCase()}`, '#16A34A');
      setTipoLocked(true);
      setPalletIdInput(''); setPalletIdInput2(''); setShowPalletId2(false);
      setFormPhase('setup');
    } catch {
      setPalletIdError('Error de conexión');
    } finally {
      setPalletIdLoading(false);
    }
  };

  // Lookup por ID canónico (P{seq}{cod}{stamp}P, etc.). Resuelve cod y tipo
  // contra despacho_rm/despacho_regiones y pre-rellena la tienda. Si además
  // existe un picking_pallets matching (por slot_id), reutiliza el flujo
  // existente para auto-rellenar picker + operaciones.
  const handleCanonicalIdLookup = async (canonicalId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/pallet-lookup?id=${encodeURIComponent(canonicalId)}`);
      if (!res.ok) {
        showToast(`✗ ID no encontrado: ${canonicalId}`, '#D32F2F');
        return;
      }
      const json = await res.json() as {
        data?: { source: string; id: string; cod: string; tienda: string; tipo: string; carga: string };
      };
      if (!json.data) {
        showToast(`✗ ID no encontrado: ${canonicalId}`, '#D32F2F');
        return;
      }
      const { cod, tipo: rmTipo } = json.data;

      // Si la búsqueda cayó en picking_pallets (slot legacy), reutilizar el flujo
      // existente que sí carga picker + operaciones desde Odoo.
      if (json.data.source === 'picking_pallets') {
        void handlePalletIdLookup(json.data.id);
        return;
      }

      const matchedTienda = TODAS_LAS_TIENDAS.find(t => t.cod === cod) ?? null;
      if (matchedTienda) setTienda(matchedTienda);

      // Guarda el canonical_id escaneado para persistirlo luego en audit_entries
      setScannedCanonicalId(canonicalId);

      showToast(`✓ ${canonicalId} · ${cod} · ${rmTipo}`, '#16A34A');
      // Saltamos al setup como hace el flujo legacy para que el supervisor
      // termine de seleccionar picker y subtipos manualmente.
      setFormPhase('setup');
    } catch {
      showToast('✗ Error de conexión al buscar el ID', '#D32F2F');
    }
  };

  // Parsea código de barra del pallet: COD|PickerName|Refs|P#|Cats
  const handleBarcodeScan = (raw: string): boolean => {
    const clean = raw.trim();
    // Si el código es solo numérico, tratarlo como ID de pallet y buscar en Odoo
    if (/^\d{1,10}$/.test(clean)) {
      void handlePalletIdLookup(clean);
      return true;
    }
    // ID canónico (sin separadores, formato P{seq}{cod}{stamp}P / {seq}B{cod}{stamp}B / etc.)
    if (!clean.includes(';') && !clean.includes('|')
        && /\d{8}/.test(clean) && /^[A-Z]?[A-Z]?\d+.*(?:P|B|C|CH)$/i.test(clean)) {
      void handleCanonicalIdLookup(clean);
      return true;
    }
    // Separador ';' (sin modificador de teclado). Fallback legacy con '|' para etiquetas antiguas.
    const sep = raw.includes(';') ? ';' : '|';
    const parts = raw.split(sep);
    if (parts.length < 3) return false;
    const [storeCod, pickerName, refs, , cats] = parts;
    const opCodes = (refs ?? '').split('+').filter(Boolean);
    if (opCodes.length === 0) return false;

    const newTipo = cats ? catsToTipo(cats) : tipo;
    const newOps: OperacionEntry[] = TIPO_TO_SUBTIPOS[newTipo].map((st, i) => ({ subTipo: st, codigo: opCodes[i] ?? '' }));
    const matchedTienda = TODAS_LAS_TIENDAS.find(t => t.cod === storeCod) ?? null;

    // Modo segundo escaneo: combinar con el primer resultado
    if (showSecondScan && firstScanRef.current) {
      const first = firstScanRef.current;
      const combinedOps: OperacionEntry[] = [...first.operaciones];
      for (const op of newOps) {
        if (!combinedOps.find(o => o.subTipo === op.subTipo)) combinedOps.push(op);
      }
      const combinedTipo: TipoAuditoria = catsToTipo(combinedOps.map(o => o.subTipo).join(','));
      const pickerLabel = [first.pickerNombre, pickerName?.trim()].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' + ');
      if (pickerLabel) setPickerNombre(pickerLabel);
      if (matchedTienda) setTienda(matchedTienda);
      if (combinedTipo !== tipo) {
        pendingScanRef.current = combinedOps;
        setTipo(combinedTipo);
      } else {
        setOperaciones(combinedOps);
      }
      setTipoLocked(true);
      showToast(`✓ ${storeCod} · ${pickerLabel || 'sin nombre'} · 2 códigos`, '#16A34A');
      firstScanRef.current = null;
      setFirstScanDone(false);
      setShowSecondScan(false);
      setFormPhase('setup');
      return true;
    }

    // Modo primer escaneo con segundo pendiente
    if (showSecondScan) {
      firstScanRef.current = { tipo: newTipo, operaciones: newOps, tienda: matchedTienda, picker: '', pickerNombre: pickerName?.trim() ?? '' };
      setFirstScanDone(true);
      showToast(`✓ Código 1 leído — ahora escanea el 2°`, '#2563EB');
      return true;
    }

    // Modo normal (un solo escaneo)
    if (pickerName?.trim()) setPickerNombre(pickerName.trim());
    if (matchedTienda) setTienda(matchedTienda);
    if (newTipo !== tipo) {
      pendingScanRef.current = newOps;
      setTipo(newTipo);
    } else {
      setOperaciones(newOps);
    }
    setTipoLocked(true);
    showToast(`✓ ${storeCod} · ${pickerName?.trim() || 'sin nombre'}`, '#16A34A');
    setFormPhase('setup');
    return true;
  };

  const toggleTipoError = (t: TipoError) => { setTiposError(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]); setProductos([]); };

  const startTimer = () => {
    const now = new Date().toISOString();
    auditStartTimeRef.current = now;  // sync ref immediately so interval reads correct value
    setAuditStartTime(now);
    setTimerSeconds(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(auditStartTimeRef.current).getTime()) / 1000);
      setTimerSeconds(Math.max(0, elapsed));
    }, 1000);
  };
  const stopTimer = () => {
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
  };

  // Limpia el formulario al volver desde setup → scan (sin fotos que borrar en setup)
  const handleBackFromSetup = () => {
    photoUploadingRef.current = false; // liberar guard por si había upload en setup
    try { localStorage.removeItem(sessionKey(user?.id)); } catch { /* */ }
    if (user?.id) void supabase.from('audit_active_sessions').delete().eq('user_id', user.id).then(() => {}, () => {});
    setFormPhase('scan');
    setTienda(null); setTiendaQuery('');
    setPicker(''); setPickerNombre(''); setPickerNombres([]); setOdooAutoDetected(false);
    setTipo('comida');
    setOperaciones(TIPO_TO_SUBTIPOS['comida'].map(st => ({ subTipo: st, codigo: '' })));
    setPalletIdInput(''); setPalletIdError('');
    setPalletIdInput2(''); setPalletIdError2(''); setShowPalletId2(false);
    setTipoLocked(false); setShowSecondScan(false); setFirstScanDone(false); firstScanRef.current = null;
    setScannedCanonicalId(null);
  };

  // Cancela auditoría en ejecución: borra fotos subidas, limpia sesión y estado
  const handleCancelAudit = () => {
    setConfirmCancel(false);
    stopTimer();
    // Liberar guard de foto — sin esto los inputs quedan permanentemente bloqueados
    photoUploadingRef.current = false;
    const pathsToDelete = [...fotoStoragePaths, ...errorFotoStoragePaths].filter(Boolean);
    const draftId = draftEntryIdRef.current;
    if (draftId) {
      Object.keys(palletStorageUrls).forEach(k => pathsToDelete.push(`${user?.id}/${draftId}_pallet${k}.jpg`));
    }
    if (pathsToDelete.length > 0 && user)
      void supabase.storage.from('audit-photos').remove(pathsToDelete).then(() => {}, () => {});
    try { localStorage.removeItem(sessionKey(user?.id)); localStorage.removeItem(AUDIT_SESSION_KEY); } catch { /* */ }
    if (user?.id) void supabase.from('audit_active_sessions').delete().eq('user_id', user.id).then(() => {}, () => {});
    setSessionRestored(false); setCrossDeviceRestored(false);
    setTienda(null); setTiendaQuery(''); setPicker(''); setPickerNombre(''); setPickerNombres([]); setOdooAutoDetected(false);
    setTipo('comida'); setPallets('');
    setOperaciones(TIPO_TO_SUBTIPOS['comida'].map(st => ({ subTipo: st, codigo: '' })));
    setPalletIdInput(''); setPalletIdError('');
    setPalletIdInput2(''); setPalletIdError2(''); setShowPalletId2(false);
    setTipoLocked(false); setShowSecondScan(false); setFirstScanDone(false); firstScanRef.current = null;
    setTieneErrores(null); setTiposError([]); setProductos([]); setObservaciones(''); setReauditoriaOrigen(null);
    setScannedCanonicalId(null);
    Object.values(palletPreviews).forEach(url => URL.revokeObjectURL(url));
    setPalletFiles({}); setPalletPreviews({}); setPalletWarnings({}); setPalletStorageUrls({});
    fotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setFotoFiles([]); setFotoPreviews([]); setFotoWarnings([]); setFotoStorageUrls([]); setFotoStoragePaths([]);
    errorFotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setErrorFotoFiles([]); setErrorFotoPreviews([]); setErrorFotoWarnings([]); setErrorFotoStorageUrls([]); setErrorFotoStoragePaths([]);
    draftEntryIdRef.current = '';
    setTimerSeconds(0); setAuditStartTime(''); auditStartTimeRef.current = '';
    setSubmitting(false); setUploadProgress(''); setSubmitAttempted(false); setPhotoUploading(false);
    setFormPhase('scan');
  };

  const canSubmit = !!auditor.trim() && !!tienda && operaciones.length > 0 && operaciones.every(op => op.codigo.trim()) && !!pallets && parseInt(pallets) > 0 && tieneErrores !== null && (!tieneErrores || tiposError.length > 0);

  const handleSubmitClick = () => {
    setSubmitAttempted(true);
    if (!auditor.trim()) { showToast('Ingresa el nombre del auditor', '#D97706'); return; }
    if (!tienda) { showToast('Selecciona una tienda', '#D97706'); return; }
    if (!operaciones.length || operaciones.some(op => !op.codigo.trim())) { operacionesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); showToast('Completa todas las operaciones', '#D97706'); return; }
    if (!pallets || parseInt(pallets) <= 0) { palletsInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); showToast('Ingresa la cantidad de pallets', '#D97706'); return; }
    if (tieneErrores === null) { tieneErroresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); showToast('¿Tuvo errores? — indica Sí o No', '#D97706'); return; }
    if (tieneErrores && tiposError.length === 0) { tieneErroresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); showToast('Selecciona el tipo de error', '#D97706'); return; }
    setConfirmSubmit(true);
  };

  const handleSubmit = async () => {
    setConfirmSubmit(false);
    if (!tienda || submitting) return;
    stopTimer();
    const durSecs = timerSeconds;
    const endNow = new Date().toISOString();
    setSubmitting(true);
    const now = new Date();
    // Use pre-generated draft entry ID so photos are already at their final path
    const entryId = draftEntryIdRef.current || `AUD-${Date.now()}`;
    const palletCount = parseInt(pallets) || 0;
    const canUploadPhotos = user && navigator.onLine;

    // Start from already-uploaded URLs (photos uploaded on select)
    const uploadedFotos: { label: string; url: string }[] = [];
    Array.from({ length: palletCount }, (_, i) => String(i + 1)).forEach(k => {
      if (palletStorageUrls[k]) uploadedFotos.push({ label: `Pallet ${k}`, url: palletStorageUrls[k] });
    });
    const uploadedFotoUrls: string[]      = fotoStorageUrls.filter(Boolean);
    const uploadedErrorFotoUrls: string[] = errorFotoStorageUrls.filter(Boolean);

    // Upload any photos that didn't get uploaded yet (e.g. user was offline when selecting)
    const pendingPallets = Array.from({ length: palletCount }, (_, i) => String(i + 1))
      .filter(k => !palletStorageUrls[k] && palletFiles[k])
      .map(k => ({ k, file: palletFiles[k] }));
    const pendingFotos  = fotoFiles.filter((_, fi) => !fotoStorageUrls[fi]);
    const pendingErrors = errorFotoFiles.filter((_, fi) => !errorFotoStorageUrls[fi]);
    const totalPending  = pendingPallets.length + pendingFotos.length + pendingErrors.length;

    if (canUploadPhotos && totalPending > 0) {
      setUploadProgress(`Subiendo fotos (0/${totalPending})…`);
      let uploaded = 0;
      let failedUploads = 0;
      await Promise.all([
        ...pendingPallets.map(async ({ k, file }) => {
          const path = `${user.id}/${entryId}_pallet${k}.jpg`;
          const { error } = await supabase.storage.from('audit-photos').upload(path, file, { contentType: 'image/jpeg', upsert: true });
          uploaded++; setUploadProgress(`Subiendo fotos (${uploaded}/${totalPending})…`);
          if (!error) uploadedFotos.push({ label: `Pallet ${k}`, url: supabase.storage.from('audit-photos').getPublicUrl(path).data.publicUrl });
          else failedUploads++;
        }),
        ...pendingFotos.map(async (file, fi) => {
          const path = `${user.id}/${entryId}_foto${fi + 1}.jpg`;
          const { error } = await supabase.storage.from('audit-photos').upload(path, file, { contentType: 'image/jpeg', upsert: true });
          uploaded++; setUploadProgress(`Subiendo fotos (${uploaded}/${totalPending})…`);
          if (!error) uploadedFotoUrls.push(supabase.storage.from('audit-photos').getPublicUrl(path).data.publicUrl);
          else failedUploads++;
        }),
        ...pendingErrors.map(async (file, fi) => {
          const path = `${user.id}/${entryId}_error${fi + 1}.jpg`;
          const { error } = await supabase.storage.from('audit-photos').upload(path, file, { contentType: 'image/jpeg', upsert: true });
          uploaded++; setUploadProgress(`Subiendo fotos (${uploaded}/${totalPending})…`);
          if (!error) uploadedErrorFotoUrls.push(supabase.storage.from('audit-photos').getPublicUrl(path).data.publicUrl);
          else failedUploads++;
        }),
      ]);
      if (failedUploads > 0) showToast(`⚠ ${failedUploads} foto${failedUploads > 1 ? 's' : ''} no se pudo subir — auditoría guardada, reintenta desde historial`, '#D97706');
    }

    setUploadProgress('Guardando…');
    const entry: AuditEntry = {
      id: entryId, fecha: now.toLocaleDateString('es-CL'), hora: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
      auditor: auditor.trim(), picker: picker.trim(),
      pickerNombre: (pickerNombres.length > 1 ? pickerNombres.join(' + ') : pickerNombre.trim()) || undefined,
      tiendaCod: tienda.cod, tiendaNombre: tienda.nombre, tiendaArea: tienda.area,
      tipo, operaciones, pallets: palletCount, tieneErrores: tieneErrores === true, tiposError, productos,
      correccion, resultado, observaciones: observaciones.trim(), reauditoriaDeId: reauditoriaOrigen?.id,
      fotoUrls:        uploadedFotoUrls.length      > 0 ? uploadedFotoUrls      : undefined,
      errorFotoUrls:   uploadedErrorFotoUrls.length > 0 ? uploadedErrorFotoUrls : undefined,
      palletFotos:     uploadedFotos.length         > 0 ? uploadedFotos         : undefined,
      startTime:       auditStartTime || undefined,
      endTime:         auditStartTime ? endNow : undefined,
      durationSeconds: auditStartTime ? durSecs : undefined,
      canonicalId:     scannedCanonicalId ?? undefined,
    };
    setHistory([entry, ...history.slice(0, 199)]);
    if (user) {
      const row = entryToRow(entry, user.id);
      if (!navigator.onLine) {
        const q = loadOfflineQueue();
        q.push({ row, userId: user.id, entryId: entry.id });
        saveOfflineQueue(q);
        showToast('Sin conexión — auditoría guardada localmente', '#D97706');
      } else {
        supabase.from('audit_entries').insert(row)
          .then(({ error }) => {
            if (error) {
              console.error('Audit save:', error.message);
              const q = loadOfflineQueue();
              q.push({ row, userId: user.id, entryId: entry.id });
              saveOfflineQueue(q);
              showToast('⚠ Error al guardar — se sincronizará cuando haya conexión', '#D97706');
            }
          });

        // Fire-and-forget: marcar pallet como auditado en despacho_rm/regiones.
        // No bloquea el flujo principal y, si falla, solo afecta el badge en Estado.
        if (scannedCanonicalId) {
          const cid = scannedCanonicalId;
          const auditadoAt = new Date().toISOString();
          void (async () => {
            try {
              const rmRes = await supabase
                .from('despacho_rm')
                .update({ auditado: true, auditado_at: auditadoAt, auditado_canonical_id: cid })
                .eq('id', cid)
                .select('id');
              if (rmRes.error || !rmRes.data || rmRes.data.length === 0) {
                await supabase
                  .from('despacho_regiones')
                  .update({ auditado: true, auditado_at: auditadoAt, auditado_canonical_id: cid })
                  .eq('id', cid);
              }
            } catch {
              /* silencioso: solo afecta badge */
            }
          })();
        }
      }
    }
    try { const prev = JSON.parse(localStorage.getItem('auditHistory') || '[]') as AuditEntry[]; prev.push(entry); localStorage.setItem('auditHistory', JSON.stringify(prev.slice(-200))); } catch { /* empty */ }
    sheetsAuditoriaWrite(entry, state.sheetsUrl);
    showToast(`✓ Auditoría — ${resultado === 'bueno' ? 'BUENO' : 'MALO'}`, resultado === 'bueno' ? '#16A34A' : '#D32F2F');
    try { localStorage.removeItem(sessionKey(user?.id)); localStorage.removeItem(AUDIT_SESSION_KEY); } catch { /* empty */ }
    if (user?.id) void supabase.from('audit_active_sessions').delete().eq('user_id', user.id).then(() => {}, () => {});
    setSessionRestored(false); setCrossDeviceRestored(false);
    setTienda(null); setTiendaQuery(''); setPicker(''); setPickerNombre(''); setPickerNombres([]); setOdooAutoDetected(false); setTipo('comida'); setPallets('');
    setOperaciones(TIPO_TO_SUBTIPOS['comida'].map(st => ({ subTipo: st, codigo: '' })));
    setPalletIdInput(''); setPalletIdError('');
    setPalletIdInput2(''); setPalletIdError2(''); setShowPalletId2(false);
    setTipoLocked(false); setShowSecondScan(false); setFirstScanDone(false); firstScanRef.current = null;
    setTieneErrores(null); setTiposError([]); setProductos([]); setObservaciones(''); setReauditoriaOrigen(null);
    setScannedCanonicalId(null);
    Object.values(palletPreviews).forEach(url => URL.revokeObjectURL(url));
    setPalletFiles({}); setPalletPreviews({}); setPalletWarnings({}); setPalletStorageUrls({});
    fotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setFotoFiles([]); setFotoPreviews([]); setFotoWarnings([]); setFotoStorageUrls([]); setFotoStoragePaths([]);
    errorFotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setErrorFotoFiles([]); setErrorFotoPreviews([]); setErrorFotoWarnings([]); setErrorFotoStorageUrls([]); setErrorFotoStoragePaths([]);
    draftEntryIdRef.current = '';
    photoUploadingRef.current = false; // garantizar que inputs de foto queden libres en el siguiente audit
    setSubmitting(false); setUploadProgress(''); setSubmitAttempted(false); setPhotoUploading(false); setPhotoUploadMsg('');
    setLastEntry(entry);
    setLastDurationSeconds(durSecs);
    setFormPhase('result');
    setTimerSeconds(0);
    setAuditStartTime('');
  };

  const iniciarReauditoria = (entry: AuditEntry) => {
    if (reauditoriaOrigen) { showToast('Termina o cancela la re-auditoría en curso primero', '#D97706'); return; }
    // Limpiar guard + fotos residuales de la sesión anterior antes de arrancar
    photoUploadingRef.current = false;
    draftEntryIdRef.current   = '';
    Object.values(palletPreviews).forEach(url => URL.revokeObjectURL(url));
    setPalletFiles({}); setPalletPreviews({}); setPalletWarnings({}); setPalletStorageUrls({});
    fotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setFotoFiles([]); setFotoPreviews([]); setFotoWarnings([]); setFotoStorageUrls([]); setFotoStoragePaths([]);
    errorFotoPreviews.forEach(url => URL.revokeObjectURL(url));
    setErrorFotoFiles([]); setErrorFotoPreviews([]); setErrorFotoWarnings([]); setErrorFotoStorageUrls([]); setErrorFotoStoragePaths([]);
    setPallets(''); setTimerSeconds(0); setAuditStartTime(''); auditStartTimeRef.current = '';
    setReauditoriaOrigen(entry);
    setTienda(TODAS_LAS_TIENDAS.find(t => t.cod === entry.tiendaCod) ?? null);
    setTiendaQuery(''); setTipo(entry.tipo); setPicker(entry.picker || ''); setPickerNombre('');
    setPickerNombres([]); setOdooAutoDetected(false);
    setTieneErrores(null); setTiposError([]); setProductos([]); setObservaciones('');
    setSubmitAttempted(false); setPhotoUploading(false); setPhotoUploadMsg('');
    setFormPhase('setup');
    setView('form');
  };

  const today = new Date().toLocaleDateString('es-CL');
  const todayEntries = useMemo(() => history.filter(e => e.fecha === today), [history, today]);

  /* ── Hub view (admin-auditoria only) ── */
  if (isAdminAud && view === 'hub') {
    const hubCards = [
      { Icon: ClipboardPlus,   title: 'Agregar Audición',   sub: 'Registrar nueva auditoría de pallet',    fn: () => setView('form'),               border: 'rgba(34,197,94,0.55)',  bg: 'rgba(34,197,94,0.18)',  shadow: 'rgba(34,197,94,0.22)' },
      { Icon: Radio,           title: 'En Vivo',            sub: 'Auditorías activas ahora mismo',         fn: () => setView('live'),               border: 'rgba(239,68,68,0.55)',  bg: 'rgba(239,68,68,0.18)',  shadow: 'rgba(239,68,68,0.22)' },
      { Icon: TableProperties, title: 'Trazabilidad',       sub: 'Registro detallado por operación',       fn: () => setView('trazabilidad'),        border: 'rgba(20,184,166,0.55)', bg: 'rgba(20,184,166,0.18)', shadow: 'rgba(20,184,166,0.20)' },
      { Icon: BarChart3,       title: 'Estadísticas',        sub: 'Dashboard del día · Ranking de Pickers', fn: () => setView('stats'),              border: 'rgba(37,99,235,0.55)',  bg: 'rgba(37,99,235,0.18)',  shadow: 'rgba(37,99,235,0.22)' },
      { Icon: PackageOpen,     title: 'Producción diaria',   sub: 'Registrar pallets producidos por picker',fn: () => setView('produccion'),          border: 'rgba(245,158,11,0.55)', bg: 'rgba(245,158,11,0.16)', shadow: 'rgba(245,158,11,0.20)' },
      { Icon: Search,           title: 'Revisión Auditoría',  sub: 'Lista · Fotos · Estadísticas',           fn: () => router.push('/auditoria-admin'),border: 'rgba(124,58,237,0.55)', bg: 'rgba(124,58,237,0.18)', shadow: 'rgba(124,58,237,0.22)' },
      { Icon: Clock,           title: 'Historial',           sub: 'Tus auditorías por fecha',               fn: () => setView('revision'),            border: 'rgba(217,119,6,0.55)',  bg: 'rgba(217,119,6,0.16)',  shadow: 'rgba(217,119,6,0.20)' },
      { Icon: Settings2,       title: 'Configuración',       sub: 'Pickers · Auditores · Parámetros',       fn: () => setView('config'),              border: 'rgba(20,184,166,0.55)', bg: 'rgba(20,184,166,0.18)', shadow: 'rgba(20,184,166,0.20)' },
    ];
    return (
      <>
        <style>{`
          @media (max-width: 480px) {
            .aud-hub-root {
              padding: 0 !important;
              overflow: hidden !important;
              height: 100dvh !important;
            }
            .aud-hub-header {
              margin-bottom: 0 !important;
              padding: 12px 20px !important;
            }
            .aud-hub-desktop { display: none !important; }
            .aud-hub-mobile {
              display: flex !important;
              flex: 1 !important;
              flex-direction: column !important;
              padding: 12px 16px 24px !important;
              gap: 9px !important;
              min-height: 0 !important;
              overflow: hidden !important;
            }
            .aud-hub-mobile-card {
              flex: 1 !important;
              height: auto !important;
            }
          }
        `}</style>
        <div className="aud-hub-root fixed inset-0 flex flex-col py-10 overflow-y-auto"
          style={{ background: 'linear-gradient(160deg,#111A3E 0%,#1A2550 60%,#243070 100%)' }}>

          {/* Header */}
          <div className="aud-hub-header flex items-center justify-between gap-3 mb-10 px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(userRole === 'admin' ? '/control-interno' : '/')}
                className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
                style={{
                  width: 36, height: 36,
                  background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                  border: '1px solid rgba(255,255,255,0.15)',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
                }}>
                <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              </button>
              <div>
                <div className="font-barlow-condensed text-[11px] font-bold tracking-[0.2em] uppercase text-white/35">Módulo</div>
                <div className="font-barlow-condensed text-2xl font-bold text-white tracking-widest uppercase leading-none">Auditoría</div>
              </div>
            </div>
            <ProfilePill compact />
          </div>

          {/* Desktop grid */}
          <div className="aud-hub-desktop px-6">
            <div className="hidden md:grid md:grid-cols-2 md:gap-3 md:max-w-lg md:mx-auto">
              {hubCards.map(({ Icon, title, sub, fn, border, bg, shadow }) => (
                <button key={title} onClick={fn}
                  className="relative overflow-hidden rounded-2xl px-5 py-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all active:scale-95 border-2"
                  style={{ background: bg, borderColor: border, boxShadow: `0 8px 24px ${shadow}`, minHeight: 118 }}>
                  <Icon size={28} color="rgba(255,255,255,0.85)" strokeWidth={1.5} style={{ marginBottom: 10 }} />
                  <div className="font-barlow-condensed text-[18px] font-bold text-white tracking-widest uppercase leading-tight">{title}</div>
                  <div className="text-[11px] text-white/55 mt-0.5">{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile cards */}
          <div className="aud-hub-mobile flex md:hidden flex-col gap-3 px-6">
            {hubCards.map(({ Icon, title, sub, fn, border, bg, shadow }) => (
              <button key={title} onClick={fn}
                className="aud-hub-mobile-card w-full relative overflow-hidden rounded-2xl flex items-center gap-4 px-5 cursor-pointer transition-all active:scale-[0.98] border-2 text-left"
                style={{ background: bg, borderColor: border, boxShadow: `0 6px 20px ${shadow}`, minHeight: 66 }}>
                <Icon size={24} color="rgba(255,255,255,0.85)" strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="font-barlow-condensed text-[18px] font-bold text-white tracking-wide uppercase leading-tight">{title}</div>
                  <div className="text-[11px] text-white/55">{sub}</div>
                </div>
                <ChevronLeft size={16} color="rgba(255,255,255,0.3)" strokeWidth={2.5} style={{ flexShrink: 0, transform: 'rotate(180deg)' }} />
              </button>
            ))}
          </div>

        </div>
      </>
    );
  }

  /* ── Stats view (admin-auditoria: Dashboard + Ranking) ── */
  if (isAdminAud && view === 'stats') {
    return (
      <AdminAudStats history={history} today={today} odooConfig={odooConfig} onBack={() => setView('hub')} pickerNames={PICKER_NAMES} />
    );
  }

  /* ── Producción diaria view ── */
  if (isAdminAud && view === 'produccion') {
    return <ProduccionPanel onBack={() => setView('hub')} pickerNombresList={pickerNombresList} />;
  }

  /* ── Revision view (admin-auditoria: History of all) ── */
  if (isAdminAud && view === 'revision') {
    return (
      <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #1a2550 0%, #5b21b6 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
          <button onClick={() => setView('hub')}
            className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
            style={{
              width: 36, height: 36,
              background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
            }}>
            <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
          </button>
          <div className="flex-1">
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Revisión Auditoría</div>
            <div className="text-[11px] text-white/40 uppercase tracking-widest">{userRole === 'admin' ? 'Admin' : 'Admin Auditoría'}</div>
          </div>
          <ProfilePill />
        </div>
        <HistoryContent history={history} today={today} onReaudit={e => { iniciarReauditoria(e); setView('form'); }} onExportPDF={exportarPDF} onRefresh={loadHistory} pickerNames={PICKER_NAMES} />
      </div>
    );
  }

  /* ── Config view (admin-auditoria: picker names + future settings) ── */
  if (isAdminAud && view === 'config') {
    return (
      <ConfigPanel
        onBack={() => setView('hub')}
        onSaved={(list, auds) => { setPickerNombresList(list); setAuditorList(auds); }}
        userRole={userRole}
      />
    );
  }

  /* ── Live view (admin-auditoria: auditorías activas en tiempo real) ── */
  if (isAdminAud && view === 'live') {
    return <LiveAuditsPanel onBack={() => setView('hub')} allStores={TODAS_LAS_TIENDAS} />;
  }

  if (isAdminAud && view === 'trazabilidad') {
    return <TrazabilidadPanel onBack={() => setView('hub')} history={history} onRefresh={loadHistory} />;
  }

  /* ════ FORM RENDER (all roles) ════ */
  return (
    <div className="fixed inset-0 flex flex-col bg-bg overflow-hidden">

      {/* ── HEADER ── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-3"
        style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
        {isAdminAud
          ? <button onClick={() => setView('hub')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
          : <button onClick={() => router.push('/')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{
                width: 36, height: 36,
                background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
                border: '1px solid rgba(255,255,255,0.15)',
                boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)',
              }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
        }
        <div className="flex-1">
          <div className="font-barlow-condensed text-[22px] font-bold text-white tracking-widest uppercase">Auditoría</div>
          <div className="text-[11px] text-white/40 uppercase tracking-widest">
            {userRole === 'admin' ? 'Admin' : userRole === 'admin-auditoria' ? 'Admin Auditoría' : 'Auditor'} · Control de calidad
          </div>
        </div>
        {/* Mobile: hamburger + profile */}
        <div className="flex md:hidden items-center gap-1">
          {!isAdminAud && <button onClick={() => setMobileMenuOpen(true)} className="border-none bg-white/15 text-white text-[17px] font-bold cursor-pointer px-2.5 py-1.5 rounded-full">☰</button>}
          <ProfilePill compact />
        </div>
        {/* Desktop: profile */}
        <div className="hidden md:flex items-center gap-1">
          <ProfilePill />
        </div>
      </div>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5"
          style={{ background: 'rgba(217,119,6,0.12)', borderBottom: '1px solid rgba(217,119,6,0.25)' }}>
          <span className="text-[13px]">📵</span>
          <span className="text-[12px] font-semibold text-warn">Sin conexión — las auditorías se guardarán localmente y se sincronizarán al reconectar</span>
        </div>
      )}

      {/* ── TWO-COLUMN LAYOUT ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* LEFT: FORM */}
        <div className={isAdminAud
          ? 'flex-1 md:flex-none md:w-[420px] lg:w-[460px] overflow-y-auto'
          : isAuditorOnly
            ? 'flex-1 flex flex-col overflow-hidden'
            : 'flex-1 md:flex-none md:w-[420px] lg:w-[460px] overflow-y-auto md:border-r md:border-border'}>
          {/* Auditor tab bar */}
          {isAuditorOnly && (
            <div className="hidden md:flex border-b border-border bg-white flex-shrink-0">
              {([
                { v: 'form'    as const, label: 'Formulario', Icon: ClipboardPlus },
                { v: 'history' as const, label: 'Historial',  Icon: History },
              ]).map(({ v: tv, label, Icon }) => (
                <button key={tv} onClick={() => setView(tv)}
                  className={`flex-1 py-3 font-barlow-condensed text-[14px] font-bold border-b-2 cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${tv === 'history' ? (view === 'history' ? 'border-navy text-navy' : 'border-transparent text-text-3') : (view !== 'history' ? 'border-navy text-navy' : 'border-transparent text-text-3')}`}>
                  <Icon size={13} strokeWidth={2} />
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Auditor: inline history view */}
          {isAuditorOnly && view === 'history' && (
            <div className="hidden md:flex flex-1 overflow-hidden flex-col">
              <div className="max-w-[480px] mx-auto w-full flex-1 overflow-hidden flex flex-col">
                <HistoryContent history={history} today={today} onReaudit={iniciarReauditoria} onExportPDF={exportarPDF} onRefresh={loadHistory} pickerNames={PICKER_NAMES} />
              </div>
            </div>
          )}
          {(!isAuditorOnly || view !== 'history') && <div className={`px-4 pb-8${isAdminAud ? ' max-w-2xl mx-auto' : isAuditorOnly ? ' md:max-w-[480px] md:mx-auto overflow-y-auto flex-1' : ''}`}>

            {/* History error banner (#18) */}
            {historyError && !historyLoading && (
              <div className="mt-4 flex items-center gap-2 bg-[rgba(211,47,47,0.07)] border border-red/20 rounded-card px-3 py-2">
                <span className="text-red text-[14px]">⚠</span>
                <span className="text-[11px] text-red flex-1 truncate">Error al cargar historial</span>
                <button onClick={() => loadHistory()} className="text-[11px] font-bold text-red border border-red/30 rounded-btn px-2 py-0.5 cursor-pointer bg-transparent">Reintentar</button>
                <button onClick={() => setHistoryError('')} className="text-red/50 text-[16px] leading-none border-none bg-transparent cursor-pointer px-1">×</button>
              </div>
            )}

            {/* Re-audit banner */}
            {reauditoriaOrigen && (
              <div className="mt-4 rounded-card overflow-hidden border-2 border-info" style={{ boxShadow: '0 4px 16px rgba(37,99,235,0.20)' }}>
                <div className="px-3 py-2 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, rgba(37,99,235,0.15) 0%, rgba(37,99,235,0.08) 100%)' }}>
                  <span className="text-info text-[22px] font-bold">↩</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-barlow-condensed text-[15px] font-bold text-info uppercase tracking-wide">Re-auditoría en curso</div>
                    <div className="text-[11px] text-text-2 truncate mt-0.5">
                      Original: <strong>{reauditoriaOrigen.tiendaNombre}</strong> · {reauditoriaOrigen.hora} · {CORR_LABEL[reauditoriaOrigen.correccion]}
                    </div>
                  </div>
                  <button onClick={() => setReauditoriaOrigen(null)} className="border-none bg-info/10 text-info cursor-pointer text-[16px] leading-none px-2 py-1 rounded-btn font-bold">× Cancelar</button>
                </div>
              </div>
            )}

            {/* Banner: sesión activa en otro dispositivo (mismo usuario) */}
            {formPhase === 'scan' && remoteSession && (() => {
              const rs = remoteSession;
              const tiendaNombre = (TODAS_LAS_TIENDAS.find(t => t.cod === rs.tiendaCod)?.nombre ?? rs.tiendaCod ?? '—') as string;
              const elapsed = rs.auditStartTime ? Math.floor((Date.now() - new Date(rs.auditStartTime as string).getTime()) / 1000) : 0;
              const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
              const ss = String(elapsed % 60).padStart(2, '0');
              return (
                <div className="mt-4 rounded-2xl overflow-hidden border-2 border-warn" style={{ boxShadow: '0 4px 20px rgba(217,119,6,0.22)' }}>
                  <div className="px-4 py-3" style={{ background: 'linear-gradient(135deg,rgba(217,119,6,0.14),rgba(217,119,6,0.06))' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[18px] animate-pulse">🔴</span>
                      <span className="font-barlow-condensed text-[15px] font-bold text-warn uppercase tracking-wide">Auditoría activa en otro dispositivo</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] mb-3">
                      <span className="text-text-3">Tienda</span><span className="font-bold text-text">{tiendaNombre}</span>
                      <span className="text-text-3">Auditor</span><span className="font-bold text-text">{(rs.auditor as string) || '—'}</span>
                      <span className="text-text-3">Tipo</span><span className="font-bold text-text">{((rs.tipo as string) ?? '—').toUpperCase()}</span>
                      <span className="text-text-3">Tiempo</span><span className="font-bold text-navy">{mm}:{ss}</span>
                      {rs.pallets ? <><span className="text-text-3">Pallets</span><span className="font-bold text-text">{rs.pallets as string}</span></> : null}
                      <span className="text-text-3">Fase</span><span className={`font-bold ${rs.formPhase === 'execution' ? 'text-success' : 'text-warn'}`}>{rs.formPhase === 'execution' ? 'En ejecución' : 'Configurando'}</span>
                    </div>
                    <button
                      onClick={() => {
                        const s = remoteSession;
                        setRemoteSession(null);
                        // Aplicar la sesión remota en este dispositivo
                        const tiendaObj = TODAS_LAS_TIENDAS.find(t => t.cod === s.tiendaCod) ?? null;
                        if (s.auditor)       setAuditor(s.auditor as string);
                        if (s.pickerNombre)  setPickerNombre(s.pickerNombre as string);
                        if (s.picker)        setPicker(s.picker as string);
                        if (tiendaObj)       setTienda(tiendaObj);
                        if (s.tipo)          setTipo(s.tipo as TipoAuditoria);
                        if (s.tipoLocked)    setTipoLocked(true);
                        if (Array.isArray(s.operaciones) && s.operaciones.length) { pendingScanRef.current = s.operaciones as OperacionEntry[]; }
                        if (s.pallets)       setPallets(s.pallets as string);
                        if (s.tieneErrores !== undefined) setTieneErrores((s.tieneErrores ?? null) as boolean | null);
                        if (Array.isArray(s.tiposError) && s.tiposError.length) setTiposError(s.tiposError as TipoError[]);
                        if (s.draftEntryId)  draftEntryIdRef.current = s.draftEntryId as string;
                        if (s.formPhase === 'execution' && s.auditStartTime) {
                          auditStartTimeRef.current = s.auditStartTime as string;
                          setAuditStartTime(s.auditStartTime as string);
                          const el = Math.floor((Date.now() - new Date(s.auditStartTime as string).getTime()) / 1000);
                          setTimerSeconds(Math.max(0, el));
                          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
                          timerIntervalRef.current = setInterval(() => {
                            const e = Math.floor((Date.now() - new Date(auditStartTimeRef.current).getTime()) / 1000);
                            setTimerSeconds(Math.max(0, e));
                          }, 1000);
                          setFormPhase('execution');
                        } else {
                          setFormPhase('setup');
                        }
                        setCrossDeviceRestored(true);
                      }}
                      className="w-full py-2.5 rounded-btn font-barlow-condensed text-[15px] font-bold text-white cursor-pointer transition-all active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg,#b45309,#d97706)', boxShadow: '0 4px 12px rgba(217,119,6,0.40)' }}>
                      📲 Continuar aquí
                    </button>
                  </div>
                </div>
              );
            })()}

            <AnimatePresence mode="wait" initial={false}>
            {/* ══ FASE 1: ESCÁNER ══ */}
            {formPhase === 'scan' && (
              <motion.div key="scan"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}>
              <>
                <SLabel>Auditor</SLabel>
                <AuditorSelector auditor={auditor} auditorList={auditorList} onChange={v => { setAuditor(v); auditorFromProfile.current = false; }} />
                <div className="mt-5">
                  {showSecondScan && firstScanDone && (
                    <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold text-info bg-[rgba(37,99,235,0.07)] border border-info/20">
                      <div className="w-3.5 h-3.5 border-2 border-info/30 border-t-info rounded-full animate-spin flex-shrink-0" />
                      Código 1 leído — escanea el 2° código ahora
                    </div>
                  )}
                  <BarcodeInputScanner onScan={handleBarcodeScan} />
                  <button type="button" onClick={() => setCameraOpen(true)}
                    className="w-full mt-2 flex items-center justify-center gap-2.5 py-3 rounded-card border-2 cursor-pointer transition-all active:scale-[0.99]"
                    style={{ background: 'rgba(37,99,235,0.06)', borderColor: 'rgba(37,99,235,0.30)', color: '#2563EB' }}>
                    <span className="text-[22px]">📷</span>
                    <span className="font-barlow-condensed text-[16px] font-bold">Escanear con cámara</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSecondScan(v => !v); setFirstScanDone(false); firstScanRef.current = null; }}
                    className="mt-2 flex items-center gap-1.5 cursor-pointer border-none bg-transparent p-0 transition-opacity active:opacity-60"
                    style={{ color: showSecondScan ? '#9CA3AF' : '#2563EB' }}>
                    <span className="text-[13px]">{showSecondScan ? '− Cancelar 2° código' : '+ Leer 2 códigos distintos (pistola / cámara)'}</span>
                  </button>
                </div>
                {/* ID numérico de pallet */}
                <div className="mt-3 bg-white border border-border rounded-card px-4 py-3" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                  <div className="font-barlow-condensed text-[13px] font-bold text-text-2 uppercase tracking-wide mb-2">Ingresar ID de pallet</div>

                  {/* Pallet 1 */}
                  <div className="flex gap-2">
                    <input
                      type="number" inputMode="numeric" pattern="[0-9]*"
                      value={palletIdInput}
                      onChange={e => { setPalletIdInput(e.target.value); setPalletIdError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter' && !showPalletId2) { (e.target as HTMLElement).blur(); void handlePalletIdLookup(palletIdInput); } }}
                      placeholder="Ej: 1247"
                      className="w-full bg-bg border border-border rounded-btn px-3 py-3 font-barlow-condensed text-[42px] font-bold text-navy outline-none focus:border-navy text-center"
                      style={{ letterSpacing: '4px' }}
                      disabled={palletIdLoading}
                    />
                  </div>
                  {palletIdError && <div className="mt-1.5 text-[12px] text-red font-semibold">{palletIdError}</div>}
                  {!showPalletId2 && (
                    <button
                      type="button"
                      onClick={() => { (document.activeElement as HTMLElement)?.blur(); void handlePalletIdLookup(palletIdInput); }}
                      disabled={palletIdLoading || !palletIdInput.trim()}
                      className="w-full mt-2 py-3 rounded-btn font-barlow-condensed text-[17px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)', boxShadow: '0 4px 16px rgba(26,37,80,0.30)' }}>
                      {palletIdLoading ? '⏳ Buscando…' : '🔍 Buscar pallet'}
                    </button>
                  )}

                  {/* Pallet 2 (hogar separado) */}
                  {showPalletId2 && (
                    <div className="mt-3 pt-3 border-t border-border/60">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-[11px] font-bold text-text-2 uppercase tracking-wide">ID pallet hogar</span>
                        <span className="text-[10px] text-text-3">(opcional — si va en pallet separado)</span>
                      </div>
                      <input
                        type="number" inputMode="numeric" pattern="[0-9]*"
                        value={palletIdInput2}
                        onChange={e => { setPalletIdInput2(e.target.value); setPalletIdError2(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { (document.activeElement as HTMLElement)?.blur(); void handlePalletIdLookup(palletIdInput, palletIdInput2); } }}
                        placeholder="ID pallet 2"
                        className="w-full bg-bg border border-border rounded-btn px-3 py-3 font-barlow-condensed text-[42px] font-bold text-navy outline-none focus:border-navy text-center"
                        style={{ letterSpacing: '4px' }}
                        disabled={palletIdLoading}
                      />
                      {palletIdError2 && <div className="mt-1.5 text-[12px] text-red font-semibold">{palletIdError2}</div>}
                      <button
                        type="button"
                        onClick={() => { (document.activeElement as HTMLElement)?.blur(); void handlePalletIdLookup(palletIdInput, palletIdInput2); }}
                        disabled={palletIdLoading || !palletIdInput.trim()}
                        className="w-full mt-2 py-3 rounded-btn font-barlow-condensed text-[17px] font-bold text-white cursor-pointer disabled:opacity-40 transition-all active:scale-[0.98]"
                        style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)', boxShadow: '0 4px 16px rgba(26,37,80,0.30)' }}>
                        {palletIdLoading ? '⏳ Buscando…' : '🔍 Buscar pallets'}
                      </button>
                    </div>
                  )}

                  {/* Toggle segundo pallet */}
                  <button
                    type="button"
                    onClick={() => { setShowPalletId2(v => !v); setPalletIdInput2(''); setPalletIdError2(''); }}
                    className="mt-3 w-full py-2.5 rounded-btn border-2 cursor-pointer border-none bg-transparent p-0 transition-opacity active:opacity-60 text-left"
                    style={{ color: showPalletId2 ? '#9CA3AF' : '#2563EB' }}>
                    <span className="text-[15px] font-bold">{showPalletId2 ? '− Quitar ID adicional' : '+ Agregar ID adicional (ej. hogar separado)'}</span>
                  </button>

                  <div className="mt-1.5 text-[10px] text-text-3">El número aparece en la etiqueta del pallet junto al código de tienda</div>
                </div>
                <button type="button" onClick={() => setFormPhase('setup')}
                  className="w-full mt-2 py-3 border-2 border-dashed border-navy/20 rounded-card font-barlow-condensed text-[15px] font-bold text-navy/50 cursor-pointer bg-transparent transition-all active:bg-navy/5">
                  Omitir escáner — ingresar datos manualmente
                </button>
              </>
              </motion.div>
            )}

            {/* ══ FASE 2: CONFIGURACIÓN ══ */}
            {formPhase === 'setup' && (
              <motion.div key="setup"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}>
              <>
                {tipoLocked && (
                  <div className="mt-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold text-info bg-[rgba(37,99,235,0.06)] border border-info/20">
                    <span>🔒</span>
                    <span className="flex-1">Datos del pallet confirmados</span>
                    <button type="button" onClick={() => setTipoLocked(false)} className="text-info underline cursor-pointer border-none bg-transparent p-0 text-[11px] font-bold">Editar</button>
                  </div>
                )}

                <SLabel>Auditor</SLabel>
                {tipoLocked && auditor ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-bg border border-border rounded-btn">
                    <span className="flex-1 font-semibold text-text text-[15px]">{auditor}</span>
                    <span className="text-[11px] text-text-3">🔒</span>
                  </div>
                ) : (
                  <AuditorSelector auditor={auditor} auditorList={auditorList} onChange={v => { setAuditor(v); auditorFromProfile.current = false; }} />
                )}

                <SLabel>Auditor (id. pistola) <span className="text-[10px] font-normal normal-case ml-1">Odoo lo asigna automáticamente</span></SLabel>
                <PickerOdooDisplay picker={picker} odooDetected={odooAutoDetected} onClear={() => { if (!tipoLocked) { setPicker(''); setOdooAutoDetected(false); } }} />

                <SLabel>Picker{pickerNombres.length > 1 ? 's' : ''} (armador{pickerNombres.length > 1 ? 'es' : ''} de pallet)</SLabel>
                {pickerNombres.length > 1 ? (
                  <div className="flex flex-wrap gap-2 py-1">
                    {pickerNombres.map((n, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[rgba(37,99,235,0.08)] border border-[rgba(37,99,235,0.25)] rounded-full font-barlow-condensed text-[14px] font-bold text-info">
                        <span className="text-[11px] font-normal text-text-3">P{i + 1}</span> {n}
                      </span>
                    ))}
                  </div>
                ) : tipoLocked && pickerNombre ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-bg border border-border rounded-btn">
                    <span className="flex-1 font-semibold text-text text-[15px]">{pickerNombre}</span>
                    <span className="text-[11px] text-text-3">🔒</span>
                  </div>
                ) : (
                  <PickerNombreSelector pickerNombre={pickerNombre} pickerNombresList={pickerNombresList} onChange={v => { setPickerNombre(v); setPickerNombres(v ? [v] : []); }} />
                )}

                <SLabel>Tienda</SLabel>
                {tipoLocked && tienda ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-bg border border-border rounded-btn">
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-text text-[15px]">{tienda.nombre}</span>
                      <span className="font-mono text-[11px] text-text-3 ml-2">{tienda.cod}</span>
                      <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tienda.area === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>{tienda.area === 'santiago' ? 'STG' : 'REG'}</span>
                    </div>
                    <span className="text-[11px] text-text-3">🔒</span>
                  </div>
                ) : (
                  <div ref={tiendaRef} className="relative">
                    <div onClick={() => setTiendaOpen(o => !o)}
                      className={`w-full bg-white border-[1.5px] rounded-btn px-3 py-3 flex items-center justify-between cursor-pointer transition-all ${tiendaOpen ? 'border-navy shadow-[0_0_0_3px_rgba(26,37,80,0.08)]' : 'border-border'}`} style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }}>
                      {tienda ? (
                        <div className="flex-1 min-w-0"><span className="font-semibold text-text text-[15px]">{tienda.nombre}</span><span className="font-mono text-[11px] text-text-3 ml-2">{tienda.cod}</span><span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tienda.area === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>{tienda.area === 'santiago' ? 'STG' : 'REG'}</span></div>
                      ) : <span className="text-text-3 font-barlow text-[15px]">Seleccionar tienda…</span>}
                      <span className="text-text-3 ml-2 flex-shrink-0">{tiendaOpen ? '▲' : '▼'}</span>
                    </div>
                    {tiendaOpen && (
                      <div className="absolute top-full left-0 right-0 z-50 bg-white border border-border rounded-card mt-1 shadow-2xl overflow-hidden">
                        <div className="p-2 border-b border-border"><input autoFocus type="text" value={tiendaQuery} onChange={e => setTiendaQuery(e.target.value)} placeholder="Buscar…" className="w-full bg-bg border border-border rounded-btn px-3 py-2 text-text font-barlow text-[14px] outline-none focus:border-navy" /></div>
                        <div className="max-h-56 overflow-y-auto">
                          {tiendaFiltered.length === 0 && <div className="py-6 text-center text-text-3 text-[13px]">Sin resultados</div>}
                          {tiendaFiltered.map(t => (
                            <div key={t.cod} onClick={() => { setTienda(t); setTiendaOpen(false); setTiendaQuery(''); }} className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-b border-border/40 last:border-b-0 ${tienda?.cod === t.cod ? 'bg-[rgba(26,37,80,0.06)]' : 'hover:bg-bg'}`}>
                              <span className="font-mono text-[11px] text-text-3 bg-bg-2 border border-border px-1.5 py-0.5 rounded">{t.cod}</span>
                              <div className="flex-1 min-w-0"><div className="font-semibold text-[14px] text-text truncate">{t.nombre}</div><div className="text-[11px] text-text-3">{t.comuna || t.region}</div></div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${t.area === 'santiago' ? 'bg-[rgba(37,99,235,0.10)] text-info' : 'bg-[rgba(211,47,47,0.10)] text-red'}`}>{t.area === 'santiago' ? 'STG' : 'REG'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <SLabel>Tipo de contenido</SLabel>
                <div className="grid grid-cols-3 gap-1.5">
                  {TIPOS.map(({ value, label }) => (
                    <button key={value} onClick={() => !tipoLocked && handleTipoChange(value)}
                      className={`py-2.5 rounded-btn border-[1.5px] font-barlow-condensed text-[14px] font-bold transition-all ${tipo === value ? TIPO_COLOR[value] : tipoLocked ? 'border-border bg-bg text-text-3 opacity-40 cursor-not-allowed' : 'border-border bg-white text-text-2 cursor-pointer'}`}>{label}</button>
                  ))}
                </div>

                <SLabel>Operaciones Odoo <span className="text-[10px] font-normal normal-case ml-1">({operaciones.length} op{operaciones.length !== 1 ? 's' : '.'})</span></SLabel>
                {operaciones.map((op, i) => (
                  <OperacionInput key={op.subTipo} subTipo={op.subTipo} codigo={op.codigo}
                    onChange={v => updateOperacion(i, v)} onSelect={handleOpSelect}
                    odooConfig={odooConfig} onNeedConfig={() => showToast('Configura NEXT_PUBLIC_ODOO_* en .env.local', '#D97706')}
                    pickerLabel={pickerNombres.length > 1 ? op.pickerNombre : undefined} />
                ))}

                <div className="mt-6 grid grid-cols-2 gap-2 mb-2">
                  <button type="button" onClick={handleBackFromSetup}
                    className="py-3.5 border border-border bg-white rounded-card font-barlow-condensed text-[16px] font-bold text-text-2 cursor-pointer transition-all active:scale-[0.98]">
                    ← Volver
                  </button>
                  <button type="button"
                    disabled={!auditor.trim() || !tienda || operaciones.some(op => !op.codigo.trim())}
                    onClick={() => { (document.activeElement as HTMLElement)?.blur(); startTimer(); setFormPhase('execution'); }}
                    className="py-3.5 text-white rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer disabled:opacity-40 transition-all active:scale-[0.98]"
                    style={{ background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', boxShadow: '0 6px 24px rgba(22,163,74,0.35)' }}>
                    Iniciar Auditoría ▶
                  </button>
                </div>
                {(!auditor.trim() || !tienda || operaciones.some(op => !op.codigo.trim())) && (
                  <div className="mt-1 text-center text-[11px] text-text-3 font-semibold">
                    {!auditor.trim() ? 'Selecciona el auditor'
                    : !tienda ? 'Selecciona la tienda'
                    : 'Completa los códigos de operación'}
                  </div>
                )}
              </>
              </motion.div>
            )}

            {/* ══ FASE 4: RESULTADO ══ */}
            {formPhase === 'result' && lastEntry && (
              <motion.div key="result"
                initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}>
              <>
                {/* Banner resultado */}
                <div className="mt-4 rounded-2xl overflow-hidden"
                  style={{
                    background: lastEntry.resultado === 'bueno' ? 'linear-gradient(135deg,rgba(22,163,74,0.14),rgba(22,163,74,0.06))' : 'linear-gradient(135deg,rgba(211,47,47,0.14),rgba(211,47,47,0.06))',
                    border: `2px solid ${lastEntry.resultado === 'bueno' ? 'rgba(22,163,74,0.45)' : 'rgba(211,47,47,0.45)'}`,
                    boxShadow: lastEntry.resultado === 'bueno' ? '0 8px 32px rgba(22,163,74,0.22)' : '0 8px 32px rgba(211,47,47,0.22)',
                  }}>
                  <div className="text-center py-7 px-4">
                    <div className="font-barlow-condensed font-black leading-none" style={{ fontSize: 56, color: lastEntry.resultado === 'bueno' ? '#16A34A' : '#D32F2F' }}>
                      {lastEntry.resultado === 'bueno' ? '✓ BUENO' : '✗ MALO'}
                    </div>
                    <div className="text-[14px] font-bold mt-1" style={{ color: lastEntry.resultado === 'bueno' ? '#16A34A' : '#D32F2F' }}>
                      {CORR_LABEL[lastEntry.correccion]}
                    </div>
                  </div>
                  {/* Duración */}
                  <div className="border-t px-4 py-4 text-center" style={{ borderColor: lastEntry.resultado === 'bueno' ? 'rgba(22,163,74,0.20)' : 'rgba(211,47,47,0.20)' }}>
                    <div className="text-[10px] font-bold text-text-3 uppercase tracking-[0.2em] mb-1">Duración de la auditoría</div>
                    <div className="font-barlow-condensed font-black text-navy leading-none" style={{ fontSize: 48 }}>
                      ⏱ {formatTimer(lastDurationSeconds)}
                    </div>
                  </div>
                </div>

                {/* Resumen info */}
                <div className="mt-3 bg-white border border-border rounded-card p-4" style={{ boxShadow: '0 2px 10px rgba(26,37,80,0.07)' }}>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="text-center">
                      <div className="font-barlow-condensed text-[34px] font-extrabold text-navy leading-tight">{lastEntry.pallets}</div>
                      <div className="text-[10px] text-text-3 uppercase tracking-wide">Pallets</div>
                    </div>
                    <div className="text-center">
                      <div className="font-barlow-condensed text-[34px] font-extrabold leading-tight" style={{ color: lastEntry.tieneErrores ? '#D32F2F' : '#16A34A' }}>
                        {lastEntry.tieneErrores ? lastEntry.productos.length || '!' : '0'}
                      </div>
                      <div className="text-[10px] text-text-3 uppercase tracking-wide">Prod. error</div>
                    </div>
                    <div className="text-center">
                      <div className="font-barlow-condensed text-[34px] font-extrabold leading-tight" style={{ color: lastEntry.tieneErrores ? '#D97706' : '#16A34A' }}>
                        {lastEntry.tieneErrores
                          ? lastEntry.productos.reduce((s, p) => s + p.unidades, 0)
                          : '✓'}
                      </div>
                      <div className="text-[10px] text-text-3 uppercase tracking-wide">Unid. error</div>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-border/50 text-[12px] text-text-3 space-y-0.5">
                    <div><strong className="text-text">{lastEntry.tiendaNombre}</strong><span className="font-mono ml-1.5 text-[10px]">{lastEntry.tiendaCod}</span></div>
                    {(lastEntry.pickerNombre || lastEntry.picker) && (
                      <div>Picker{(lastEntry.pickerNombre ?? '').includes(' + ') ? 's' : ''}: <strong className="text-text">{lastEntry.pickerNombre || lastEntry.picker}</strong></div>
                    )}
                    <div>{lastEntry.hora} · {lastEntry.auditor}</div>
                  </div>
                </div>

                {/* Detalle faltantes / sobrantes */}
                {lastEntry.productos.length > 0 && (
                  <div className="mt-3 bg-white border border-border rounded-card overflow-hidden" style={{ boxShadow: '0 2px 10px rgba(26,37,80,0.07)' }}>
                    <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                      <span className="font-barlow-condensed text-[14px] font-bold text-navy">Productos con error</span>
                      <span className="font-barlow-condensed text-[13px] font-bold text-text-3">· {lastEntry.productos.length}</span>
                    </div>
                    {lastEntry.productos.map((p, i) => {
                      const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`;
                      return (
                        <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/40 last:border-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${p.tipo === 'faltante' ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>
                            {p.tipo === 'faltante' ? '↓ Faltante' : '↑ Sobrante'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-[10px] text-text-3">[{p.codigo}]</div>
                            <div className="text-[12px] text-text truncate">{p.nombre}</div>
                          </div>
                          <span className={`font-barlow-condensed font-bold text-[16px] flex-shrink-0 ${p.tipo === 'faltante' ? 'text-red' : 'text-warn'}`}>{r}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Observaciones */}
                {lastEntry.observaciones && (
                  <div className="mt-3 px-3 py-2.5 bg-white border border-border rounded-card text-[12px] text-text-2 italic border-l-4 border-l-navy/30" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.05)' }}>
                    {lastEntry.observaciones}
                  </div>
                )}

                {/* Nueva auditoría */}
                <button
                  type="button"
                  onClick={() => { setLastEntry(null); setLastDurationSeconds(0); setFormPhase('scan'); }}
                  className="w-full mt-5 py-4 text-white border-none rounded-card font-barlow-condensed text-[22px] font-bold tracking-wide cursor-pointer transition-all active:scale-[0.99]"
                  style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 6px 24px rgba(26,37,80,0.40)' }}>
                  ▶ Nueva Auditoría
                </button>
              </>
              </motion.div>
            )}

            {/* ══ FASE 3: EJECUCIÓN ══ */}
            {formPhase === 'execution' && (
              <motion.div key="execution"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}>
              <>
                {/* Session restored banner */}
                {sessionRestored && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-card border border-info/30 text-info text-[12px] font-semibold"
                    style={{ background: 'rgba(37,99,235,0.06)' }}>
                    <span className="text-[16px]">🔄</span>
                    <span className="flex-1">Sesión restaurada — el cronómetro continúa desde donde lo dejaste</span>
                    <button onClick={() => setSessionRestored(false)} className="text-info/50 text-[18px] leading-none bg-transparent border-none cursor-pointer px-1">×</button>
                  </div>
                )}
                {/* Cross-device session restored banner */}
                {crossDeviceRestored && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-card border border-success/30 text-success text-[12px] font-semibold"
                    style={{ background: 'rgba(22,163,74,0.06)' }}>
                    <span className="text-[16px]">📱</span>
                    <span className="flex-1">Sesión sincronizada desde otro dispositivo — el cronómetro sigue corriendo</span>
                    <button onClick={() => setCrossDeviceRestored(false)} className="text-success/50 text-[18px] leading-none bg-transparent border-none cursor-pointer px-1">×</button>
                  </div>
                )}
                {/* Info + cancel */}
                <div className="mt-4 mb-5 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                  style={{ background: 'rgba(26,37,80,0.04)', border: '1.5px solid rgba(26,37,80,0.10)' }}>
                  <div className="min-w-0">
                    <div className="font-barlow-condensed text-[16px] font-bold text-navy truncate">
                      {tienda?.nombre ?? '—'}
                    </div>
                    {(pickerNombres.length > 1 || pickerNombre || picker) && (
                      <div className="text-[12px] text-text-3 truncate mt-0.5">
                        {pickerNombres.length > 1 ? pickerNombres.join(' · ') : pickerNombre || picker}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="flex-shrink-0 border-none cursor-pointer rounded-btn font-barlow-condensed text-[11px] font-bold tracking-wide transition-all active:scale-95"
                    style={{ background: 'rgba(211,47,47,0.08)', color: '#B91C1C', padding: '5px 12px', border: '1px solid rgba(211,47,47,0.20)' }}>
                    × Cancelar
                  </button>
                </div>

                {/* Códigos de operación — read-only en ejecución, editable si falta alguno */}
                <div ref={operacionesRef}>
                  {operaciones.some(op => !op.codigo.trim()) ? (
                    <div className="mb-3 px-3 py-3 rounded-xl border-2 border-red/40 bg-[rgba(211,47,47,0.05)]">
                      <div className="text-[11px] font-bold text-red uppercase tracking-wide mb-2">Códigos de operación incompletos</div>
                      {operaciones.map((op, i) => (
                        <OperacionInput key={op.subTipo} subTipo={op.subTipo} codigo={op.codigo}
                          onChange={v => updateOperacion(i, v)} onSelect={handleOpSelect}
                          odooConfig={odooConfig} onNeedConfig={() => showToast('Configura NEXT_PUBLIC_ODOO_* en .env.local', '#D97706')} />
                      ))}
                    </div>
                  ) : (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {operaciones.map(op => (
                        <span key={op.subTipo} className="inline-flex items-center gap-1 px-2 py-1 bg-[rgba(26,37,80,0.06)] border border-border rounded-btn font-mono text-[11px] text-text-2">
                          <span className="text-[9px] text-text-3 uppercase">{op.subTipo}</span>
                          <span className="font-bold">{op.codigo}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pallets auditados */}
                <SLabel>Pallets auditados</SLabel>
                <input ref={palletsInputRef} type="number" inputMode="numeric" min="1" max="99" value={pallets} onChange={e => setPallets(e.target.value)} placeholder="0"
                  onFocus={() => setTimeout(() => palletsInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); }}
                  className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-3 text-text font-barlow text-[28px] text-center outline-none focus:border-navy [-webkit-appearance:none]" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }} />
                {parseInt(pallets) > 0 && (
                  <div className="mt-2">
                    <div className="text-[11px] font-bold text-text-3 uppercase tracking-wide mt-1 mb-2">Fotos exteriores de pallets · <span className="font-normal normal-case">opcional · toca cada celda</span></div>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: parseInt(pallets) }, (_, i) => i + 1).map(n => {
                        const key = String(n);
                        const preview = palletPreviews[key];
                        const warn = palletWarnings[key];
                        return preview ? (
                          <div key={key} className="relative rounded-card overflow-hidden border border-border" style={{ aspectRatio: '1', boxShadow: '0 2px 6px rgba(26,37,80,0.10)' }}>
                            <img src={preview} alt={`P${n}`} className="w-full h-full object-cover" />
                            <div className="absolute top-0.5 left-1 text-[9px] font-bold text-white bg-black/60 rounded px-1">P{n}</div>
                            <button
                              onClick={() => { URL.revokeObjectURL(preview); setPalletPreviews(p => { const np = { ...p }; delete np[key]; return np; }); setPalletFiles(p => { const np = { ...p }; delete np[key]; return np; }); setPalletWarnings(w => { const nw = { ...w }; delete nw[key]; return nw; }); deleteStoragePath(`${user?.id}/${getDraftEntryId()}_pallet${key}.jpg`); setPalletStorageUrls(p => { const np = { ...p }; delete np[key]; return np; }); }}
                              className="absolute top-0.5 right-0.5 bg-red text-white border-none rounded-full w-5 h-5 text-[12px] leading-none cursor-pointer flex items-center justify-center font-bold"
                              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }}>×</button>
                            {warn && (
                              <div className="absolute bottom-0 left-0 right-0 bg-yellow-500/90 text-[8px] font-bold text-white text-center px-0.5 py-0.5 leading-tight">
                                ⚠ {warn}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div key={key} className="relative rounded-card overflow-hidden bg-white border-2 border-dashed border-border" style={{ aspectRatio: '1', boxShadow: '0 1px 3px rgba(26,37,80,0.04)' }}>
                            {/* Camera — fills the cell */}
                            <label className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 cursor-pointer active:bg-bg">
                              <span className="text-[22px]">📷</span>
                              <span className="text-[10px] text-text-3 font-bold">P{n}</span>
                              <input key={`pcam-${key}-${photoInputVer}`} type="file" accept="image/*" capture="environment" className="hidden"
                                onChange={async e => {
                                  const f = e.target.files?.[0]; if (!f) return;
                                  if (photoUploadingRef.current) return;
                                  photoUploadingRef.current = true; setPhotoUploading(true); setPhotoUploadMsg('');
                                  try {
                                    const { compressed, previewUrl, warning } = await processPhoto(f);
                                    setPalletFiles(p => ({ ...p, [key]: compressed }));
                                    setPalletPreviews(p => ({ ...p, [key]: previewUrl }));
                                    setPalletWarnings(p => ({ ...p, [key]: warning }));
                                    if (user && navigator.onLine) {
                                      const path = `${user.id}/${getDraftEntryId()}_pallet${key}.jpg`;
                                      const { error } = await supabase.storage.from('audit-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
                                      if (!error) { setPalletStorageUrls(p => ({ ...p, [key]: supabase.storage.from('audit-photos').getPublicUrl(path).data.publicUrl })); showToast('📎 Foto guardada', '#16A34A'); }
                                    } else { showToast('📶 Sin conexión — se subirá al registrar', '#D97706'); }
                                  } finally { photoUploadingRef.current = false; setPhotoUploading(false); setPhotoUploadMsg(''); bumpPhotoInput(); }
                                }} />
                            </label>
                            {/* Gallery — small corner button */}
                            <label className="absolute bottom-1 right-1 z-10 w-6 h-6 flex items-center justify-center bg-white/90 rounded-full cursor-pointer" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.18)' }}>
                              <span className="text-[11px]">🖼️</span>
                              <input key={`pgal-${key}-${photoInputVer}`} type="file" accept="image/*" className="hidden"
                                onChange={async e => {
                                  const f = e.target.files?.[0]; if (!f) return;
                                  if (photoUploadingRef.current) return;
                                  photoUploadingRef.current = true; setPhotoUploading(true); setPhotoUploadMsg('');
                                  try {
                                    const { compressed, previewUrl, warning } = await processPhoto(f);
                                    setPalletFiles(p => ({ ...p, [key]: compressed }));
                                    setPalletPreviews(p => ({ ...p, [key]: previewUrl }));
                                    setPalletWarnings(p => ({ ...p, [key]: warning }));
                                    if (user && navigator.onLine) {
                                      const path = `${user.id}/${getDraftEntryId()}_pallet${key}.jpg`;
                                      const { error } = await supabase.storage.from('audit-photos').upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
                                      if (!error) { setPalletStorageUrls(p => ({ ...p, [key]: supabase.storage.from('audit-photos').getPublicUrl(path).data.publicUrl })); showToast('📎 Foto guardada', '#16A34A'); }
                                    } else { showToast('📶 Sin conexión — se subirá al registrar', '#D97706'); }
                                  } finally { photoUploadingRef.current = false; setPhotoUploading(false); setPhotoUploadMsg(''); bumpPhotoInput(); }
                                }} />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-text-3 mt-1.5 text-center">Toca 📷 para cámara · mantén presionado para galería</div>
                  </div>
                )}

                {/* Spinner mientras se procesa/sube una foto */}
                {photoUploading && (() => {
                  const { done, total, phase } = photoProgress;
                  const hasBatch = total > 1;
                  const pct = hasBatch && total > 0 ? Math.round((done / total) * 100) : null;
                  const label = hasBatch
                    ? phase === 'compress'
                      ? `Comprimiendo ${done}/${total}…`
                      : phase === 'upload'
                      ? `Subiendo ${done}/${total}…`
                      : 'Procesando…'
                    : (photoUploadMsg || 'Procesando foto…');
                  return (
                    <div className="px-3 py-2.5 rounded-xl bg-[rgba(37,99,235,0.07)] border border-info/20 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-info/30 border-t-info rounded-full animate-spin flex-shrink-0" />
                        <span className="text-[12px] font-semibold text-info flex-1">{label}</span>
                        {pct !== null && <span className="text-[11px] text-info/60 font-bold">{pct}%</span>}
                      </div>
                      {hasBatch && pct !== null && (
                        <div className="h-1.5 bg-info/15 rounded-full overflow-hidden">
                          <div className="h-full bg-info rounded-full transition-all duration-200"
                            style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ¿Tuvo errores? */}
                <SLabel>¿Tuvo errores?</SLabel>
                <div ref={tieneErroresRef} className={`grid grid-cols-2 gap-3 rounded-xl transition-all ${submitAttempted && tieneErrores === null ? 'ring-2 ring-offset-1 ring-red/60 p-1' : ''}`}>
                  <button onClick={() => { setTieneErrores(false); setSubmitAttempted(false); }} className={`py-4 rounded-card border-2 font-barlow-condensed text-[20px] font-bold cursor-pointer transition-all ${tieneErrores === false ? 'bg-[rgba(22,163,74,0.12)] border-success text-success' : 'bg-white border-border text-text-2'}`} style={tieneErrores === false ? { boxShadow: '0 4px 16px rgba(22,163,74,0.20)' } : {}}>✓ No</button>
                  <button onClick={() => { setTieneErrores(true); setSubmitAttempted(false); }} className={`py-4 rounded-card border-2 font-barlow-condensed text-[20px] font-bold cursor-pointer transition-all ${tieneErrores === true ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-white border-border text-text-2'}`} style={tieneErrores === true ? { boxShadow: '0 4px 16px rgba(211,47,47,0.20)' } : {}}>✗ Sí</button>
                </div>
                {submitAttempted && tieneErrores === null && (
                  <div className="text-[12px] text-red font-bold text-center -mt-1">↑ Indica si el pallet tuvo errores</div>
                )}

                {tieneErrores === true && (
                  <>
                    <SLabel>Tipo de error</SLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(['faltante', 'sobrante'] as TipoError[]).map(t => (
                        <button key={t} onClick={() => toggleTipoError(t)} className={`rounded-btn border-[1.5px] font-barlow-condensed text-[17px] font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5 ${tiposError.includes(t) ? t === 'faltante' ? 'bg-[rgba(211,47,47,0.12)] border-red text-red' : 'bg-[rgba(217,119,6,0.12)] border-warn text-warn' : 'border-border bg-white text-text-2'}`}
                          style={{ minHeight: 52 }}>{t === 'faltante' ? '↓ Faltante' : '↑ Sobrante'}</button>
                      ))}
                    </div>
                    {tiposError.length === 2 && <div className="text-[11px] text-info text-center mt-1 font-semibold">Ambos → Cruce</div>}
                    {tiposError.length > 0 && (
                      <div className="mt-3">
                        {productos.length > 0 && (
                          <div className="mb-2">{productos.map((p, i) => { const r = p.cantidadEsperada !== undefined ? `${calcAuditado(p.unidades, p.tipo, p.cantidadEsperada)}/${p.cantidadEsperada}` : `${p.unidades}u`; return <div key={i} className="flex items-center gap-2 bg-white border border-border rounded-btn px-3 py-2 mb-1.5" style={{ boxShadow: '0 1px 3px rgba(26,37,80,0.05)' }}><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${p.tipo === 'faltante' ? 'bg-[rgba(211,47,47,0.10)] text-red' : 'bg-[rgba(217,119,6,0.10)] text-warn'}`}>{p.tipo}</span><span className="font-mono text-[11px] text-text-3 flex-shrink-0">[{p.codigo}]</span><span className="text-[12px] text-text flex-1 truncate">{p.nombre}</span><span className={`font-bold text-[13px] flex-shrink-0 ${p.tipo === 'faltante' ? 'text-red' : 'text-warn'}`}>{r}</span><button onClick={() => setProductos(prev => prev.filter((_, j) => j !== i))} className="text-red/50 hover:text-red border-none bg-transparent cursor-pointer text-[18px] leading-none flex-shrink-0 px-1">×</button></div>; })}
                          </div>
                        )}
                        <ProductSearch odooConfig={odooConfig} tiposError={tiposError} operacionCodes={operaciones.map(op => op.codigo)} onAdd={p => setProductos(prev => [...prev, p])} onNeedConfig={() => showToast('Configura NEXT_PUBLIC_ODOO_* en .env.local', '#D97706')} />
                      </div>
                    )}
                  </>
                )}

                {tieneErrores !== null && !(tieneErrores && tiposError.length === 0) && (
                  <>
                    <SLabel>Corrección <span className="text-[9px] font-normal ml-1 normal-case">automática</span></SLabel>
                    <div className={`py-3.5 px-4 rounded-card border-2 font-barlow-condensed text-[20px] font-bold text-center ${CORR_COLOR[correccion]}`}>{CORR_LABEL[correccion]}</div>
                    <SLabel>Resultado <span className="text-[9px] font-normal ml-1 normal-case">automático</span></SLabel>
                    <div className={`py-5 rounded-card border-2 font-barlow-condensed text-[26px] font-extrabold text-center ${resultado === 'bueno' ? 'bg-[rgba(22,163,74,0.12)] border-success text-success' : 'bg-[rgba(211,47,47,0.12)] border-red text-red'}`}
                      style={resultado === 'bueno' ? { boxShadow: '0 4px 16px rgba(22,163,74,0.18)' } : { boxShadow: '0 4px 16px rgba(211,47,47,0.18)' }}>
                      {resultado === 'bueno' ? '✓ BUENO' : '✗ MALO'}
                    </div>
                  </>
                )}

                {/* Observaciones */}
                <SLabel>Observaciones <span className="text-[9px] font-normal ml-1 normal-case">opcional</span></SLabel>
                <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Ej: pallet mal rotulado, caja dañada, producto húmedo…" rows={3}
                  className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 text-text font-barlow text-[14px] outline-none focus:border-navy resize-none [-webkit-appearance:none]" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.06)' }} />

                {tieneErrores === true && (
                  <>
                    <SLabel>Fotos de errores <span className="text-[9px] font-normal ml-1 normal-case">evidencia del error detectado · múltiples</span></SLabel>
                    {errorFotoPreviews.length > 0 && (
                      <div className="grid grid-cols-3 gap-1.5 mb-2">
                        {errorFotoPreviews.map((preview, idx) => (
                          <div key={idx} className="relative rounded-card overflow-hidden border-2 border-red/30" style={{ boxShadow: '0 2px 8px rgba(211,47,47,0.10)' }}>
                            <img src={preview} alt={`Error ${idx + 1}`} className="w-full object-cover cursor-pointer active:opacity-80" style={{ aspectRatio: '1', objectFit: 'cover' }} onClick={() => setLightboxUrl(preview)} />
                            <div className="absolute top-0.5 left-1 text-[9px] font-bold text-white bg-red/80 rounded px-1 py-0.5">{idx + 1}</div>
                            <button
                              onClick={() => {
                                URL.revokeObjectURL(preview);
                                deleteStoragePath(errorFotoStoragePaths[idx] ?? '');
                                setErrorFotoPreviews(p => p.filter((_, i) => i !== idx));
                                setErrorFotoFiles(f => f.filter((_, i) => i !== idx));
                                setErrorFotoWarnings(w => w.filter((_, i) => i !== idx));
                                setErrorFotoStorageUrls(p => p.filter((_, i) => i !== idx));
                                setErrorFotoStoragePaths(p => p.filter((_, i) => i !== idx));
                              }}
                              className="absolute top-1 right-1 bg-red text-white border-none rounded-full w-6 h-6 text-[14px] leading-none cursor-pointer flex items-center justify-center font-bold"
                              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.30)' }}>×</button>
                            {errorFotoWarnings[idx] && (
                              <div className="absolute bottom-0 left-0 right-0 bg-yellow-500/90 text-[8px] font-bold text-white text-center px-0.5 py-0.5 leading-tight">
                                ⚠ {errorFotoWarnings[idx]}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col items-center gap-1.5 py-3 px-2 bg-white border-2 border-dashed border-red/30 rounded-card cursor-pointer active:bg-bg text-center" style={{ boxShadow: '0 1px 4px rgba(211,47,47,0.06)' }}>
                        <span className="text-[26px]">📷</span>
                        <span className="text-[12px] text-red font-semibold">Cámara</span>
                        <span className="text-[10px] text-text-3">1 foto directa</span>
                        <input key={`ecam-${photoInputVer}`} type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={async e => {
                            const files = Array.from(e.target.files ?? []);
                            if (!files.length || photoUploadingRef.current) return;
                            photoUploadingRef.current = true; setPhotoUploading(true); setPhotoUploadMsg('');
                            try {
                              const results = await Promise.all(files.map(f => processPhoto(f)));
                              setErrorFotoFiles(prev => [...prev, ...results.map(r => r.compressed)]);
                              setErrorFotoPreviews(prev => [...prev, ...results.map(r => r.previewUrl)]);
                              setErrorFotoWarnings(prev => [...prev, ...results.map(r => r.warning)]);
                              if (user && navigator.onLine) {
                                const draftId = getDraftEntryId(); const ts = Date.now();
                                const paths = results.map((_, i) => `${user.id}/${draftId}_errd_${ts}_${i}.jpg`);
                                const urls = await Promise.all(results.map(async (r, i) => { const { error } = await supabase.storage.from('audit-photos').upload(paths[i], r.compressed, { contentType: 'image/jpeg', upsert: true }); return error ? '' : supabase.storage.from('audit-photos').getPublicUrl(paths[i]).data.publicUrl; }));
                                setErrorFotoStorageUrls(prev => [...prev, ...urls]);
                                setErrorFotoStoragePaths(prev => [...prev, ...paths]);
                                const saved = urls.filter(Boolean).length;
                                if (saved > 0) showToast(`📎 ${saved === 1 ? 'Foto guardada' : `${saved} fotos guardadas`}`, '#16A34A');
                              } else {
                                setErrorFotoStorageUrls(prev => [...prev, ...results.map(() => '')]);
                                setErrorFotoStoragePaths(prev => [...prev, ...results.map(() => '')]);
                                showToast('📶 Sin conexión — se subirán al registrar', '#D97706');
                              }
                            } finally { photoUploadingRef.current = false; setPhotoUploading(false); setPhotoUploadMsg(''); bumpPhotoInput(); }
                          }} />
                      </label>
                      <label className="flex flex-col items-center gap-1.5 py-3 px-2 bg-white border-2 border-dashed border-red/30 rounded-card cursor-pointer active:bg-bg text-center" style={{ boxShadow: '0 1px 4px rgba(211,47,47,0.06)' }}>
                        <span className="text-[26px]">🖼️</span>
                        <span className="text-[12px] text-red font-semibold">Galería</span>
                        <span className="text-[10px] text-text-3">Múltiples a la vez</span>
                        <input key={`egal-${photoInputVer}`} type="file" accept="image/*" multiple className="hidden"
                          onChange={async e => {
                            let files = Array.from(e.target.files ?? []);
                            if (!files.length || photoUploadingRef.current) return;
                            if (files.length > 100) { showToast(`Máximo 100 fotos por carga — se tomaron las primeras 100`, '#D97706'); files = files.slice(0, 100); }
                            photoUploadingRef.current = true; setPhotoUploading(true);
                            const total = files.length;
                            try {
                              const results: ProcessedPhoto[] = [];
                              for (let i = 0; i < files.length; i += 3) {
                                setPhotoProgress({ done: i, total, phase: 'compress' });
                                results.push(...await Promise.all(files.slice(i, i + 3).map(f => processPhoto(f))));
                              }
                              setPhotoProgress({ done: total, total, phase: 'compress' });
                              setErrorFotoFiles(prev => [...prev, ...results.map(r => r.compressed)]);
                              setErrorFotoPreviews(prev => [...prev, ...results.map(r => r.previewUrl)]);
                              setErrorFotoWarnings(prev => [...prev, ...results.map(r => r.warning)]);
                              if (user && navigator.onLine) {
                                const draftId = getDraftEntryId(); const ts = Date.now();
                                const paths = results.map((_, i) => `${user.id}/${draftId}_errd_${ts}_${i}.jpg`);
                                const urls: string[] = [];
                                let uploaded = 0;
                                for (let i = 0; i < results.length; i += 4) {
                                  setPhotoProgress({ done: uploaded, total, phase: 'upload' });
                                  const batch = await Promise.all(results.slice(i, i + 4).map(async (r, bi) => {
                                    const { error } = await supabase.storage.from('audit-photos').upload(paths[i + bi], r.compressed, { contentType: 'image/jpeg', upsert: true });
                                    return error ? '' : supabase.storage.from('audit-photos').getPublicUrl(paths[i + bi]).data.publicUrl;
                                  }));
                                  urls.push(...batch); uploaded += batch.length;
                                }
                                setPhotoProgress({ done: total, total, phase: 'upload' });
                                setErrorFotoStorageUrls(prev => [...prev, ...urls]);
                                setErrorFotoStoragePaths(prev => [...prev, ...paths]);
                                const saved = urls.filter(Boolean).length;
                                if (saved > 0) showToast(`📎 ${saved} foto${saved !== 1 ? 's' : ''} guardada${saved !== 1 ? 's' : ''}`, '#16A34A');
                              } else {
                                setErrorFotoStorageUrls(prev => [...prev, ...results.map(() => '')]);
                                setErrorFotoStoragePaths(prev => [...prev, ...results.map(() => '')]);
                                showToast('📶 Sin conexión — se subirán al registrar', '#D97706');
                              }
                            } finally { photoUploadingRef.current = false; setPhotoUploading(false); setPhotoUploadMsg(''); setPhotoProgress({ done: 0, total: 0, phase: '' }); bumpPhotoInput(); }
                          }} />
                      </label>
                    </div>
                  </>
                )}

                <SLabel>Fotos de productos <span className="text-[9px] font-normal ml-1 normal-case">opcional · múltiples permitidas</span></SLabel>
                {fotoPreviews.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {fotoPreviews.map((preview, idx) => (
                      <div key={idx} className="relative rounded-card overflow-hidden border border-border" style={{ boxShadow: '0 2px 8px rgba(26,37,80,0.08)' }}>
                        <img src={preview} alt={`Foto ${idx + 1}`} className="w-full object-cover cursor-pointer active:opacity-80" style={{ aspectRatio: '1', objectFit: 'cover' }} onClick={() => setLightboxUrl(preview)} />
                        <div className="absolute top-0.5 left-1 text-[9px] font-bold text-white bg-black/50 rounded px-1 py-0.5">#{idx + 1}</div>
                        <button
                          onClick={() => {
                            URL.revokeObjectURL(preview);
                            deleteStoragePath(fotoStoragePaths[idx] ?? '');
                            setFotoPreviews(p => p.filter((_, i) => i !== idx));
                            setFotoFiles(f => f.filter((_, i) => i !== idx));
                            setFotoWarnings(w => w.filter((_, i) => i !== idx));
                            setFotoStorageUrls(p => p.filter((_, i) => i !== idx));
                            setFotoStoragePaths(p => p.filter((_, i) => i !== idx));
                          }}
                          className="absolute top-1 right-1 bg-red text-white border-none rounded-full w-6 h-6 text-[14px] leading-none cursor-pointer flex items-center justify-center font-bold"
                          style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.30)' }}>×</button>
                        {fotoWarnings[idx] && (
                          <div className="absolute bottom-0 left-0 right-0 bg-yellow-500/90 text-[8px] font-bold text-white text-center px-0.5 py-0.5 leading-tight">
                            ⚠ {fotoWarnings[idx]}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col items-center gap-1.5 py-3 px-2 bg-white border-2 border-dashed border-border rounded-card cursor-pointer active:bg-bg text-center" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
                    <span className="text-[26px]">📷</span>
                    <span className="text-[12px] text-text-2 font-semibold">Cámara</span>
                    <span className="text-[10px] text-text-3">1 foto directa</span>
                    <input key={`fcam-${photoInputVer}`} type="file" accept="image/*" capture="environment" className="hidden"
                      onChange={async e => {
                        const files = Array.from(e.target.files ?? []);
                        if (!files.length || photoUploadingRef.current) return;
                        photoUploadingRef.current = true; setPhotoUploading(true); setPhotoUploadMsg('');
                        try {
                          const results = await Promise.all(files.map(f => processPhoto(f)));
                          setFotoFiles(prev => [...prev, ...results.map(r => r.compressed)]);
                          setFotoPreviews(prev => [...prev, ...results.map(r => r.previewUrl)]);
                          setFotoWarnings(prev => [...prev, ...results.map(r => r.warning)]);
                          if (user && navigator.onLine) {
                            const draftId = getDraftEntryId(); const ts = Date.now();
                            const paths = results.map((_, i) => `${user.id}/${draftId}_fotod_${ts}_${i}.jpg`);
                            const urls = await Promise.all(results.map(async (r, i) => { const { error } = await supabase.storage.from('audit-photos').upload(paths[i], r.compressed, { contentType: 'image/jpeg', upsert: true }); return error ? '' : supabase.storage.from('audit-photos').getPublicUrl(paths[i]).data.publicUrl; }));
                            setFotoStorageUrls(prev => [...prev, ...urls]);
                            setFotoStoragePaths(prev => [...prev, ...paths]);
                            const saved = urls.filter(Boolean).length;
                            if (saved > 0) showToast(`📎 ${saved === 1 ? 'Foto guardada' : `${saved} fotos guardadas`}`, '#16A34A');
                          } else {
                            setFotoStorageUrls(prev => [...prev, ...results.map(() => '')]);
                            setFotoStoragePaths(prev => [...prev, ...results.map(() => '')]);
                            showToast('📶 Sin conexión — se subirán al registrar', '#D97706');
                          }
                        } finally { photoUploadingRef.current = false; setPhotoUploading(false); setPhotoUploadMsg(''); bumpPhotoInput(); }
                      }} />
                  </label>
                  <label className="flex flex-col items-center gap-1.5 py-3 px-2 bg-white border-2 border-dashed border-border rounded-card cursor-pointer active:bg-bg text-center" style={{ boxShadow: '0 1px 4px rgba(26,37,80,0.04)' }}>
                    <span className="text-[26px]">🖼️</span>
                    <span className="text-[12px] text-text-2 font-semibold">Galería</span>
                    <span className="text-[10px] text-text-3">Múltiples a la vez</span>
                    <input key={`fgal-${photoInputVer}`} type="file" accept="image/*" multiple className="hidden"
                      onChange={async e => {
                        let files = Array.from(e.target.files ?? []);
                        if (!files.length || photoUploadingRef.current) return;
                        if (files.length > 100) { showToast(`Máximo 100 fotos por carga — se tomaron las primeras 100`, '#D97706'); files = files.slice(0, 100); }
                        photoUploadingRef.current = true; setPhotoUploading(true);
                        const total = files.length;
                        try {
                          const results: ProcessedPhoto[] = [];
                          for (let i = 0; i < files.length; i += 3) {
                            setPhotoProgress({ done: i, total, phase: 'compress' });
                            results.push(...await Promise.all(files.slice(i, i + 3).map(f => processPhoto(f))));
                          }
                          setPhotoProgress({ done: total, total, phase: 'compress' });
                          setFotoFiles(prev => [...prev, ...results.map(r => r.compressed)]);
                          setFotoPreviews(prev => [...prev, ...results.map(r => r.previewUrl)]);
                          setFotoWarnings(prev => [...prev, ...results.map(r => r.warning)]);
                          if (user && navigator.onLine) {
                            const draftId = getDraftEntryId(); const ts = Date.now();
                            const paths = results.map((_, i) => `${user.id}/${draftId}_fotod_${ts}_${i}.jpg`);
                            const urls: string[] = [];
                            let uploaded = 0;
                            for (let i = 0; i < results.length; i += 4) {
                              setPhotoProgress({ done: uploaded, total, phase: 'upload' });
                              const batch = await Promise.all(results.slice(i, i + 4).map(async (r, bi) => {
                                const { error } = await supabase.storage.from('audit-photos').upload(paths[i + bi], r.compressed, { contentType: 'image/jpeg', upsert: true });
                                return error ? '' : supabase.storage.from('audit-photos').getPublicUrl(paths[i + bi]).data.publicUrl;
                              }));
                              urls.push(...batch); uploaded += batch.length;
                            }
                            setPhotoProgress({ done: total, total, phase: 'upload' });
                            setFotoStorageUrls(prev => [...prev, ...urls]);
                            setFotoStoragePaths(prev => [...prev, ...paths]);
                            const saved = urls.filter(Boolean).length;
                            if (saved > 0) showToast(`📎 ${saved} foto${saved !== 1 ? 's' : ''} guardada${saved !== 1 ? 's' : ''}`, '#16A34A');
                          } else {
                            setFotoStorageUrls(prev => [...prev, ...results.map(() => '')]);
                            setFotoStoragePaths(prev => [...prev, ...results.map(() => '')]);
                            showToast('📶 Sin conexión — se subirán al registrar', '#D97706');
                          }
                        } finally { photoUploadingRef.current = false; setPhotoUploading(false); setPhotoUploadMsg(''); setPhotoProgress({ done: 0, total: 0, phase: '' }); bumpPhotoInput(); }
                      }} />
                  </label>
                </div>

                <button onClick={handleSubmitClick} disabled={submitting}
                  className={`w-full mt-4 py-4 bg-navy text-white border-none rounded-card font-barlow-condensed text-[22px] font-bold tracking-wide cursor-pointer transition-all active:scale-[0.99] ${(!canSubmit || submitting) ? 'opacity-30' : ''}`}
                  style={{ background: canSubmit && !submitting ? 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)' : undefined, boxShadow: canSubmit && !submitting ? '0 6px 24px rgba(26,37,80,0.40)' : 'none' }}>
                  {submitting ? `⏳ ${uploadProgress || 'Guardando…'}` : '✓ Registrar auditoría'}
                </button>
                {!canSubmit && !submitting && (
                  <div className="mt-2 text-center text-[12px] text-red font-bold">
                    {(!pallets || parseInt(pallets) <= 0) ? '↑ Ingresa el número de pallets auditados'
                    : tieneErrores === null ? '↑ Indica si el pallet tuvo errores'
                    : (tieneErrores && tiposError.length === 0) ? '↑ Selecciona el tipo de error'
                    : !auditor.trim() ? '↑ Selecciona el auditor'
                    : !tienda ? '↑ Selecciona la tienda'
                    : '↑ Completa todos los códigos de operación'}
                  </div>
                )}
              </>
              </motion.div>
            )}
            </AnimatePresence>
          </div>}
        </div>

        {/* RIGHT: STATS PANEL (desktop only, not for admin-auditoria or auditor) */}
        {!isAdminAud && !isAuditorOnly && (
          <div className="hidden md:flex md:flex-1 overflow-hidden">
            <StatsPanel history={history} today={today} onReaudit={iniciarReauditoria} odooConfig={odooConfig} pickerNames={PICKER_NAMES} onRefresh={loadHistory} />
          </div>
        )}
        {/* RIGHT: ADMIN DESKTOP PANEL (dashboard + ranking + historial) */}
        {isAdminAud && (
          <div className="hidden md:flex md:flex-1 overflow-hidden border-l border-border flex-col">
            <AdminDesktopPanel history={history} today={today} odooConfig={odooConfig} pickerNames={PICKER_NAMES} onReaudit={e => { iniciarReauditoria(e); }} onRefresh={loadHistory} />
          </div>
        )}
      </div>

      {/* ── MOBILE OVERLAYS (not for admin-auditoria) ── */}
      {!isAdminAud && view === 'dashboard' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
            <div className="flex-1"><div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase">Dashboard</div><div className="text-[11px] text-white/40">{today} · {todayEntries.length} auditorías</div></div>
          </div>
          <div className="flex-1 overflow-y-auto"><DashboardContent history={history} today={today} pickerNames={PICKER_NAMES} /></div>
        </div>
      )}
      {!isAdminAud && view === 'ranking' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Ranking Pickers</div>
          </div>
          <RankingContent history={history} odooConfig={odooConfig} pickerNames={PICKER_NAMES} />
        </div>
      )}
      {!isAdminAud && view === 'history' && (
        <div className="fixed inset-0 z-30 md:hidden flex flex-col bg-bg">
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #1a2550 0%, #1e3a8a 100%)', boxShadow: '0 2px 16px rgba(26,37,80,0.30)' }}>
            <button onClick={() => setView('form')}
              className="flex items-center justify-center rounded-full cursor-pointer transition-all active:scale-95 flex-shrink-0"
              style={{ width: 36, height: 36, background: 'linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.20)' }}>
              <ChevronLeft size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
            </button>
            <div className="font-barlow-condensed text-[20px] font-bold text-white tracking-widest uppercase flex-1">Historial</div>
          </div>
          <HistoryContent history={history} today={today} onReaudit={iniciarReauditoria} onExportPDF={exportarPDF} onRefresh={loadHistory} pickerNames={PICKER_NAMES} />
        </div>
      )}

      {/* ── MOBILE MENU ── */}
      {!isAdminAud && mobileMenuOpen && (
        <MobileMenu
          onlyHistory={isAuditorOnly}
          onClose={() => setMobileMenuOpen(false)}
          onNavigate={v => { setView(v); setMobileMenuOpen(false); }}
        />
      )}

      {/* ── TIPO CHANGE WARNING (#7) ── */}
      {tipoPending !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setTipoPending(null)} />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="font-barlow-condensed text-[18px] font-bold text-navy mb-2">¿Cambiar tipo?</div>
            <div className="text-[13px] text-text-2 mb-4">Las fotos adjuntas se eliminarán al cambiar el tipo de contenido.</div>
            <div className="flex gap-2">
              <button onClick={() => setTipoPending(null)} className="flex-1 py-3 border border-border rounded-card font-barlow-condensed text-[15px] font-bold text-text-2 cursor-pointer">Cancelar</button>
              <button onClick={() => { setTipo(tipoPending!); setTipoPending(null); }} className="flex-1 py-3 bg-navy text-white rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer" style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)' }}>Sí, cambiar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM SUBMIT MODAL (#6) ── */}
      {/* ── CAMERA BARCODE SCANNER OVERLAY ── */}
      {cameraOpen && (
        <CameraBarcodeScanner
          onScan={(raw) => { const ok = handleBarcodeScan(raw); setCameraOpen(false); return ok; }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {/* ── CANCEL AUDIT MODAL ── */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmCancel(false)} />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(211,47,47,0.12)' }}>
                <span className="text-[20px]">⚠</span>
              </div>
              <div className="font-barlow-condensed text-[21px] font-bold text-red leading-tight">Cancelar auditoría</div>
            </div>
            <div className="text-[13px] text-text-2 leading-relaxed mb-2">
              Se perderán <strong>todos los datos</strong> de esta auditoría en curso:
            </div>
            <ul className="text-[12px] text-text-3 mb-5 space-y-1 ml-4 list-disc">
              <li>Tienda, picker y tipo configurados</li>
              <li>Fotos subidas (se eliminarán del servidor)</li>
              <li>Errores y productos registrados</li>
              <li>Tiempo transcurrido: <strong className="text-navy font-barlow-condensed text-[14px]">{formatTimer(timerSeconds)}</strong></li>
            </ul>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="flex-1 py-3 border border-border rounded-card font-barlow-condensed text-[15px] font-bold text-text-2 cursor-pointer bg-white transition-all active:bg-bg">
                Continuar
              </button>
              <button
                type="button"
                onClick={handleCancelAudit}
                className="flex-1 py-3 text-white rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,#DC2626,#B91C1C)', boxShadow: '0 4px 16px rgba(220,38,38,0.35)' }}>
                Cancelar y salir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM SUBMIT MODAL (#6) ── */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="Vista ampliada" className="max-w-full max-h-full object-contain" style={{ maxHeight: '90dvh', maxWidth: '95vw' }} />
          <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white text-[28px] font-bold leading-none bg-black/40 rounded-full w-10 h-10 flex items-center justify-center cursor-pointer border-none">×</button>
        </div>
      )}
      {confirmSubmit && tienda && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmSubmit(false)} />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="font-barlow-condensed text-[20px] font-bold text-navy mb-3">Confirmar registro</div>
            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between items-start py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Auditor</span>
                <span className="font-semibold text-text text-[13px] text-right ml-4">{auditor}</span>
              </div>
              <div className="flex justify-between items-start py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Tienda</span>
                <span className="font-semibold text-text text-[13px] text-right ml-4">{tienda.nombre}</span>
              </div>
              {(pickerNombres.length > 0 || pickerNombre) && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-text-3 text-[12px]">{pickerNombres.length > 1 ? 'Pickers' : 'Picker'}</span>
                  <span className="font-semibold text-text text-[13px] text-right max-w-[60%] truncate">
                    {pickerNombres.length > 1 ? pickerNombres.join(' + ') : (pickerNombre || '')}
                  </span>
                </div>
              )}
              {picker && (
                <div className="flex justify-between items-center py-1.5 border-b border-border">
                  <span className="text-text-3 text-[12px]">Id. pistola</span>
                  <span className="font-mono font-semibold text-text text-[13px]">{picker.replace('Pickers ', 'P.')}</span>
                </div>
              )}
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Tipo</span>
                <span className="font-semibold text-text text-[13px] capitalize">{tipo}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Pallets</span>
                <span className="font-semibold text-text text-[13px]">{pallets}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-border">
                <span className="text-text-3 text-[12px]">Resultado</span>
                <span className={`font-barlow-condensed font-bold text-[20px] ${resultado === 'bueno' ? 'text-success' : 'text-red'}`}>{resultado === 'bueno' ? '✓ Bueno' : '✗ Malo'}</span>
              </div>
              {auditStartTime && (
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-text-3 text-[12px]">Duración auditoría</span>
                  <span className="font-barlow-condensed font-bold text-navy text-[22px]">⏱ {formatTimer(timerSeconds)}</span>
                </div>
              )}
              {tieneErrores && productos.length > 0 && (
                <div className="text-[11px] text-text-3 italic">{productos.length} producto{productos.length !== 1 ? 's' : ''} con error · {tiposError.join(', ')}</div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSubmit(false)} className="flex-1 py-3 border border-border rounded-card font-barlow-condensed text-[15px] font-bold text-text-2 cursor-pointer">Cancelar</button>
              <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-3 text-white rounded-card font-barlow-condensed text-[16px] font-bold cursor-pointer disabled:opacity-50" style={{ background: 'linear-gradient(135deg,#1a2550,#1e3a8a)' }}>{submitting ? 'Guardando…' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

