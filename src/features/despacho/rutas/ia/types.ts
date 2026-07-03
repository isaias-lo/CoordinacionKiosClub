// Tipos del módulo IA de asignación de camiones. Aislados a propósito para que el "cerebro"
// evolucione sin acoplarse al resto del enrutador. La asignación resultante es compatible con
// `manualAsignaciones` (Record<patente, StoreItem[]>).

export interface IAStore {
  cod: string;
  p: number;      // pallets
  b: number;      // bultos
  ch: number;     // chocolates
  zona?: string;  // corredor/zona (para que la IA agrupe como el coordinador)
}

export interface IATruck {
  patente: string;
  capP: number;         // capacidad pallets
  capB: number;         // capacidad bultos
  refrigerado?: boolean;
  porton?: boolean;
}

/** Ejemplo histórico: cómo el coordinador asignó un día (patente → cods). */
export interface IAExample {
  fecha: string;
  asignacion: Record<string, string[]>;
}

/** Store asignada (shape compatible con StoreItem / manualAsignaciones). */
export interface IAAssignedStore {
  c: string;
  p: number;
  b: number;
  ch: number;
}

export interface IAProposal {
  asignaciones: Record<string, IAAssignedStore[]>; // patente → tiendas
  warnings: string[];
}
