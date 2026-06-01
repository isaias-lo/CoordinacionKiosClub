'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

// Barcode scanner para autocompletar operación (pistola lectora)
// Usa input NO controlado + eventos nativos para máxima compatibilidad con
// Android Chrome + IME. En ese entorno, onKeyDown siempre devuelve key="Unidentified"
// (keyCode 229) porque el IME intercepta las teclas antes de React. La solución:
// – native 'input' event para detectar \n/\r inyectados por el scanner
// – native 'keyup' (menos afectado por IME) para Enter
// – timer de 100 ms como último recurso si el scanner no manda Enter
export function BarcodeInputScanner({ onScan }: { onScan: (raw: string) => boolean }) {
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);
  const [focused,  setFocused]  = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refocus = () => setTimeout(() => inputRef.current?.focus(), 60);

  const tryParse = useCallback((raw: string) => {
    const clean = raw.replace(/[\n\r]/g, '').trim();
    if (!clean) return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const ok = onScan(clean);
    setFeedback(ok
      ? { ok: true,  msg: '✓ Tienda, picker y contenido asignados' }
      : { ok: false, msg: '✗ Código no reconocido' }
    );
    if (inputRef.current) inputRef.current.value = '';
    setTimeout(() => setFeedback(null), 3000);
    refocus();
  }, [onScan]);

  // Eventos nativos: evitan el filtro IME de Android Chrome
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const onInput = () => {
      const v = el.value;
      // Algunos scanners Android inyectan \n/\r dentro del propio valor
      if (v.includes('\n') || v.includes('\r')) { tryParse(v); return; }
      // Timer fallback: si el escáner no manda Enter, procesar tras 100 ms de silencio
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const cur = el.value.trim();
        // Formatos aceptados:
        //   • COD;picker;refs;P#;cats  (o '|' legacy)
        //   • ID numérico (slot_id legacy)
        //   • ID canónico: termina en P / B / C / CH y contiene letras+dígitos (P{seq}{cod}{stamp}P, etc.)
        const hasSemi = (cur.match(/;/g) ?? []).length >= 2;
        const hasPipe = (cur.match(/\|/g) ?? []).length >= 2;
        const isNumericId  = /^\d{1,10}$/.test(cur);
        const isCanonicalId = /^[A-Z]?[A-Z]?\d+.*(?:P|B|C|CH)$/i.test(cur) && /\d{8}/.test(cur);
        if (cur && (hasSemi || hasPipe || isNumericId || isCanonicalId)) tryParse(cur);
      }, 100);
    };

    // keyup es menos bloqueado por IME que keydown; keyCode 13 = Enter
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.keyCode === 13) && el.value.trim()) {
        e.preventDefault();
        tryParse(el.value);
      }
    };

    el.addEventListener('input', onInput);
    el.addEventListener('keyup', onKeyUp);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('keyup', onKeyUp);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [tryParse]);

  // Fallback global: si la pistola dispara fuera de cualquier input, enfocar aquí
  useEffect(() => {
    const handleGlobal = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.length === 1 || e.key === 'Enter') inputRef.current?.focus();
    };
    document.addEventListener('keydown', handleGlobal);
    return () => document.removeEventListener('keydown', handleGlobal);
  }, []);

  return (
    <div className="mb-3 rounded-card overflow-hidden border-[1.5px]"
      style={{ borderColor: focused ? '#2563EB' : 'rgba(37,99,235,0.30)', background: 'rgba(37,99,235,0.03)', transition: 'border-color 0.15s' }}>
      <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
        <span style={{ fontSize: 15 }}>📷</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Pistola lectora — apunta al código del pallet
        </span>
        <button
          type="button"
          onPointerDown={e => { e.preventDefault(); refocus(); }}
          style={{ marginLeft: 'auto', fontSize: 11, color: focused ? '#16A34A' : '#2563EB',
            fontWeight: 700, background: focused ? 'rgba(22,163,74,0.10)' : 'rgba(37,99,235,0.08)',
            border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 } as React.CSSProperties}>
          {focused ? '● Activo' : '○ Activar'}
        </button>
      </div>
      <div className="px-3 pb-2.5">
        <input
          ref={inputRef}
          type="text"
          defaultValue=""
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Listo para escanear…"
          className="w-full bg-white border-[1.5px] rounded-btn px-3 py-2.5 font-mono text-[14px] outline-none"
          style={{ borderColor: feedback?.ok ? '#16A34A' : feedback ? '#D32F2F' : focused ? '#2563EB' : 'rgba(37,99,235,0.40)', boxShadow: '0 1px 4px rgba(26,37,80,0.08)' }}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {feedback ? (
          <div className="mt-1 text-[12px] font-semibold" style={{ color: feedback.ok ? '#16A34A' : '#D32F2F' }}>
            {feedback.msg}
          </div>
        ) : (
          <div className="mt-1 text-[11px]" style={{ color: focused ? '#2563EB' : 'rgba(37,99,235,0.55)' }}>
            {focused ? 'Esperando código…' : 'Toca "Activar" o el campo para iniciar escaneo'}
          </div>
        )}
      </div>
    </div>
  );
}
