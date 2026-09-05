-- [Fase 4] Los datos de envío de Sendu pasan del código a la base.
--
-- Problema: agregar una tienda de Regiones exige HOY UN DESPLIEGUE. Los campos que el Excel de
-- Sendu necesita —región Sendu, comuna, calle y número por separado, alias de búsqueda— no tienen
-- columna en `tiendas`, así que viven en una lista curada dentro del código (`SENDU_EXTRAS`).
-- Una tienda creada desde Config queda con esos campos vacíos y su export sale con celdas en
-- blanco, que Sendu rechaza. Nadie del equipo puede arreglarlo sin un desarrollador.
--
-- Esto agrega las columnas y migra las 17 tiendas curadas. Después de correrlo, esos datos se
-- editan desde Config → Tiendas como cualquier otro campo.
--
-- Es aditivo y reversible: no toca ninguna columna existente ni ninguna fila fuera de las 17.

ALTER TABLE public.tiendas
  ADD COLUMN IF NOT EXISTS region_sendu text,
  ADD COLUMN IF NOT EXISTS comuna       text,
  ADD COLUMN IF NOT EXISTS calle        text,
  ADD COLUMN IF NOT EXISTS numero       text,
  ADD COLUMN IF NOT EXISTS complemento  text,
  ADD COLUMN IF NOT EXISTS nombre_dest  text,
  ADD COLUMN IF NOT EXISTS str_val      text;

COMMENT ON COLUMN public.tiendas.region_sendu IS 'Región en el formato que espera Sendu (Los_Lagos, Araucanía, …). Distinto de `region`.';
COMMENT ON COLUMN public.tiendas.calle        IS 'Solo la calle. El número va aparte: Sendu los pide separados.';
COMMENT ON COLUMN public.tiendas.str_val      IS 'Alias con el que Sendu busca la dirección; suele ser la comuna.';

-- Migración de las 17 tiendas curadas. `where tiendas.codigo = v.codigo` deja intactas las demás,
-- y se puede volver a correr sin duplicar nada.
UPDATE public.tiendas t SET
  region_sendu = v.region_sendu,
  comuna       = v.comuna,
  calle        = v.calle,
  numero       = v.numero,
  complemento  = nullif(v.complemento, ''),
  nombre_dest  = v.nombre_dest,
  str_val      = v.str_val
FROM (VALUES
  ('39PSB','Coquimbo','La Serena','Av Balmaceda','2885','Local 133 al 136','tienda la serena','La Serena'),
  ('51SER','Coquimbo','La Serena','Av Cuatro Esquinas','1617','Local 117 y 118','tienda la serena 2','La Serena'),
  ('28TEM','Araucanía','Temuco','Av. Alemania','850','Local 3 y 4','tienda temuco','Temuco'),
  ('46TRE','BioBío','Talcahuano','JorgeAlessandriavenida','3177','Local D 106','tienda el trebol','Talcahuano'),
  ('36CHL','Ñuble','Chillán','Av Vicente Mendez','1545','Local 1000','tienda chillan','Chillán'),
  ('75PUC','Araucanía','Pucón','Pedro De Valdivia','333','','tienda pucon','Pucón'),
  ('31TLC','Maule','Talca','2 Norte','3435','Local 6 al 9','tienda talca','Talca'),
  ('24SPP','BioBío','San Pedro de La Paz','Camino El Venado','1380','Local 2','tienda San Pedro (SSP1)','San Pedro de La Paz'),
  ('38SP2','BioBío','San Pedro de La Paz','Los Mañios','4455','Paseo San Pedro','tienda Paseo San Pedro (SP2)','San Pedro de La Paz'),
  ('42ANP','Antofagasta','Antofagasta','Av Pedro Aguirre Cerda','10578','Local 303-303','tienda La Portada','Antofagasta'),
  ('41ANA','Antofagasta','Antofagasta','Av Angamos','745','Local 1032','Tienda Cenco Angamos','Antofagasta'),
  ('27MCH','Libertador_General_Bernardo_OHiggins','Machalí','San Juan','133','','Tienda Machali','Machalí'),
  ('76PAN','Los_Ríos','Panguipulli','Av. Martinez de Rozas','430','','tienda panguipulli','Panguipulli'),
  ('47PTV','Los_Lagos','Puerto Varas','Vicente Perez Rosales','1285','Local 101 y 102','tienda puerto varas','Puerto Varas'),
  ('50PTM','Los_Lagos','Puerto Montt','Illapel Calle','10','Local 111a','tienda puerto montt','Puerto Montt'),
  ('53VAL','Los_Ríos','Valdivia','Errazuriz','1102','Local 1078','tienda valdivia','Valdivia'),
  ('57CAS','Los_Lagos','Castro','Ignacio Serrano','574','','tienda castro','Castro')
) AS v(codigo, region_sendu, comuna, calle, numero, complemento, nombre_dest, str_val)
WHERE t.codigo = v.codigo;

-- Comprobación: deben ser 17 con datos completos, y aparte las que quedan por completar.
select
  count(*) filter (where coalesce(region_sendu,'') <> '' and coalesce(comuna,'') <> ''
                     and coalesce(calle,'') <> '' and coalesce(numero,'') <> '') as completas,
  count(*) filter (where coalesce(region_sendu,'') =  '' or  coalesce(comuna,'') =  ''
                     or  coalesce(calle,'') =  '' or  coalesce(numero,'') =  '') as por_completar
from public.tiendas
where activo is not false and sector_comuna ilike 'regi%';
