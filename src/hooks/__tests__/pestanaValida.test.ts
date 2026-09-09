import { describe, it, expect } from 'vitest';
import { pestanaValida } from '../usePestanaRecordada';

const TABS = ['drag', 'cong', 'plan'] as const;

describe('pestanaValida', () => {
  it('devuelve la guardada si sigue siendo válida', () => {
    expect(pestanaValida('plan', TABS, 'drag')).toBe('plan');
  });

  // Una pestaña que se renombró o se eliminó dejaría la pantalla en blanco, y encima
  // sobreviviría a recargar: el valor viejo se ignora.
  it('una pestaña que ya no existe cae al valor por defecto', () => {
    expect(pestanaValida('mapa', TABS, 'drag')).toBe('drag');
  });

  it('sin nada guardado usa el valor por defecto', () => {
    expect(pestanaValida(null, TABS, 'drag')).toBe('drag');
    expect(pestanaValida(undefined, TABS, 'drag')).toBe('drag');
    expect(pestanaValida('', TABS, 'drag')).toBe('drag');
  });

  it('no acepta parecidos: la comparación es exacta', () => {
    expect(pestanaValida('PLAN', TABS, 'drag')).toBe('drag');
    expect(pestanaValida(' plan', TABS, 'drag')).toBe('drag');
  });
});
