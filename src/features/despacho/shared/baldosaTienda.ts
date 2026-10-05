// Lo que dice cada baldosa del Mosaico de «Hoy», en palabras. Puro y testeable.
//
// La baldosa no calcula nada nuevo: el estado y el avance salen de `listaTiendas.ts` igual que
// en la fila. Acá solo se decide cómo se leen: «3/5 pallets · 1/2 b.» mientras se carga, y
// «✓ 2 pallets» cuando la tienda está lista.

import type { AvanceTienda } from './unidadVisual';
import type { EstadoLista } from './listaTiendas';

const NOMBRE: Record<string, { uno: string; varios: string }> = {
  pallet:     { uno: 'pallet', varios: 'pallets' },
  contenedor: { uno: 'cont.',  varios: 'cont.' },
  bulto:      { uno: 'b.',     varios: 'b.' },
  chocolate:  { uno: 'ch.',    varios: 'ch.' },
};

const nombre = (clase: string, n: number) => {
  const e = NOMBRE[clase] ?? { uno: clase, varios: clase };
  return n === 1 ? e.uno : e.varios;
};

export const ESTADO_BALDOSA: Record<EstadoLista, string> = {
  lista: 'lista',
  curso: 'cargando',
  pendiente: 'sin empezar',
};

/** Adquisiciones y web/retiro: no se pesan, pero existen y hay que verlas. */
export function agregadosBaldosa(a?: { adquisicion: number; webRetiro: number }): string[] {
  if (!a) return [];
  return [
    a.adquisicion > 0 ? `${a.adquisicion} adq.` : '',
    a.webRetiro > 0 ? `${a.webRetiro} web` : '',
  ].filter(Boolean);
}

/** «3/5 pallets · 1/2 b.», o «✓ 2 pallets» si está lista. */
export function detalleBaldosa(estado: EstadoLista, avance: AvanceTienda): string {
  if (avance.porTipo.length === 0) return estado === 'lista' ? '✓ Lista' : 'Sin unidades';
  if (estado === 'lista') {
    return '✓ ' + avance.porTipo.map(t => `${t.total} ${nombre(t.clase, t.total)}`).join(' · ');
  }
  return avance.porTipo.map(t => `${t.pesadas}/${t.total} ${nombre(t.clase, t.total)}`).join(' · ');
}

/** Cuánto del anillo va lleno, de 0 a 100. Lista siempre va completo. */
export function pctAnillo(estado: EstadoLista, avance: AvanceTienda): number {
  if (estado === 'lista') return 100;
  if (avance.total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((avance.pesadas / avance.total) * 100)));
}

/** Lo que lee un lector de pantalla: nombre, estado y avance, más lo que hay que ir a mirar. */
export function ariaBaldosa(t: {
  nombre: string;
  cod: string;
  estado: EstadoLista;
  avance: AvanceTienda;
  chip: string;
  conGuia: boolean;
  agregados?: { adquisicion: number; webRetiro: number };
  odoo?: { done: number; total: number };
}): string {
  const partes = [
    `${t.nombre} (${t.cod})`,
    ESTADO_BALDOSA[t.estado],
    t.avance.total > 0 ? `${t.avance.pesadas} de ${t.avance.total} pesadas` : 'sin unidades',
    detalleBaldosa(t.estado, t.avance).replace('✓ ', ''),
  ];
  if (t.chip.toLowerCase() !== ESTADO_BALDOSA[t.estado] && t.chip !== 'En curso') partes.push(t.chip);
  if (t.conGuia) partes.push('con guía');
  partes.push(...agregadosBaldosa(t.agregados));
  if (t.odoo && t.odoo.total > 0) partes.push(`Odoo ${t.odoo.done} de ${t.odoo.total}`);
  return partes.join(', ');
}
