'use client';

// Franja azul con la regla de la pestaña de sección (ver `textoFranja`). Se puede cerrar y vuelve al
// día siguiente: quien ya la leyó no la necesita todo el día, quien llega mañana sí.

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { textoFranja, claveFranjaCerrada } from './ayudaContexto';
import { fechaChile } from '@/lib/fechaChile';

function leerCerrada(clave: string): boolean {
  try { return localStorage.getItem(clave) === '1'; } catch { return false; }
}

export function FranjaSeccion({ seccion }: { seccion?: string | null }) {
  const texto = textoFranja(seccion);
  const clave = seccion ? claveFranjaCerrada(seccion, fechaChile()) : '';
  // Se lee después de montar: en el servidor no hay localStorage y la hidratación tiene que coincidir.
  const [cerrada, setCerrada] = useState(true);
  useEffect(() => { setCerrada(clave ? leerCerrada(clave) : true); }, [clave]);

  if (!texto || cerrada) return null;
  return (
    <div className="pk-alert info pk-franja print:hidden" role="note">
      <span className="pk-franja-i" aria-hidden="true">i</span>
      <span style={{ flex: 1 }}>{texto}</span>
      <button type="button" className="pk-franja-x" aria-label="Cerrar este aviso por hoy" title="Cerrar por hoy"
        onClick={() => { try { localStorage.setItem(clave, '1'); } catch { /* sin almacenamiento: se cierra igual */ } setCerrada(true); }}>
        <X size={14} />
      </button>
    </div>
  );
}
