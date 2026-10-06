import { describe, it, expect } from 'vitest';
import { avisoSiEsDeOtraBodega } from '../vetoEscaneo';
import { esDeOtroEspejo, espejoDeTienda, avisoDeOtroEspejo, type EspejoBodega } from '../duenoDeTienda';

// ── LAS SIETE TIENDAS DEL 05/10/2026 ──────────────────────────────────────────────────────────
//
// Medido en `actividad_bodega`: desde la pestaña RM/Costa se trabajaron 51SER, 42ANP, 57CAS, 47PTV,
// 39PSB, 53VAL y 41ANA —todas de Nacional— entre las 11:14 y las 13:50, con la PISTOLA. El #654
// había puesto el control solo en el buscador que se teclea; este camino no tenía ninguno.

/** El catálogo ya hidratado: las 17 curadas más 60PBL, que viene de Config. Tiendas. */
const DE_REGIONES = new Set([
  '51SER', '42ANP', '57CAS', '47PTV', '39PSB', '53VAL', '41ANA', '36CHL', '28TEM', '60PBL',
]);
const esDeRegiones = (cod: string) => DE_REGIONES.has(cod);

/** Lo que arma cada pantalla: el traductor de clave y la pregunta de pertenencia. */
function comoLaPantalla(espejo: EspejoBodega, codDeClave: (c: string) => string | undefined) {
  return (clave: string) => avisoSiEsDeOtraBodega(clave, codDeClave, cod => (
    esDeOtroEspejo(cod, espejo, esDeRegiones)
      ? avisoDeOtroEspejo(cod, espejoDeTienda(cod, esDeRegiones))
      : null
  ));
}

// RM/Costa indexa por código: la clave ya ES el código.
const enRmCosta  = comoLaPantalla('rmcosta', c => c);
// Nacional indexa por NOMBRE: hay que traducir.
const NOMBRES: Record<string, string> = { 'Los Pablos': '60PBL', 'Puerto Varas': '47PTV' };
const enNacional = comoLaPantalla('nacional', c => NOMBRES[c]);

describe('la pistola de RM/Costa no abre tiendas de Nacional', () => {
  it('EL CASO del 05/10: las siete quedan bloqueadas, con el aviso que dice dónde', () => {
    for (const cod of ['51SER', '42ANP', '57CAS', '47PTV', '39PSB', '53VAL', '41ANA']) {
      expect(enRmCosta(cod)).toBe(`${cod} se pesa en Nacional · ábrela en esa pestaña`);
    }
  });

  it('EL CASO del 06/10: 60PBL, que no está en el catálogo curado sino en Config', () => {
    // Es la tienda por la que `isRegionesCod` tiene que estar hidratado: sin eso no se bloquea.
    expect(enRmCosta('60PBL')).toBe('60PBL se pesa en Nacional · ábrela en esa pestaña');
  });

  it('una tienda de RM/Costa pasa sin ruido: esto no estorba lo que ya funcionaba', () => {
    for (const cod of ['01TPS', '16PQA', '55ITA', '26ALC', '08RNC']) {
      expect(enRmCosta(cod)).toBeNull();
    }
  });
});

describe('el control es simétrico', () => {
  it('Nacional tampoco abre una de RM/Costa', () => {
    expect(comoLaPantalla('nacional', c => c)('01TPS'))
      .toBe('01TPS se pesa en RM / Costa · ábrela en esa pestaña');
  });

  it('Nacional traduce su clave por NOMBRE y deja pasar lo suyo', () => {
    expect(enNacional('Los Pablos')).toBeNull();
    expect(enNacional('Puerto Varas')).toBeNull();
  });
});

describe('cuando no se puede decidir, NO se bloquea', () => {
  it('una clave que el traductor no conoce pasa: nadie queda con el pallet en la mano y sin salida', () => {
    // El hook igual se va a frenar después, en `irA`, con su propio mensaje. Lo que no puede
    // hacer esto es inventar una pertenencia que no sabe.
    expect(enNacional('Tienda Que No Existe')).toBeNull();
  });

  it('sin la pregunta de pertenencia no bloquea nada', () => {
    // Es opcional a propósito: una pantalla que todavía no la declare no se rompe.
    expect(avisoSiEsDeOtraBodega('60PBL', c => c)).toBeNull();
  });

  it('un código vacío no bloquea', () => {
    expect(enRmCosta('')).toBeNull();
  });
});
