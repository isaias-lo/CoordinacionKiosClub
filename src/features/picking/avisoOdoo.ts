// Qué decir cuando Odoo no está disponible. Puro y testeable.
//
// Existe por M-07: la misma situación se contaba de dos maneras y en rojo de error. En Seco,
// "Odoo desactivado por el administrador."; en Estadísticas, "Odoo no configurado. Configura las
// credenciales para cargar estadísticas.". Ninguna decía qué se pierde exactamente, y el rojo hace
// parecer una falla lo que es una configuración: el sistema está bien, simplemente Odoo está fuera.

export type MotivoOdoo = 'desactivado' | 'sin-credenciales';

export function motivoOdoo(odooDesactivado: boolean): MotivoOdoo {
  return odooDesactivado ? 'desactivado' : 'sin-credenciales';
}

export interface AvisoOdoo {
  titulo: string;
  /** Qué queda deshabilitado acá y quién lo destraba. */
  detalle: string;
}

/**
 * `queSePierde` se escribe en minúscula y en la voz de la pantalla que lo muestra:
 * "no se cargan las operaciones del día", "no se pueden cargar las estadísticas".
 */
export function avisoOdoo(motivo: MotivoOdoo, queSePierde: string): AvisoOdoo {
  return motivo === 'desactivado'
    ? { titulo: 'Odoo está desactivado',
        detalle: `Mientras esté así, ${queSePierde}. Lo vuelve a activar el administrador desde Configuración.` }
    : { titulo: 'Odoo no está configurado',
        detalle: `Faltan las credenciales, así que ${queSePierde}. Las carga el administrador en Configuración.` };
}
