import { describe, it, expect } from 'vitest';
import { parseCalendarioAuth } from '../sheets';

// La hoja CALENDARIO tal como la lee el Enrutador al tocar "Refrescar datos".
// Col 0 = GRUPO, col 1 = TIPO, cols 2..7 = LU..SA.
const hoja = (tiendasLunes: string) => [
  ['GRUPO', 'TIPO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'],
  ['X', '', tiendasLunes, '', '', '', '', ''],
];

// Catálogo real (recortado): `region` es la fuente canónica del grupo.
const CATALOGO = {
  '57CAS': { sector: 'Región', z: 'Región', region: 'Los Lagos' },
  '60PBL': { sector: 'Región Sur', z: 'Región', region: 'Araucanía' },
  '28TEM': { sector: 'Región', z: 'Región', region: 'Araucanía' },
  '37VIÑ': { sector: 'Costa', z: 'Costa', region: 'Valparaíso' },
  '26ALC': { sector: 'Las Condes', z: 'Corredor Oriente', region: 'RM' },
};

describe('parseCalendarioAuth — el grupo sale del catálogo', () => {
  // El bug: FAL_CODES tenía 16 códigos y la BD tiene 18 tiendas de Regiones. A las dos que
  // faltaban el `else` las mandaba a RM → se registraban en despacho_rm en vez de
  // despacho_regiones, y se ordenaban entre las tiendas de Santiago en el pool.
  it('57CAS (Castro) va a Regiones, no a RM', () => {
    const cal = parseCalendarioAuth(hoja('57CAS'), CATALOGO)!;
    expect(cal.LU.fal).toContain('57CAS');
    expect(cal.LU.rm).not.toContain('57CAS');
  });

  it('60PBL (Los Pablos) va a Regiones, no a RM', () => {
    const cal = parseCalendarioAuth(hoja('60PBL'), CATALOGO)!;
    expect(cal.LU.fal).toContain('60PBL');
    expect(cal.LU.rm).not.toContain('60PBL');
  });

  it('sin catálogo, 57CAS y 60PBL caían en RM (el comportamiento viejo)', () => {
    const cal = parseCalendarioAuth(hoja('57CAS 60PBL'))!;
    expect(cal.LU.rm).toEqual(['57CAS', '60PBL']);
    expect(cal.LU.fal).toEqual([]);
  });

  it('las que sí estaban en las listas siguen igual', () => {
    const cal = parseCalendarioAuth(hoja('28TEM 37VIÑ 26ALC'), CATALOGO)!;
    expect(cal.LU.fal).toContain('28TEM');
    expect(cal.LU.costa).toContain('37VIÑ');
    expect(cal.LU.rm).toContain('26ALC');
  });

  it('un código fuera del catálogo cae al respaldo, no revienta', () => {
    const cal = parseCalendarioAuth(hoja('46TRE 99XXX'), CATALOGO)!;
    expect(cal.LU.fal).toContain('46TRE');   // respaldo FAL_CODES
    expect(cal.LU.rm).toContain('99XXX');    // desconocido → RM, como antes
  });
});
