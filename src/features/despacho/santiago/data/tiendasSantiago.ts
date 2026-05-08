import type { TiendaSantiago } from '../types';

export const TIENDAS_SANTIAGO: TiendaSantiago[] = [
  // ── RM ──────────────────────────────────────────────────────────────────────
  { region:'RM', tienda:'BUENAVENTURA',           cod:'32BNV', direccion:'San Ignacio 500, Quilicura',                              comuna:'Quilicura',     tipo:'MALL',        ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'BUENAVENTURA 2',          cod:'35BN2', direccion:'San Ignacio 500, Quilicura',                              comuna:'Quilicura',     tipo:'MALL',        ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'MAIPU',                   cod:'17MAI', direccion:'Av. Américo Vespucio 399, Maipú',                         comuna:'Maipú',         tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'SAN CARLOS DE APOQUINDO', cod:'02SCL', direccion:'Av Plaza 1250, Las Condes',                               comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','JU'] },
  { region:'RM', tienda:'LAS CONDES',              cod:'12LAS', direccion:'Av. Las Condes 12751 Las Condes',                         comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 11:30',  diasDespacho:['LU','JU'] },
  { region:'RM', tienda:'ESTORIL',                 cod:'45EST', direccion:'Estoril 585, local 3, Las Condes',                        comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','JU'] },
  { region:'RM', tienda:'PARQUE ARAUCO',           cod:'16PQA', direccion:'Av. Presidente Kennedy 5413 Local 537 Las Condes',        comuna:'Las Condes',    tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'COSTANERA CENTER',        cod:'20CTC', direccion:'Av. Andrés Bello 2425 Local 253 Providencia',             comuna:'Providencia',   tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'PEÑALOLEN',               cod:'23PEÑ', direccion:'Altos del Parque Sur 5800 Local 6 Peñalolén',             comuna:'Ñuñoa',         tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 11:00',  diasDespacho:['LU','JU'] },
  { region:'RM', tienda:'SIMON BOLIVAR',           cod:'34SMB', direccion:'Av. Simón Bolívar 4800 Ñuñoa',                            comuna:'Providencia',   tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','JU'] },
  { region:'RM', tienda:'LOS LEONES',              cod:'09LEO', direccion:'Av. Los Leones 2572 Providencia',                         comuna:'Providencia',   tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','JU'] },
  { region:'RM', tienda:'LAS LILAS',               cod:'40LIL', direccion:'Eliodoro Yáñez 2831 Providencia',                         comuna:'Providencia',   tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','MI'] },
  { region:'RM', tienda:'MANQUEHUE',               cod:'06MQH', direccion:'Av. Manquehue Sur 665 Las Condes',                        comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','MA','JU'] },
  { region:'RM', tienda:'EL MUT',                  cod:'52MUT', direccion:'Roger de Flor 2725, Las Condes',                          comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'8:30 - 9:30',   diasDespacho:['LU','MI','VI'] },
  { region:'RM', tienda:'LAGUNA',                  cod:'22LGN', direccion:'Av. Padre Sergio Correa 14500 Local 160 Colina',          comuna:'Colina',        tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 10:00',  diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'CHICUREO',                cod:'07CCR', direccion:'Avenida Chicureo 3100 Local 10 Colina',                   comuna:'Colina',        tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'FLORIDA',                 cod:'18FLO', direccion:'Av. Gerónimo de Alderete 1800 Locales 7 y 8 La Florida',  comuna:'La Florida',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','JU'] },
  { region:'RM', tienda:'FLORIDA CENTER',          cod:'29CFL', direccion:'Av. Vicuña Mackenna Ote. 6100 Local 3100',                comuna:'La Florida',    tipo:'MALL',        ventanaHoraria:'8:30 - 9:30',   diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'LUIS PASTEUR',            cod:'05LP',  direccion:'Av. Luis Pasteur 6420 Vitacura',                          comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','MA','JU'] },
  { region:'RM', tienda:'TRAPENSES',               cod:'01TPS', direccion:'Camino Los Trapenses 3023 Local 5 Lo Barnechea',          comuna:'Lo Barnechea',  tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'PIE ANDINO',              cod:'13PIE', direccion:'Av. Paseo Pie Andino 5855 Local 3A Lo Barnechea',         comuna:'Lo Barnechea',  tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'EL TRANQUE',              cod:'10TRQ', direccion:'Manquehue Oriente 2030 Local 3 Lo Barnechea',             comuna:'Lo Barnechea',  tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['MA','VI'] },
  { region:'RM', tienda:'LOS TOROS',               cod:'49PTA', direccion:'Los Toros 297 Local 1009 Puente Alto',                    comuna:'Puente Alto',   tipo:'STRIPCENTER', ventanaHoraria:'8:30 - 9:30',   diasDespacho:['MA','MI','VI'] },
  { region:'RM', tienda:'PADRE HURTADO',           cod:'30PHU', direccion:'Avenida Padre Hurtado Norte 1161 Vitacura',               comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','MA','JU'] },
  { region:'RM', tienda:'NUEVA COSTANERA',         cod:'21NUC', direccion:'Av. Nueva Costanera 3889 Local 2 Vitacura',               comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['LU','MA','JU'] },
  { region:'RM', tienda:'PRINCIPE DE GALES',       cod:'04PDG', direccion:'Principe de Gales 6161 La Reina',                        comuna:'La Reina',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','JU'] },
  { region:'RM', tienda:'SUBCENTRO',               cod:'19SUB', direccion:'Av. Apoquindo 4400 Locales 110 y 112 Las Condes',         comuna:'Las Condes',    tipo:'MALL',        ventanaHoraria:'8:30 - 10:00',  diasDespacho:['LU','MI','JU'] },
  { region:'RM', tienda:'ISABEL LA CATOLICA',      cod:'11ILC', direccion:'Av. Américo Vespucio Sur 1463 Las Condes',                comuna:'Las Condes',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','JU'] },
  { region:'RM', tienda:'LAS BRUJAS',              cod:'48BRU', direccion:'Carlos Silva Vildosola 9073 Local 64 La Reina',           comuna:'La Reina',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','JU'] },
  { region:'RM', tienda:'PEDRO FONTOVA',           cod:'14PF',  direccion:'Av. Pedro Fontova 6251 Huechuraba',                       comuna:'Huechuraba',    tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 10:00',  diasDespacho:['MA','VI'] },
  { region:'RM', tienda:'VITACURA',                cod:'03VIT', direccion:'Av. Vitacura 4020 Local 10 Vitacura',                     comuna:'Vitacura',      tipo:'STRIPCENTER', ventanaHoraria:'9:00 - 12:00',  diasDespacho:['MA','JU'] },
  // ── Costa (V Región) ────────────────────────────────────────────────────────
  { region:'VR', tienda:'VIÑA DEL MAR',            cod:'37VIÑ', direccion:'8 Norte 675, Viña del Mar',                               comuna:'Viña del Mar',  tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 11:30',  diasDespacho:['LU','MI'] },
  { region:'VR', tienda:'REÑACA',                  cod:'08RNC', direccion:'Av. Edmundo Eluchans 1850 Local 10, Reñaca',              comuna:'Reñaca',        tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','MI'] },
  { region:'VR', tienda:'CONCÓN',                  cod:'33CON', direccion:'Av. Blanca Estela 1560 Locales 8 y 9, Concón',            comuna:'Concón',        tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:30',  diasDespacho:['LU','MI'] },
  { region:'VR', tienda:'CURAUMA',                 cod:'43CUR', direccion:'Boulevard 68 Local 1, Curauma, Valparaíso',               comuna:'Curauma',       tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 13:00',  diasDespacho:['LU','MI'] },
  { region:'VR', tienda:'QUILPUÉ',                 cod:'54MPQ', direccion:'Diego Portales 822, Quilpué, Valparaíso',                  comuna:'Quilpué',       tipo:'STRIPCENTER', ventanaHoraria:'9:30 - 12:00',  diasDespacho:['LU','MI'] },
];

const DAY_CODES = ['DO', 'LU', 'MA', 'MI', 'JU', 'VI', 'SA'];

export function getTiendasSantiagoHoy(): TiendaSantiago[] {
  const today = DAY_CODES[new Date().getDay()];
  return TIENDAS_SANTIAGO.filter(t => t.diasDespacho.includes(today));
}

export function getTiendaSantiagoByCod(cod: string): TiendaSantiago | undefined {
  return TIENDAS_SANTIAGO.find(t => t.cod === cod);
}
