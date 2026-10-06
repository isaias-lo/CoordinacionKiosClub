import { describe, it, expect } from 'vitest';
import { clasificadorDeTiendas } from '../catalogoServidor';

// ── LAS 27 FILAS QUE SE PERDÍAN ────────────────────────────────────────────────────────────────
//
// Medido el 02/10/2026 contra la hoja DESPACHO CONGELADOS y la base: 26ALC (4 filas), 56PZA (6),
// 59EGN (8) y 60PBL (9) estaban en la hoja y NO en la base. Las de 01TPS y 16PQA sí llegaron.
//
// La diferencia: las dos que llegaron están en el catálogo ESTÁTICO de Santiago; las cuatro que se
// perdieron se crearon desde Config, y los catálogos del navegador no se hidratan en el servidor.

/** El respaldo que había antes: 54 tiendas entre los dos catálogos del navegador. */
const soloEstaticos = {
  esNacional: (cod: string) => ['47PTV', '36CHL', '28TEM'].includes(cod),
  esSantiago: (cod: string) => ['01TPS', '16PQA', '55ITA'].includes(cod),
};

const fila = (codigo: string, sector: string, activo = true) =>
  ({ codigo, sector_comuna: sector, activo });

describe('clasificadorDeTiendas — el catálogo sale de la base', () => {
  it('EL CASO: las cuatro que se perdían ahora se clasifican', () => {
    const c = clasificadorDeTiendas([
      fila('26ALC', 'Corredor Oriente'),
      fila('56PZA', 'Corredor Norte'),
      fila('59EGN', 'Corredor Oriente'),
      fila('60PBL', 'Región Sur'),
    ], soloEstaticos);

    // Ninguna estaba en los estáticos, así que antes las cuatro caían en `huerfanos`.
    expect(c.esSantiago('26ALC')).toBe(true);
    expect(c.esSantiago('56PZA')).toBe(true);
    expect(c.esSantiago('59EGN')).toBe(true);
    expect(c.esNacional('60PBL')).toBe(true);   // Región Sur → Nacional
  });

  it('una tienda de región va a Nacional y NO a RM/Costa', () => {
    const c = clasificadorDeTiendas([fila('60PBL', 'Región Sur')], soloEstaticos);
    expect(c.esNacional('60PBL')).toBe(true);
    expect(c.esSantiago('60PBL')).toBe(false);
  });

  it('una de Santiago va a RM/Costa y NO a Nacional', () => {
    const c = clasificadorDeTiendas([fila('26ALC', 'Corredor Oriente')], soloEstaticos);
    expect(c.esSantiago('26ALC')).toBe(true);
    expect(c.esNacional('26ALC')).toBe(false);
  });

  it('Costa es de RM/Costa, no de región', () => {
    const c = clasificadorDeTiendas([fila('08RNC', 'Costa')], soloEstaticos);
    expect(c.esSantiago('08RNC')).toBe(true);
    expect(c.esNacional('08RNC')).toBe(false);
  });

  it('LA BASE MANDA sobre el estático: si dice que no es de región, no lo es', () => {
    // 47PTV está en el respaldo como nacional. Si la base la moviera a un corredor de Santiago,
    // tiene que ganar la base — es la que Config escribe.
    const c = clasificadorDeTiendas([fila('47PTV', 'Corredor Sur')], soloEstaticos);
    expect(c.esNacional('47PTV')).toBe(false);
    expect(c.esSantiago('47PTV')).toBe(true);
  });

  it('una INACTIVA sigue clasificando: sus filas históricas tienen que poder sincronizarse', () => {
    const c = clasificadorDeTiendas([fila('99OLD', 'Región', false)], soloEstaticos);
    expect(c.esNacional('99OLD')).toBe(true);
  });

  it('normaliza el código: la hoja se escribe a mano', () => {
    const c = clasificadorDeTiendas([fila('60PBL', 'Región Sur')], soloEstaticos);
    expect(c.esNacional('  60pbl ')).toBe(true);
  });
});

describe('clasificadorDeTiendas — el respaldo', () => {
  it('con la base caída se reparte con los estáticos, no se descarta todo', () => {
    for (const vacio of [[], null, undefined]) {
      const c = clasificadorDeTiendas(vacio, soloEstaticos);
      expect(c.conocidas).toBe(0);
      expect(c.esNacional('47PTV')).toBe(true);    // lo que ya funcionaba sigue funcionando
      expect(c.esSantiago('01TPS')).toBe(true);
    }
  });

  it('un código que no está en NINGUNA parte sigue siendo huérfano', () => {
    // Es el único huérfano legítimo: no existe en la tabla `tiendas`. Hay que crearlo en Config,
    // no tocar el servidor.
    const c = clasificadorDeTiendas([fila('26ALC', 'Corredor Oriente')], soloEstaticos);
    expect(c.esNacional('99XXX')).toBe(false);
    expect(c.esSantiago('99XXX')).toBe(false);
  });

  it('filas basura del catálogo no rompen ni cuentan', () => {
    const c = clasificadorDeTiendas(
      [{ codigo: '', sector_comuna: 'Región' }, { codigo: '  ' }, {}, fila('60PBL', 'Región Sur')],
      soloEstaticos,
    );
    expect(c.conocidas).toBe(1);
    expect(c.esNacional('60PBL')).toBe(true);
  });

  it('cuenta las tiendas que conoce, para poder avisar si la consulta falló', () => {
    const c = clasificadorDeTiendas(
      [fila('26ALC', 'Corredor Oriente'), fila('60PBL', 'Región Sur')], soloEstaticos);
    expect(c.conocidas).toBe(2);
  });
});
