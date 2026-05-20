-- Agrega soporte para el tipo Contenedor (C) en todo el sistema

-- picking_prints: registra si la etiqueta es Pallet (P) o Contenedor (C)
ALTER TABLE picking_prints
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'P';

-- despacho_sesion: agrega conteo de contenedores por tienda/día
ALTER TABLE despacho_sesion
  ADD COLUMN IF NOT EXISTS contenedores INTEGER NOT NULL DEFAULT 0;

-- recepcion: agrega contenedores enviados y recibidos
ALTER TABLE recepcion
  ADD COLUMN IF NOT EXISTS contenedores_sent INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contenedores_recibidos INT DEFAULT 0;

-- dispatch_history: agrega total de contenedores por despacho
ALTER TABLE dispatch_history
  ADD COLUMN IF NOT EXISTS total_contenedores INT NOT NULL DEFAULT 0;
