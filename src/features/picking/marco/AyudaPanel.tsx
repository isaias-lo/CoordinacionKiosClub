'use client';

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ATAJOS, GUIA } from './ayuda';

/** Panel lateral «Ayuda y atajos»: cómo se usa Picking y qué teclas tiene. */
export function AyudaPanel({ onClose }: { onClose: () => void }) {
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cerrar.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="pk-velo print:hidden">
      <button type="button" className="pk-velo-fondo" tabIndex={-1} aria-hidden="true" onClick={onClose} />
      <aside className="pk-drawer" role="dialog" aria-modal="true" aria-labelledby="pk-ayuda-titulo">
        <div className="pk-drawer-h">
          <span id="pk-ayuda-titulo" className="pk-ttl">Ayuda y atajos</span>
          <span className="pk-sp" />
          <button ref={cerrar} type="button" className="pk-btn" style={{ padding: 6 }} onClick={onClose} aria-label="Cerrar la ayuda">
            <X size={16} />
          </button>
        </div>
        <div className="pk-drawer-b">
          {GUIA.map(t => (
            <section key={t.titulo} className="pk-ayuda-tema">
              <h3>{t.titulo}</h3>
              <ol>{t.pasos.map((p, i) => <li key={i}>{p}</li>)}</ol>
            </section>
          ))}
          <section className="pk-ayuda-tema max-lg:hidden">
            <h3>Atajos de teclado</h3>
            <table className="pk-atajos">
              <tbody>
                {ATAJOS.map(a => (
                  <tr key={a.que}>
                    <td>{a.teclas.map(k => <kbd key={k}>{k}</kbd>)}</td>
                    <td>{a.que}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pk-sub">Los atajos no se activan mientras escribes en un campo.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}
