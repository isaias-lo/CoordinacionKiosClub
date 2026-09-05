// ¿Esta tienda se despacha por Sendu?
//
// La Fase 4 preguntaba GEOGRAFÍA —"¿es de Regiones?"— cuando la pregunta real es de TRANSPORTE.
// Sendu es el sistema de Falabella: una tienda necesita esos datos si la lleva Falabella, no si
// queda lejos. Desde que Luis Fica tomó el sur completo (31/08/2026), las 14 tiendas del sur
// dejaron de ir por Sendu y el aviso las marcaba igual — pidiendo datos que ya nadie usa.
//
// La respuesta ya está configurada: `zonas_transporte` dice quién lleva cada zona, y se edita en
// Config → Transportistas. Derivarlo de ahí significa que el día que Luis tome también el norte,
// el requisito se apaga solo, sin tocar una sola ficha de tienda.
//
// Puro y testeable: la configuración se INYECTA ya cargada; acá no hay red.

import { zonaDeSectorOGeo, type ZonaRuteo } from '@/lib/sectores';
import { empresaCanonica } from '@/features/despacho/rutas/utils/empresaFlota';
import { ZONAS_DEFAULT, type ConfigZonas } from '@/features/despacho/rutas/utils/zonasTransporte';

/**
 * Transportistas que despachan por Sendu. Hoy es solo Falabella — Sendu es su sistema.
 *
 * Vive acá y no en la configuración de zonas porque no es una decisión que se tome por zona:
 * es qué sistema usa cada transportista. Si mañana otro empieza a usarlo, se agrega acá.
 */
export const EMPRESAS_SENDU = ['Falabella'];

/** Nombre de zona como lo lee una persona. */
const NOMBRE_ZONA: Record<ZonaRuteo, string> = {
  norte:    'Región Norte',
  sur:      'Región Sur',
  costa:    'Costa',
  santiago: 'Santiago',
};

/**
 * ¿Este transportista despacha por Sendu?
 *
 * Compara por empresa canónica, así "falabella", "Falabella" y " FALABELLA " son la misma. Un
 * nombre que no esté en la tabla de `empresaFlota` se compara tal cual, sin adivinar variantes.
 */
export function empresaUsaSendu(empresa: string | null | undefined): boolean {
  const e = empresaCanonica(empresa);
  return EMPRESAS_SENDU.some(x => empresaCanonica(x) === e);
}

export interface DespachoSendu {
  /** `true` si hay que pedirle los datos de envío de Sendu. */
  aplica: boolean;
  zona: ZonaRuteo | null;
  /** Quién lleva esa zona hoy, para poder decirlo en pantalla. */
  empresas: string[];
  /** Por qué, en una frase que se puede mostrar tal cual. */
  motivo: string;
}

/**
 * Si la tienda va por Sendu, y por qué.
 *
 * La zona sale de `zonaDeSectorOGeo`: el sector si está explícito ("Región Sur"), y si dice
 * "Región" a secas —las 17 fichas viejas— la latitud desempata. Sin zona no se afirma nada:
 * un aviso que se dispara por no saber entrena a ignorarlo.
 */
export function despachoPorSendu(
  t: { sector_comuna?: string | null; lat?: number | null } | null | undefined,
  zonas: ConfigZonas = ZONAS_DEFAULT,
): DespachoSendu {
  const zona = zonaDeSectorOGeo(t?.sector_comuna, t?.lat);
  if (!zona) {
    return { aplica: false, zona: null, empresas: [], motivo: 'Sin zona definida: no se puede saber si va por Sendu.' };
  }

  const empresas = zonas?.[zona]?.empresas ?? [];
  const conSendu = empresas.filter(empresaUsaSendu);
  const nombre   = NOMBRE_ZONA[zona];

  if (conSendu.length) {
    return {
      aplica: true, zona, empresas,
      motivo: `${nombre} la lleva ${conSendu.join(' y ')}: se despacha por Sendu.`,
    };
  }

  return {
    aplica: false, zona, empresas,
    motivo: empresas.length
      ? `${nombre} la lleva ${empresas.join(' y ')}, no Falabella: no se despacha por Sendu.`
      : `${nombre} no tiene transportista asignado: no se despacha por Sendu.`,
  };
}
