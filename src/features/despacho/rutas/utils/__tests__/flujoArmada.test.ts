import { describe, it, expect } from 'vitest';
import { grupoArmada } from '../flujoArmada';

describe('grupoArmada', () => {
  it('fuente regiones → fal, sin mirar el sector', () => {
    expect(grupoArmada('regiones', 'Corredor Norte')).toBe('fal');
    expect(grupoArmada('regiones', null)).toBe('fal');
  });

  // El cambio: antes se preguntaba por REGIÓN contra 'VR'/'V'. Ese es el vocabulario del catálogo
  // de Santiago; acá llega el de rutas, que escribe 'Valparaíso'. La rama era código muerto y las
  // cinco tiendas de Costa caían en 'rm'. No se notaba —'rm' y 'costa' comparten pool y tabla de
  // registro— pero cambiaba bajo qué filtro se veían.
  it('sector Costa → costa', () => {
    expect(grupoArmada('santiago', 'Costa')).toBe('costa');
    expect(grupoArmada('rmcosta', 'Costa')).toBe('costa');
  });

  it('sector de Regiones → fal aunque la fuente no lo diga', () => {
    expect(grupoArmada('santiago', 'Región Sur')).toBe('fal');
    expect(grupoArmada('santiago', 'Región')).toBe('fal');
  });

  it('los corredores de Santiago → rm', () => {
    expect(grupoArmada('santiago', 'Corredor Oriente')).toBe('rm');
    expect(grupoArmada('santiago', 'Corredor Poniente')).toBe('rm');
  });

  it('sin sector → rm (mismo default que antes)', () => {
    expect(grupoArmada(undefined, undefined)).toBe('rm');
    expect(grupoArmada('santiago', null)).toBe('rm');
    expect(grupoArmada('santiago', '')).toBe('rm');
  });

  // La región ya NO decide: es una etiqueta. Este caso es el que permitiría renombrarla
  // (p. ej. al nombre que devuelve Google) sin cambiar a qué bodega va una tienda.
  it('un nombre de región NO se confunde con un sector', () => {
    expect(grupoArmada('santiago', 'Valparaíso')).toBe('rm');
  });
});
