import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../escapeHtml';

// Bug: exportHistorial/exportStats interpolaban nombres de picker/tienda (editables por el
// supervisor) directo en document.write sin escapar -- un nombre con '<'/'>' corrompía o
// inyectaba markup en la ventana de exportación.
describe('escapeHtml', () => {
  it('escapa los 5 caracteres especiales de HTML', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(escapeHtml(`O'Brien & <Bodega>`)).toBe('O&#39;Brien &amp; &lt;Bodega&gt;');
  });

  it('texto normal pasa sin cambios', () => {
    expect(escapeHtml('Juan Pérez')).toBe('Juan Pérez');
    expect(escapeHtml('17MAI')).toBe('17MAI');
  });

  it('null/undefined → string vacío', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('números se convierten a string sin tocar', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
