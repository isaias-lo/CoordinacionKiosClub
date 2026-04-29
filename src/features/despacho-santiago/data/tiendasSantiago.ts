import type { TiendaSantiago } from '../types';

export const TIENDAS_SANTIAGO: TiendaSantiago[] = [
  { region:'RM', tienda:'BUENAVENTURA',        cod:'BNV', direccion:'San Ignacio 500, Quilicura',                              comuna:'Quilicura',     tipo:'MALL',        ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','LU','JU'] },
  { region:'RM', tienda:'BUENAVENTURA 2',       cod:'BN2', direccion:'San Ignacio 500, Quilicura',                              comuna:'Quilicura',     tipo:'MALL',        ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','LU','JU'] },
  { region:'RM', tienda:'MAIPU',                cod:'MAI', direccion:'Av. Américo Vespucio 399, Maipú',                         comuna:'Maipú',         tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['SA','MA','JU'] },
  { region:'RM', tienda:'SAN CARLOS DE APOQUINDO', cod:'SCL', direccion:'Av Plaza 1250, Las Condes',                           comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','MA','JU'] },
  { region:'RM', tienda:'LAS CONDES',           cod:'LAS', direccion:'Av. Las Condes 12751 Las Condes',                        comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 11:30',  diasDespacho:['SA','MA','JU'] },
  { region:'RM', tienda:'ESTORIL',              cod:'EST', direccion:'Estoril 585, local 3, Las Condes',                       comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','MI'] },
  { region:'RM', tienda:'PARQUE ARAUCO',        cod:'PQA', direccion:'Av. Presidente Kennedy 5413 Local 537 Las Condes',       comuna:'Las Condes',    tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['SA','LU','MI','VI'] },
  { region:'RM', tienda:'COSTANERA CENTER',     cod:'CTC', direccion:'Av. Andrés Bello 2425 Local 253 Providencia',            comuna:'Providencia',   tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['SA','LU','MI','VI'] },
  { region:'RM', tienda:'PEÑALOLEN',            cod:'PEÑ', direccion:'Altos del Parque Sur 5800 Local 6 Peñalolén',            comuna:'Ñuñoa',         tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 11:00',  diasDespacho:['SA','MI'] },
  { region:'RM', tienda:'SIMON BOLIVAR',        cod:'SMB', direccion:'Av. Simón Bolívar 4800 Ñuñoa',                           comuna:'Providencia',   tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','MI'] },
  { region:'RM', tienda:'LOS LEONES',           cod:'LEO', direccion:'Av. Los Leones 2572 Providencia',                        comuna:'Providencia',   tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','MI'] },
  { region:'RM', tienda:'LAS LILAS',            cod:'LIL', direccion:'Eliodoro Yáñez 2831 Providencia',                        comuna:'Providencia',   tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','MI'] },
  { region:'RM', tienda:'MANQUEHUE',            cod:'MQH', direccion:'Av. Manquehue Sur 665 Las Condes',                       comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['SA','MA','JU'] },
  { region:'RM', tienda:'LAGUNA',               cod:'LGN', direccion:'Av. Padre Sergio Correa 14500 Local 160 Colina',         comuna:'Colina',        tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 10:00',  diasDespacho:['SA','MA','VI'] },
  { region:'RM', tienda:'CHICUREO',             cod:'CCR', direccion:'Avenida Chicureo 3100 Local 10 Colina',                  comuna:'Colina',        tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','MA','VI'] },
  { region:'RM', tienda:'FLORIDA',              cod:'FLO', direccion:'Av. Gerónimo de Alderete 1800 Locales 7 y 8 La Florida', comuna:'La Florida',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','VI'] },
  { region:'RM', tienda:'FLORIDA CENTER',       cod:'CFL', direccion:'Av. Vicuña Mackenna Ote. 6100 Local 3100',               comuna:'La Florida',    tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'LUIS PASTEUR',         cod:'LP',  direccion:'Av. Luis Pasteur 6420 Vitacura',                         comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'TRAPENSES',            cod:'TPS', direccion:'Camino Los Trapenses 3023 Local 5 Lo Barnechea',         comuna:'Lo Barnechea',  tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'PIE ANDINO',           cod:'PIE', direccion:'Av. Paseo Pie Andino 5855 Local 3A Lo Barnechea',        comuna:'Lo Barnechea',  tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'EL TRANQUE',           cod:'TRQ', direccion:'Manquehue Oriente 2030 Local 3 Lo Barnechea',            comuna:'Lo Barnechea',  tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'LOS TOROS',            cod:'PTA', direccion:'Los Toros 297 Local 1009 Puente Alto',                   comuna:'Puente Alto',   tipo:'STRIPCENTER', ventanaHoraria:'8:30 - 9:30',   diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'PADRE HURTADO',        cod:'PHU', direccion:'Avenida Padre Hurtado Norte 1161 Vitacura',              comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['SA','MA','JU'] },
  { region:'RM', tienda:'NUEVA COSTANERA',      cod:'NUC', direccion:'Av. Nueva Costanera 3889 Local 2 Vitacura',              comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','VI'] },
  { region:'RM', tienda:'PRINCIPE DE GALES',    cod:'PDG', direccion:'Principe de Gales 6161 La Reina',                       comuna:'La Reina',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','JU'] },
  { region:'RM', tienda:'SUBCENTRO',            cod:'SUB', direccion:'Av. Apoquindo 4400 Locales 110 y 112 Las Condes',        comuna:'Las Condes',    tipo:'MALL',        ventanaHoraria:'8:30 - 10:00',  diasDespacho:['SA','MA','JU'] },
  { region:'RM', tienda:'ISABEL LA CATOLICA',   cod:'ILC', direccion:'Av. Américo Vespucio Sur 1463 Las Condes',               comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['MA','VI'] },
  { region:'RM', tienda:'LAS BRUJAS',           cod:'BRU', direccion:'Carlos Silva Vildosola 9073 Local 64 La Reina',          comuna:'La Reina',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','JU'] },
  { region:'RM', tienda:'PEDRO FONTOVA',        cod:'PF',  direccion:'Av. Pedro Fontova 6251 Huechuraba',                      comuna:'Huechuraba',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 10:00',  diasDespacho:['MA','VI'] },
  { region:'RM', tienda:'VITACURA',             cod:'VIT', direccion:'Av. Vitacura 4020 Local 10 Vitacura',                    comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['JU'] },
  { region:'VR', tienda:'VIÑA DEL MAR',         cod:'VIÑ', direccion:'8 Norte 675, Viña del Mar',                              comuna:'Viña del Mar',  tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 11:30',  diasDespacho:['LU','JU'] },
  { region:'VR', tienda:'REÑACA',               cod:'RÑC', direccion:'Av. Edmundo Eluchans 1850 Local 10, Reñaca',             comuna:'Reñaca',        tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','JU'] },
  { region:'VR', tienda:'CONCÓN',               cod:'CON', direccion:'Av. Blanca Estela 1560 Locales 8 y 9, Concón',           comuna:'Concón',        tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:30',  diasDespacho:['LU','JU'] },
  { region:'VR', tienda:'CURAUMA',              cod:'CUR', direccion:'Boulevard 68 Local 1, Curauma, Valparaíso',              comuna:'Curauma',       tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 13:00',  diasDespacho:['LU','JU'] },
];

const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

export function getTiendasSantiagoHoy(): TiendaSantiago[] {
  const today = DAY_CODES[new Date().getDay()];
  return TIENDAS_SANTIAGO.filter(t => t.diasDespacho.includes(today));
}

export function getTiendaSantiagoByCod(cod: string): TiendaSantiago | undefined {
  return TIENDAS_SANTIAGO.find(t => t.cod === cod);
}
