// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { blindarDom } from '../blindajeDom';

// Lo que hace el traductor de Chrome: saca el nodo de texto original y pone el suyo envuelto en <font>.
function traducir(padre: Element): Text {
  const original = padre.firstChild as Text;
  const font = document.createElement('font');
  font.textContent = 'traducido';
  padre.replaceChild(font, original);
  return original;
}

describe('blindarDom', () => {
  it('sin blindaje, quitar un nodo que el traductor reemplazó revienta (el error del 02/10)', () => {
    const div = document.createElement('div');
    div.textContent = 'Selecciona una tienda';
    const original = traducir(div);
    expect(() => Node.prototype.removeChild.call(div, original)).toThrow();
  });

  it('con blindaje, removeChild de un nodo ajeno no lanza y deja el padre como estaba', () => {
    const proto = { removeChild: Node.prototype.removeChild, insertBefore: Node.prototype.insertBefore } as never;
    blindarDom(proto);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const div = document.createElement('div');
    div.textContent = 'Selecciona una tienda';
    const original = traducir(div);
    expect((proto as Node).removeChild.call(div, original)).toBe(original);
    expect(div.textContent).toBe('traducido');
    warn.mockRestore();
  });

  it('con blindaje, removeChild e insertBefore normales siguen funcionando', () => {
    const proto = { removeChild: Node.prototype.removeChild, insertBefore: Node.prototype.insertBefore } as never;
    blindarDom(proto);
    const div = document.createElement('div');
    const a = document.createElement('a');
    const b = document.createElement('b');
    div.appendChild(a);
    (proto as Node).insertBefore.call(div, b, a);
    expect([...div.childNodes]).toEqual([b, a]);
    (proto as Node).removeChild.call(div, a);
    expect([...div.childNodes]).toEqual([b]);
  });

  it('con blindaje, insertBefore con una referencia que ya no es hija no lanza', () => {
    const proto = { removeChild: Node.prototype.removeChild, insertBefore: Node.prototype.insertBefore } as never;
    blindarDom(proto);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const div = document.createElement('div');
    div.textContent = 'x';
    const original = traducir(div);
    const nuevo = document.createElement('span');
    expect(() => (proto as Node).insertBefore.call(div, nuevo, original)).not.toThrow();
    warn.mockRestore();
  });

  it('es idempotente: instalarlo dos veces no envuelve dos veces', () => {
    const proto = { removeChild: Node.prototype.removeChild, insertBefore: Node.prototype.insertBefore } as never as { removeChild: unknown };
    blindarDom(proto as never);
    const primera = proto.removeChild;
    blindarDom(proto as never);
    expect(proto.removeChild).toBe(primera);
  });
});
