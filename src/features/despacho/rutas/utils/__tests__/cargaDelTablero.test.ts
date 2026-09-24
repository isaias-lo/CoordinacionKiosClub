import { describe, it, expect } from 'vitest';
import { refrescarCargaTablero } from '../cargaDelTablero';

const t = (c: string, p = 0, b = 0, ch = 0) => ({ c, p, b, ch });
/** `despacho_sesion` ya habló de estas tiendas en este equipo. */
const reportadas = (...cods: string[]) => (cod: string) => cods.includes(cod);
const nadaReportado = () => false;

describe('refrescarCargaTablero — el cero que no se sabe no se escribe', () => {
  it('el calendario recién cargado NO pone en 0P una tienda que el tablero ya traía con carga', () => {
    // El caso reportado: `calT` viene del calendario (sin cantidades) y los conteos llegan 1,5 s
    // después. En esa ventana el tablero pisaba 3P con 0P — y alcanzaba a empujarlo (debounce 800 ms).
    const tablero = { AAAA11: [t('26ALC', 3, 1)] };
    const calT    = { '26ALC': { p: 0, b: 0, ch: 0 } };

    expect(refrescarCargaTablero(tablero, calT, nadaReportado)).toBe(tablero);
  });

  it('pero si Bodega SÍ dijo que quedó en cero, se aplica', () => {
    // Alguien borró toda la carga de la tienda: el cero es un dato, no ignorancia.
    const tablero = { AAAA11: [t('26ALC', 3, 1)] };
    const calT    = { '26ALC': { p: 0, b: 0, ch: 0 } };

    const out = refrescarCargaTablero(tablero, calT, reportadas('26ALC'));
    expect(out.AAAA11[0]).toEqual(t('26ALC', 0, 0, 0));
  });

  it('un conteo nuevo distinto de cero se aplica siempre, haya reportado o no', () => {
    const tablero = { AAAA11: [t('26ALC', 3, 1)] };
    const calT    = { '26ALC': { p: 5, b: 1, ch: 2 } };

    const out = refrescarCargaTablero(tablero, calT, nadaReportado);
    expect(out.AAAA11[0]).toEqual(t('26ALC', 5, 1, 2));
  });

  it('bajar de 5 a 2 no es "cero sin saber": se aplica', () => {
    const tablero = { AAAA11: [t('26ALC', 5)] };
    const out = refrescarCargaTablero(tablero, { '26ALC': { p: 2, b: 0, ch: 0 } }, nadaReportado);
    expect(out.AAAA11[0].p).toBe(2);
  });

  it('una tienda que no está en calT se deja como está', () => {
    const tablero = { AAAA11: [t('26ALC', 3)] };
    expect(refrescarCargaTablero(tablero, {}, nadaReportado)).toBe(tablero);
  });

  it('los chocolates entran en la comparación, igual que p y b', () => {
    const tablero = { AAAA11: [t('26ALC', 1, 0, 0)] };
    const out = refrescarCargaTablero(tablero, { '26ALC': { p: 1, b: 0, ch: 4 } }, nadaReportado);
    expect(out.AAAA11[0].ch).toBe(4);
  });

  it('sin cambios devuelve el MISMO objeto (no dispara render ni push)', () => {
    const tablero = { AAAA11: [t('26ALC', 3, 1, 2)] };
    expect(refrescarCargaTablero(tablero, { '26ALC': { p: 3, b: 1, ch: 2 } }, reportadas('26ALC'))).toBe(tablero);
  });

  it('toca varios camiones a la vez y respeta a cada tienda por separado', () => {
    const tablero = { AAAA11: [t('26ALC', 3), t('40LIL', 2)], BBBB22: [t('57CAS', 1)] };
    const calT = {
      '26ALC': { p: 0, b: 0, ch: 0 },   // sin reportar → se queda en 3
      '40LIL': { p: 0, b: 0, ch: 0 },   // reportada    → pasa a 0
      '57CAS': { p: 4, b: 0, ch: 0 },   // dato nuevo   → pasa a 4
    };
    const out = refrescarCargaTablero(tablero, calT, reportadas('40LIL'));
    expect(out.AAAA11[0].p).toBe(3);
    expect(out.AAAA11[1].p).toBe(0);
    expect(out.BBBB22[0].p).toBe(4);
  });

  it('un camión vacío sigue existiendo', () => {
    const out = refrescarCargaTablero({ AAAA11: [] }, {}, nadaReportado);
    expect(out.AAAA11).toEqual([]);
  });
});
