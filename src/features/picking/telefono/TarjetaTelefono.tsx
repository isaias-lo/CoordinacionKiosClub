'use client';

import React from 'react';
import { PickerGroupCard } from '../components/PickerGroupCard';
import { COLOR_SECCION, colorAvatar, iniciales, estadoOdoo } from '../seco/filaEncargado';
import type { FilaSeco } from '../seco/TablaEncargados';

interface Props {
  fila: FilaSeco;
  /** Abre el detalle completo (nombre, batch, peso y vista previa de etiquetas). */
  onAbrir: () => void;
}

/** Tarjeta de un encargado en teléfono y handheld: quién es, sus contadores y el botón de imprimir. */
export function TarjetaTelefono({ fila, onAbrir }: Props) {
  const estado = estadoOdoo(fila.group.operations);
  return (
    <article className="pk-tel-card" aria-label={fila.nombre}>
      <div className="pk-tel-card-h">
        <span className="pk-av" style={{ background: colorAvatar(fila.group.key) }} aria-hidden="true">{iniciales(fila.nombre)}</span>
        <button type="button" className="pk-link quien" onClick={onAbrir} aria-label={`Ver el detalle de ${fila.nombre}`}>
          <b>{fila.nombre}</b>
          {fila.categorias.length > 0 && (
            <span>
              {fila.categorias.map(c => (
                <span key={c} className="pk-chip"><i style={{ background: COLOR_SECCION[c] ?? '#8A91A1' }} />{c}</span>
              ))}
            </span>
          )}
        </button>
        <span className={`pk-pill ${estado.tono}`}>{estado.texto}</span>
      </div>
      <PickerGroupCard {...fila.tarjeta} variante="telefono" unidades={fila.unidades} notaUnidades={fila.nota} />
    </article>
  );
}
