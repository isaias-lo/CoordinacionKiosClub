'use client';

import { useState } from 'react';
import { agregarCategoria, cambiarCategoria, guardarAjustes, type DatosAjustes } from '../apiCliente';
import { AjustesSchema, CAMPOS_AJUSTE, nombreCategoria } from '../utils/ajustes';
import type { ConfigMant } from '../utils/tablero';
import { Aviso, BotonSecundario, Tarjeta, estiloCampo } from '../ui';
import { fmtFechaHoraChile } from '@/lib/fechaChile';

/** Umbrales y pesos del tablero, y la lista de categorías sugeridas. Cada cambio queda en la bitácora. */
export function Ajustes({ datos, alGuardar }: { datos: DatosAjustes; alGuardar: () => Promise<void> }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Umbrales datos={datos} alGuardar={alGuardar} />
      <Categorias datos={datos} alGuardar={alGuardar} />
    </div>
  );
}

function Umbrales({ datos, alGuardar }: { datos: DatosAjustes; alGuardar: () => Promise<void> }) {
  const [valores, setValores] = useState<ConfigMant>(datos.config);
  const [estado, setEstado] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cambio = CAMPOS_AJUSTE.some(c => valores[c.clave] !== datos.config[c.clave]);
  const valido = AjustesSchema.safeParse(valores).success;

  const mover = (clave: keyof ConfigMant, delta: number, min: number, max: number) =>
    setValores(v => ({ ...v, [clave]: Math.min(max, Math.max(min, v[clave] + delta)) }));

  const guardar = async () => {
    setGuardando(true);
    setEstado(null);
    try {
      await guardarAjustes(valores);
      await alGuardar();
      setEstado({ tono: 'ok', texto: 'Guardado. El tablero ya usa los valores nuevos.' });
    } catch (e) {
      setEstado({ tono: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Tarjeta className="space-y-4">
      <div>
        <h2 className="text-base font-bold">Alertas y orden del tablero</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          Cámbialos y guarda: las alertas y el orden se recalculan al instante.
        </p>
      </div>
      {CAMPOS_AJUSTE.map(c => (
        <div key={c.clave} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold" id={`aj-${c.clave}`}>{c.etiqueta}</p>
            <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{c.ayuda}</p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-labelledby={`aj-${c.clave}`}>
            <button type="button" aria-label={`Bajar ${c.etiqueta}`} onClick={() => mover(c.clave, -1, c.min, c.max)}
              className="h-10 w-10 rounded-lg text-lg font-bold" style={estiloCampo}>−</button>
            <span className="w-10 text-center text-lg font-bold tabular-nums" aria-live="polite">{valores[c.clave]}</span>
            <button type="button" aria-label={`Subir ${c.etiqueta}`} onClick={() => mover(c.clave, 1, c.min, c.max)}
              className="h-10 w-10 rounded-lg text-lg font-bold" style={estiloCampo}>+</button>
          </div>
        </div>
      ))}
      {estado && <Aviso tono={estado.tono}>{estado.texto}</Aviso>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
          Cada cambio queda registrado con fecha y autor.
          {datos.actualizado?.por ? ` Último: ${datos.actualizado.por}, ${fmtFechaHoraChile(datos.actualizado.en)}.` : ''}
        </p>
        <div className="flex gap-2">
          {cambio && <BotonSecundario onClick={() => setValores(datos.config)} disabled={guardando}>Deshacer</BotonSecundario>}
          <button type="button" onClick={guardar} disabled={!cambio || !valido || guardando}
            className="min-h-[44px] rounded-xl px-4 text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--color-primary)', color: '#fff' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </Tarjeta>
  );
}

function Categorias({ datos, alGuardar }: { datos: DatosAjustes; alGuardar: () => Promise<void> }) {
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activas = datos.categorias.filter(c => c.activa);
  const quitadas = datos.categorias.filter(c => !c.activa);

  const hacer = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setOcupado(true);
    setError(null);
    try { await fn(); await alGuardar(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); return false; }
    finally { setOcupado(false); }
  };

  return (
    <Tarjeta className="space-y-3">
      <div>
        <h2 className="text-base font-bold">Categorías</h2>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          Son las que el supervisor elige al crear una solicitud. También puede escribir otra.
        </p>
      </div>
      <ul className="space-y-1">
        {activas.map(c => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--color-bg-2)' }}>
            <span className="text-sm">{c.nombre}</span>
            <button type="button" disabled={ocupado} onClick={() => hacer(() => cambiarCategoria(c.id, false))}
              className="text-sm font-semibold underline disabled:opacity-50">Quitar</button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={async e => {
        e.preventDefault();
        const n = nombreCategoria(nueva);
        if (n && await hacer(() => agregarCategoria(n))) setNueva('');
      }}>
        <label htmlFor="cat-nueva" className="sr-only">Nueva categoría</label>
        <input id="cat-nueva" value={nueva} onChange={e => setNueva(e.target.value)} maxLength={60}
          placeholder="Nueva categoría" className="min-h-[44px] flex-1 rounded-xl px-3 text-sm" style={estiloCampo} />
        <button type="submit" disabled={ocupado || !nombreCategoria(nueva)}
          className="min-h-[44px] rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
          style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
          Agregar
        </button>
      </form>
      {quitadas.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm" style={{ color: 'var(--color-text-sub)' }}>Quitadas ({quitadas.length})</summary>
          <ul className="mt-1 space-y-1">
            {quitadas.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-1 text-sm">
                <span style={{ color: 'var(--color-text-sub)' }}>{c.nombre}</span>
                <button type="button" disabled={ocupado} onClick={() => hacer(() => cambiarCategoria(c.id, true))}
                  className="font-semibold underline disabled:opacity-50">Volver a poner</button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--est-error)' }}>{error}</p>}
    </Tarjeta>
  );
}
