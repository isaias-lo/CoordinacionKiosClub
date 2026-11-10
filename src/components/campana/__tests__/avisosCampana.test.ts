import { describe, it, expect } from 'vitest';
import {
  crearAlmacenCampana, etiquetaCampana, llegoAvisoNuevo, nivelMaximo, ordenarAvisos, textoContador,
} from '../avisosCampana';

const nodo = null;

describe('ordenarAvisos', () => {
  it('pone primero lo más grave y, dentro del mismo nivel, lo que llegó antes', () => {
    const r = ordenarAvisos([
      { id: 'a', nivel: 'info' as const, orden: 0 },
      { id: 'b', nivel: 'aviso' as const, orden: 3 },
      { id: 'c', nivel: 'error' as const, orden: 5 },
      { id: 'd', nivel: 'aviso' as const, orden: 1 },
    ]);
    expect(r.map(x => x.id)).toEqual(['c', 'd', 'b', 'a']);
  });

  it('no cambia la lista que recibe', () => {
    const lista = [{ nivel: 'info' as const, orden: 1 }, { nivel: 'error' as const, orden: 0 }];
    ordenarAvisos(lista);
    expect(lista[0].nivel).toBe('info');
  });
});

describe('nivelMaximo', () => {
  it('es null sin avisos', () => expect(nivelMaximo([])).toBeNull());
  it('toma el más grave', () => {
    expect(nivelMaximo([{ nivel: 'info' }, { nivel: 'aviso' }])).toBe('aviso');
    expect(nivelMaximo([{ nivel: 'aviso' }, { nivel: 'error' }, { nivel: 'info' }])).toBe('error');
  });
});

describe('textos de la campana', () => {
  it('dice cuántos avisos hay', () => {
    expect(etiquetaCampana(0)).toBe('Avisos: no hay ninguno');
    expect(etiquetaCampana(1)).toBe('Avisos: hay 1');
    expect(etiquetaCampana(4)).toBe('Avisos: hay 4');
  });
  it('el contador no pasa de 9+', () => {
    expect(textoContador(3)).toBe('3');
    expect(textoContador(9)).toBe('9');
    expect(textoContador(12)).toBe('9+');
  });
});

describe('llegoAvisoNuevo', () => {
  it('solo cuando aparece un id que no estaba', () => {
    expect(llegoAvisoNuevo([], ['a'])).toBe(true);
    expect(llegoAvisoNuevo(['a', 'b'], ['b'])).toBe(false);
    expect(llegoAvisoNuevo(['a'], ['a'])).toBe(false);
    expect(llegoAvisoNuevo(['a'], ['a', 'c'])).toBe(true);
  });
});

describe('almacén de la campana', () => {
  const despues = () => Promise.resolve();

  it('anota y quita avisos, ordenados por gravedad', async () => {
    const al = crearAlmacenCampana();
    const quitarInfo = al.anotar({ id: 'i', nivel: 'info', titulo: 'I', nodo });
    al.anotar({ id: 'e', nivel: 'error', titulo: 'E', nodo });
    expect(al.leer().avisos.map(a => a.id)).toEqual(['e', 'i']);
    quitarInfo();
    await despues();
    expect(al.leer().avisos.map(a => a.id)).toEqual(['e']);
  });

  it('reanotar el mismo id lo reemplaza sin duplicarlo y conserva su lugar', () => {
    const al = crearAlmacenCampana();
    al.anotar({ id: 'x', nivel: 'aviso', titulo: '1 día', nodo });
    al.anotar({ id: 'y', nivel: 'aviso', titulo: 'otro', nodo });
    al.anotar({ id: 'x', nivel: 'aviso', titulo: '2 días', nodo });
    expect(al.leer().avisos.map(a => [a.id, a.titulo])).toEqual([['x', '2 días'], ['y', 'otro']]);
  });

  it('cambiar el título no cierra el panel ni mueve el aviso', async () => {
    // Así lo hace React: primero limpia el efecto del título viejo y después anota el nuevo.
    const al = crearAlmacenCampana();
    const quitarViejo = al.anotar({ id: 'x', nivel: 'aviso', titulo: '2 días', nodo });
    al.anotar({ id: 'y', nivel: 'aviso', titulo: 'otro', nodo });
    al.abrir(true);
    quitarViejo();
    al.anotar({ id: 'x', nivel: 'aviso', titulo: '1 día', nodo });
    await despues();
    expect(al.leer().avisos.map(a => a.titulo)).toEqual(['1 día', 'otro']);
    expect(al.leer().abierta).toBe(true);
  });

  it('cuenta las campanas montadas y se cierra al quedar sin ninguna', () => {
    const al = crearAlmacenCampana();
    const desmontar = al.montarCampana();
    expect(al.leer().campanas).toBe(1);
    al.abrir(true);
    expect(al.leer().abierta).toBe(true);
    desmontar();
    expect(al.leer()).toMatchObject({ campanas: 0, abierta: false });
  });

  it('se cierra sola cuando se va el último aviso', async () => {
    const al = crearAlmacenCampana();
    const quitar = al.anotar({ id: 'a', nivel: 'info', titulo: 'A', nodo });
    al.abrir(true);
    quitar();
    await despues();
    expect(al.leer().abierta).toBe(false);
  });

  it('avisa a quien está suscrito y deja de avisar al desuscribirse', () => {
    const al = crearAlmacenCampana();
    let veces = 0;
    const des = al.suscribir(() => { veces++; });
    al.anotar({ id: 'a', nivel: 'info', titulo: 'A', nodo });
    des();
    al.anotar({ id: 'b', nivel: 'info', titulo: 'B', nodo });
    expect(veces).toBe(1);
  });
});
