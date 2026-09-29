import { describe, it, expect } from 'vitest';
import { estadoDeCarga, acomodarSegunRuta, moverEnLista, textoEstadoCarga } from '../ordenCarga';

// La ruta es el orden de ENTREGA: primero 04PDG, después 09LEO, último 18FLO.
const RUTA = ['04PDG', '09LEO', '18FLO'];

describe('estadoDeCarga — la carga se estiba al revés de la entrega', () => {
  it('bien cargado = la ruta INVERTIDA: lo último que se entrega va al fondo', () => {
    // La primera parada (04PDG) tiene que quedar en la COLA, contra la puerta.
    expect(estadoDeCarga(['18FLO', '09LEO', '04PDG'], RUTA))
      .toEqual({ estado: 'en-orden', desde: -1 });
  });

  it('cargado en el mismo orden que la ruta SE CONTRADICE', () => {
    // Es el error clásico: cargar en orden de entrega deja la primera parada al fondo y hay que
    // vaciar el camión en la calle.
    const d = estadoDeCarga(['04PDG', '09LEO', '18FLO'], RUTA);
    expect(d.estado).toBe('contradice');
    expect(d.desde).toBe(0);
  });

  it('marca la PRIMERA fila que rompe el orden, no la última', () => {
    const d = estadoDeCarga(['18FLO', '04PDG', '09LEO'], RUTA);
    expect(d.estado).toBe('contradice');
    expect(d.desde).toBe(1);   // 04PDG, donde se despega de lo esperado
  });
});

describe('estadoDeCarga — cuándo NO se puede afirmar nada', () => {
  it('sin ruta calculada no inventa un diagnóstico', () => {
    // Es el caso normal mientras se asigna: la ruta se calcula al apretar Calcular o al cerrar.
    for (const r of [undefined, null, [], ['04PDG']]) {
      expect(estadoDeCarga(['18FLO', '09LEO'], r)).toEqual({ estado: 'sin-ruta', desde: -1 });
    }
  });

  it('con una sola tienda no hay orden que juzgar', () => {
    expect(estadoDeCarga(['04PDG'], RUTA)).toEqual({ estado: 'sin-ruta', desde: -1 });
  });

  it('una tienda recién asignada que la ruta NO conoce no genera un aviso falso', () => {
    // La ruta es de un cálculo anterior. 99NEW no estaba; el resto sigue bien cargado.
    expect(estadoDeCarga(['99NEW', '18FLO', '09LEO', '04PDG'], RUTA).estado).toBe('en-orden');
  });

  it('si la ruta conoce tiendas que ya no están cargadas, se ignoran', () => {
    expect(estadoDeCarga(['18FLO', '04PDG'], RUTA).estado).toBe('en-orden');
  });
});

describe('acomodarSegunRuta — el botón Acomodar', () => {
  it('deja la carga al revés de la ruta', () => {
    expect(acomodarSegunRuta(['04PDG', '09LEO', '18FLO'], RUTA))
      .toEqual(['18FLO', '09LEO', '04PDG']);
  });

  it('conserva al final lo que la ruta no conoce, en vez de perderlo', () => {
    // Descartarlas sería perder carga asignada por culpa de una ruta vieja.
    expect(acomodarSegunRuta(['99NEW', '04PDG', '18FLO'], RUTA))
      .toEqual(['18FLO', '04PDG', '99NEW']);
  });

  it('sin ruta devuelve la carga tal cual', () => {
    expect(acomodarSegunRuta(['A', 'B'], null)).toEqual(['A', 'B']);
  });

  it('acomodar dos veces da lo mismo', () => {
    const una = acomodarSegunRuta(['04PDG', '09LEO', '18FLO'], RUTA);
    expect(acomodarSegunRuta(una, RUTA)).toEqual(una);
  });

  it('lo acomodado queda en orden', () => {
    expect(estadoDeCarga(acomodarSegunRuta(['04PDG', '09LEO', '18FLO'], RUTA), RUTA).estado)
      .toBe('en-orden');
  });
});

describe('moverEnLista', () => {
  it('mueve hacia abajo y hacia arriba', () => {
    expect(moverEnLista(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moverEnLista(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('no muta la lista original', () => {
    const l = ['a', 'b', 'c'];
    moverEnLista(l, 0, 2);
    expect(l).toEqual(['a', 'b', 'c']);
  });

  it('un índice fuera de rango devuelve la lista intacta en vez de romperla', () => {
    // Un arrastre que suelta fuera de la lista no puede dejar el camión sin una tienda.
    expect(moverEnLista(['a', 'b'], 0, 9)).toEqual(['a', 'b']);
    expect(moverEnLista(['a', 'b'], -1, 1)).toEqual(['a', 'b']);
  });

  it('soltar donde ya estaba no cambia nada', () => {
    expect(moverEnLista(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('textoEstadoCarga', () => {
  it('dice lo que pasa en cada caso', () => {
    expect(textoEstadoCarga('en-orden')).toBe('Cargado en orden de ruta');
    expect(textoEstadoCarga('contradice')).toBe('La carga contradice la ruta');
    expect(textoEstadoCarga('sin-ruta')).toBe('Sin ruta calculada');
  });
});
