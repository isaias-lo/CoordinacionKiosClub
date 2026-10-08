// Contenido de «Ayuda y atajos» de Picking, y qué hace cada tecla. Puro y testeable.
//
// La guía vive en el código, al lado de la pantalla que explica: cuando una fase del rediseño
// cambia un botón, el texto se corrige en el mismo PR.

import { PESTANAS, type PestanaPicking } from './pestanas';

export interface TemaAyuda { titulo: string; pasos: string[] }

export const GUIA: TemaAyuda[] = [
  {
    titulo: 'Empezar el día',
    pasos: [
      'En «Tiendas de hoy» aparecen las tiendas que despachan hoy según el calendario. Marca una o varias: sus operaciones se cargan desde Odoo.',
      'Las tiendas quedan elegidas durante el día aunque recargues la página.',
      '«Elegir todas» al lado de Santiago, Regiones o Costa marca el grupo completo.',
      '«+ Adelantar tienda» agrega una tienda que no está en el calendario de hoy. El basurero al lado de la tienda la quita.',
    ],
  },
  {
    titulo: 'Seco y Congelados',
    pasos: [
      'Seco reúne Comida, Aseo, Hogar y Chocolates. Congelados tiene su propio calendario y sus propias tiendas.',
      'Cada encargado de Odoo aparece con sus operaciones y su estado. Un encargado que hizo dos secciones aparece como Mixto.',
      'Si Odoo tiene operaciones sin responsable, se avisa arriba en rojo: no generan etiqueta hasta que se asigne un picker en Odoo y se actualice.',
      '«Encargado manual» crea un encargado que no viene de Odoo, por ejemplo cuando alguien ayudó sin quedar registrado.',
      '«Actualizar» vuelve a leer Odoo para las tiendas elegidas.',
    ],
  },
  {
    titulo: 'Contar y etiquetar',
    pasos: [
      'Escribe el nombre real del picker: va impreso en la etiqueta. Si lo dejas vacío se usa el nombre de Odoo.',
      'Con − y + cuentas pallets, bultos y cajas. Cada unidad sale con su propio número.',
      'Las unidades que no corresponden a una sección no se ofrecen (por ejemplo, Aseo y Hogar no llevan chocolate).',
      'Las cajas de chocolate y congelado se pesan juntas: anota el peso total y se reparte entre las cajas.',
      '«Imprimir» saca las etiquetas de ese encargado. El botón azul de arriba imprime las etiquetas de todas las tiendas elegidas.',
    ],
  },
  {
    titulo: 'Reimprimir sin duplicar pallets',
    pasos: [
      'Una reimpresión sale marcada como COPIA y lleva el mismo número que la original.',
      'Úsala solo si la etiqueta se dañó o se perdió. Si es otro pallet, cuenta uno más con +: sale con su propio número.',
      'Pegar una copia en otro pallet deja dos pallets con el mismo número y Bodega lo detecta al escanear.',
    ],
  },
  {
    titulo: 'Sin señal',
    pasos: [
      'Arriba a la derecha ves el estado: «En línea · todo guardado» significa que no queda nada por enviar.',
      'Sin conexión puedes seguir contando e imprimiendo: todo queda guardado en este equipo y se envía solo al volver la señal.',
      'No borres los datos del navegador mientras haya pendientes.',
    ],
  },
  {
    titulo: 'Seguimiento',
    pasos: [
      'Actividad: lo que pasó en el día (impresiones, unidades creadas y eliminadas, errores), filtrable por cuenta, tienda y picker.',
      'Historial: las etiquetas impresas hoy por cada encargado y los cambios de nombre.',
      'Estadísticas: rendimiento por picker con datos de Odoo.',
    ],
  },
  {
    titulo: 'Ajustes',
    pasos: [
      'Calendario: el calendario de despacho de solo lectura, Central o Congelados.',
      'Configuración: qué datos lleva la etiqueta, los nombres reales de cada picker de Odoo y cuántas etiquetas se ven por fila.',
    ],
  },
];

export interface Atajo { teclas: string[]; que: string }

export const ATAJOS: Atajo[] = [
  { teclas: ['/'], que: 'Buscar tienda' },
  ...PESTANAS.map((p, i) => ({ teclas: [String(i + 1)], que: `Ir a ${p.label}` })),
  { teclas: ['?'], que: 'Abrir esta ayuda' },
  { teclas: ['Esc'], que: 'Cerrar la ayuda o los filtros' },
];

export type AccionTecla =
  | { tipo: 'buscar' }
  | { tipo: 'pestana'; key: PestanaPicking }
  | { tipo: 'ayuda' }
  | null;

interface Tecla { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }

/**
 * Qué hace una tecla. Nada mientras se escribe en un campo (escribir «1» en el nombre del picker no
 * puede cambiar de pestaña) ni con Ctrl, Cmd o Alt, que son del navegador.
 */
export function accionDeTecla(e: Tecla, escribiendo: boolean): AccionTecla {
  if (escribiendo || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === '/') return { tipo: 'buscar' };
  if (e.key === '?') return { tipo: 'ayuda' };
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= PESTANAS.length) return { tipo: 'pestana', key: PESTANAS[n - 1].key };
  return null;
}

/** ¿El foco está en algo donde se escribe? */
export function estaEscribiendo(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const t = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(t);
  }
  return (el as HTMLElement).isContentEditable === true;
}
