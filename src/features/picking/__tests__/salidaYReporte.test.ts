import { describe, it, expect } from 'vitest';
import { clavesABorrar, armarReporte, TEXTO_MAX } from '../marco/salidaYReporte';

describe('clavesABorrar', () => {
  it('borra el estado de navegación de Picking: tiendas elegidas, pestaña, filtros, avisos cerrados', () => {
    expect(clavesABorrar(['picking_session_v2', 'picking_tab', 'picking_section_filter', 'pk-franja:2026-10-14:aseo']))
      .toEqual(['picking_session_v2', 'picking_tab', 'picking_section_filter', 'pk-franja:2026-10-14:aseo']);
  });

  it('conserva la configuración de la etiqueta, la cola vieja, los nombres y el acomodo de pantalla', () => {
    expect(clavesABorrar([
      'picking_label_config_v1', 'picking_offline_queue_v1', 'picking_saved_picker_names',
      'picking_cols_per_row', 'picking_left_panel_width',
    ])).toEqual([]);
  });

  it('no toca nada que no sea de Picking (sesión de Supabase, otras pantallas)', () => {
    expect(clavesABorrar(['sb-epiwlmegimfftivqzzup-auth-token', 'despacho_estado', 'picking'])).toEqual([]);
  });
});

describe('armarReporte', () => {
  const ctx = { fecha: '2026-10-14', ahora: new Date('2026-10-14T15:04:00Z'), ancho: 390, alto: 844, url: '/picking', version: 'ced74fa', nombre: ' Kamila ' };

  it('un reporte sin texto se rechaza con un mensaje para la persona', () => {
    expect(armarReporte('reporte', '   ', {}, ctx)).toEqual({ error: 'Cuenta en una frase qué pasó.' });
  });

  it('empezar de cero va sin texto: la foto del estado es el dato', () => {
    const r = armarReporte('empezar-de-cero', '', { tiendasElegidas: ['59EGN'], pestana: 'monitoreo' }, ctx);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.estado).toMatchObject({ tiendasElegidas: ['59EGN'], pestana: 'monitoreo', fecha: '2026-10-14', pantalla: '390×844', url: '/picking' });
    expect(r.estado.hora).toBe('2026-10-14T15:04:00.000Z');
    expect(r.nombre).toBe('Kamila');
  });

  it('recorta el texto largo y los espacios', () => {
    const r = armarReporte('reporte', `  ${'a'.repeat(TEXTO_MAX + 50)}  `, {}, { ...ctx, nombre: null });
    if ('error' in r) throw new Error('no debía fallar');
    expect(r.texto).toHaveLength(TEXTO_MAX);
    expect(r.nombre).toBeNull();
  });
});
