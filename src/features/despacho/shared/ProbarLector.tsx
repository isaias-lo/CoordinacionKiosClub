'use client';

// Prueba del lector de la handheld, en Perfil. Para configurar un equipo nuevo en dos minutos:
// se escanea cualquier etiqueta y se ve qué entregó el lector, si llegó el Enter y si Bodega lo
// va a reconocer como lectura (ver `lectorBodega.ts`).

import { useRef, useState } from 'react';
import { esLecturaDeLector, LECTOR, type Tramo } from './lectorBodega';
import { avisoFisico } from '@/lib/avisoFisico';

interface Resultado {
  codigo: string;
  totalMs: number;
  maxPausaMs: number;
  conEnter: boolean;
  reconocido: boolean;
}

export function ProbarLector() {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const tramos = useRef<Tramo[]>([]);
  const teclaSumada = useRef(false);
  const silencio = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cerrar = (conEnter: boolean) => {
    if (silencio.current) { clearTimeout(silencio.current); silencio.current = null; }
    const ts = tramos.current;
    tramos.current = [];
    if (inputRef.current) inputRef.current.value = '';
    const codigo = ts.map(t => t.texto).join('');
    if (!codigo) return;
    let maxPausa = 0;
    for (let i = 1; i < ts.length; i++) maxPausa = Math.max(maxPausa, ts.at(i)!.t - ts.at(i - 1)!.t);
    const reconocido = esLecturaDeLector(ts);
    avisoFisico(reconocido && conEnter ? 'ok' : reconocido ? 'aviso' : 'error');
    setResultado({
      codigo,
      totalMs: Math.round(ts.at(-1)!.t - ts.at(0)!.t),
      maxPausaMs: Math.round(maxPausa),
      conEnter,
      reconocido,
    });
  };

  const sumar = (texto: string) => {
    const limpio = texto.replace(/[\r\n]/g, '');
    if (limpio) tramos.current.push({ texto: limpio, t: performance.now() });
    if (silencio.current) clearTimeout(silencio.current);
    silencio.current = setTimeout(() => cerrar(false), 400);
  };

  const fila = (label: string, valor: string, ok?: boolean) => (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-b-0">
      <span className="text-[12px] text-text-3">{label}</span>
      <span className="text-[12px] font-mono font-semibold text-right ml-4 break-all"
        style={{ color: ok === undefined ? undefined : ok ? '#16A34A' : '#D32F2F' }}>{valor}</span>
    </div>
  );

  return (
    <div className="rounded-card border border-border bg-white overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <p className="text-[12px] text-text-3 mb-2">
          Toca el campo y escanea cualquier etiqueta con el lector del equipo.
        </p>
        <input
          ref={inputRef}
          type="text"
          defaultValue=""
          placeholder="Esperando lectura…"
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); cerrar(true); return; }
            if (e.key.length === 1) { sumar(e.key); teclaSumada.current = true; return; }
            teclaSumada.current = false;
          }}
          onBeforeInput={e => {
            if (teclaSumada.current) { teclaSumada.current = false; return; }
            const data = (e.nativeEvent as InputEvent).data;
            if (!data) return;
            sumar(data);
            if (/[\r\n]/.test(data)) { e.preventDefault(); cerrar(true); }
          }}
          className="w-full bg-white border-[1.5px] border-border rounded-btn px-3 py-2.5 font-mono text-[14px] outline-none focus:border-[#1E40AF]"
        />
      </div>
      {resultado && (
        <div className="border-t border-border">
          {fila('Código leído', resultado.codigo)}
          {fila('Caracteres', String(resultado.codigo.length))}
          {fila('Tiempo total', `${resultado.totalMs} ms`)}
          {fila('Pausa más larga', `${resultado.maxPausaMs} ms`, resultado.maxPausaMs <= LECTOR.maxPausaMs)}
          {fila('Enter al final', resultado.conEnter ? 'Sí' : 'No (configura el sufijo Enter)', resultado.conEnter)}
          {fila('Bodega lo reconoce', resultado.reconocido ? 'Sí' : 'No, parece tecleo', resultado.reconocido)}
        </div>
      )}
    </div>
  );
}
