import type { Tienda } from '../../../../types';

export const TIENDAS: Record<string, Tienda> = {
  "La Serena (PSB)":   {cod:"39PSB",name:"La Serena (PSB)",   region:"COQUIMBO",      nombre_dest:"tienda la serena",             email:"paseobalmaceda@kiosclub.com", celular:"940443161",rut:"76360868-9",region_sendu:"Coquimbo",                                        comuna:"La Serena",           calle:"Av Balmaceda",                                    numero:"2885", complemento:"Local 133 al 136", str_val:"La Serena"},
  "La Serena 2 (SER)": {cod:"51SER",name:"La Serena 2 (SER)", region:"COQUIMBO",      nombre_dest:"tienda la serena 2",           email:"laserena2@kiosclub.com",       celular:"969158948",rut:"76360868-9",region_sendu:"Coquimbo",                                        comuna:"La Serena",           calle:"Av Cuatro Esquinas",                              numero:"1617", complemento:"Local 117 y 118", str_val:"La Serena"},
  "Temuco":            {cod:"28TEM",name:"Temuco",             region:"LA ARAUCANÍA",  nombre_dest:"tienda temuco",                email:"temuco@kiosclub.com",          celular:"940712970",rut:"76360868-9",region_sendu:"Araucanía",                                       comuna:"Temuco",              calle:"Av. Alemania",                                    numero:"850",  complemento:"Local 3 y 4",    str_val:"Temuco"},
  "El Trébol":         {cod:"46TRE",name:"El Trébol",          region:"BIOBÍO",        nombre_dest:"tienda el trebol",             email:"eltrebol@kiosclub.com",         celular:"964347365",rut:"76360868-9",region_sendu:"BioBío",                                          comuna:"Talcahuano",          calle:"Av. Jorge Alessandri",                            numero:"3177", complemento:"Local D 106",    str_val:"Talcahuano"},
  "Chillán":           {cod:"36CHL",name:"Chillán",            region:"ÑUBLE",         nombre_dest:"tienda chillan",               email:"chillan@kiosclub.com",          celular:"923715387",rut:"76360868-9",region_sendu:"Ñuble",                                           comuna:"Chillán",             calle:"Av Vicente Mendez",                               numero:"1545", complemento:"Local 1000",     str_val:"Chillán"},
  "Pucón":             {cod:"75PUC",name:"Pucón",              region:"LA ARAUCANÍA",  nombre_dest:"tienda pucon",                 email:"pucon@kiosclub.com",            celular:"923944808",rut:"76360868-9",region_sendu:"Araucanía",                                       comuna:"Pucón",               calle:"Pedro De Valdivia",                               numero:"333",  complemento:"",               str_val:"Pucón"},
  "Talca":             {cod:"31TLC",name:"Talca",              region:"MAULE",         nombre_dest:"tienda talca",                 email:"talca@kiosclub.com",            celular:"931908723",rut:"76360868-9",region_sendu:"Maule",                                           comuna:"Talca",               calle:"2 Norte",                                         numero:"3435", complemento:"Local 6 al 9",   str_val:"Talca"},
  "San Pedro 1 (SPP)": {cod:"24SPP",name:"San Pedro 1 (SPP)", region:"BIOBÍO",        nombre_dest:"tienda San Pedro (SSP1)",      email:"sanpedro@kiosclub.com",         celular:"950316810",rut:"76360868-9",region_sendu:"BioBío",                                          comuna:"San Pedro de La Paz", calle:"Camino El Venado",                                numero:"1380", complemento:"Local 2",        str_val:"San Pedro de La Paz"},
  "San Pedro 2 (SP2)": {cod:"38SP2",name:"San Pedro 2 (SP2)", region:"BIOBÍO",        nombre_dest:"tienda Paseo San Pedro (SP2)", email:"paseosanpedro@kiosclub.com",    celular:"923858047",rut:"76360868-9",region_sendu:"BioBío",                                          comuna:"San Pedro de La Paz", calle:"Los Mañios",                                      numero:"4455", complemento:"Paseo San Pedro",str_val:"San Pedro de La Paz"},
  "Antofagasta (ANP)": {cod:"42ANP",name:"Antofagasta (ANP)", region:"ANTOFAGASTA",   nombre_dest:"tienda La Portada",            email:"paseolaportada@kiosclub.com",   celular:"934031556",rut:"76360868-9",region_sendu:"Antofagasta",                                     comuna:"Antofagasta",         calle:"Av Pedro Aguirre Cerda",                          numero:"10578",complemento:"Local 303-303",  str_val:"Antofagasta"},
  "Antofagasta (ANA)": {cod:"41ANA",name:"Antofagasta (ANA)", region:"ANTOFAGASTA",   nombre_dest:"Tienda Cenco Angamos",         email:"cencoangamos@kiosclub.com",     celular:"976568957",rut:"76360868-9",region_sendu:"Antofagasta",                                     comuna:"Antofagasta",         calle:"Av Angamos",                                      numero:"745",  complemento:"Local 1032",     str_val:"Antofagasta"},
  "Machalí":           {cod:"27MCH",name:"Machalí",            region:"O'HIGGINS",     nombre_dest:"Tienda Machali",               email:"machali@kiosclub.com",          celular:"934266263",rut:"76360868-9",region_sendu:"Libertador_General_Bernardo_OHiggins",       comuna:"Machalí",             calle:"San Juan",                                        numero:"133",  complemento:"",               str_val:"Machalí"},
  "Panguipulli":       {cod:"76PAN",name:"Panguipulli",        region:"LOS RÍOS",      nombre_dest:"tienda panguipulli",           email:"panguipulli@kiosclub.com",      celular:"995081927",rut:"76360868-9",region_sendu:"Los_Ríos",                                        comuna:"Panguipulli",         calle:"Av. Martinez de Rozas",                           numero:"430",  complemento:"",               str_val:"Panguipulli"},
  "Puerto Varas":      {cod:"47PTV",name:"Puerto Varas",       region:"LOS LAGOS",     nombre_dest:"tienda puerto varas",          email:"puertovaras@kiosclub.com",      celular:"931774652",rut:"76360868-9",region_sendu:"Los_Lagos",                                       comuna:"Puerto Varas",        calle:"1285 Vicente Perez Rosales y Eleuterio Ramirez", numero:"",     complemento:"Local 101 y 102",str_val:"Puerto Varas"},
  "Puerto Montt":      {cod:"50PTM",name:"Puerto Montt",       region:"LOS LAGOS",     nombre_dest:"tienda puerto montt",          email:"puertomontt@kiosclub.com",      celular:"995040635",rut:"76360868-9",region_sendu:"Los_Lagos",                                       comuna:"Puerto Montt",        calle:"Illapel",                                         numero:"10",   complemento:"Local 111a",     str_val:"Puerto Montt"},
  "Valdivia":          {cod:"53VAL",name:"Valdivia",           region:"LOS RÍOS",      nombre_dest:"tienda valdivia",             email:"despachocd@kiosclub.com",         celular:"926109718",rut:"76360868-9",region_sendu:"Los_Ríos",                                        comuna:"Valdivia",            calle:"Errazuriz",                                    numero:"1102",  complemento:"Local 1078",               str_val:"Valdivia"}
};

export const CALENDARIO: Record<number, string[]> = {
  1: ['46TRE','28TEM','75PUC','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP'],
  2: ['27MCH','36CHL','24SPP','38SP2','76PAN','51SER'],
  3: ['31TLC','46TRE','53VAL','47PTV','50PTM','39PSB','41ANA','42ANP'],
  4: ['36CHL','24SPP','38SP2','28TEM','75PUC','51SER'],
  5: ['31TLC','46TRE','76PAN','47PTV','50PTM','39PSB'],
};

export const LIMITES = {
  pallet: { pesoMax: 1000, altoMax: 175, anchoMax: 130, largoMax: 130 },
  box:    { pesoMax: 500,  altoMax: 200, anchoMax: 250, largoMax: 250 },
};

export function getTodayCods(): string[] {
  const dow = new Date().getDay();
  const map: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5};
  return CALENDARIO[map[dow]] || [];
}

export function getTodayTiendas(): string[] {
  const cods = getTodayCods();
  return Object.values(TIENDAS)
    .filter(t => cods.includes(t.cod))
    .sort((a, b) => cods.indexOf(a.cod) - cods.indexOf(b.cod))
    .map(t => t.name);
}

export function validarDimensiones(pkg: string, peso: number, alto: number, ancho: number, largo: number): string[] {
  const lim = LIMITES[pkg as 'pallet' | 'box'];
  if (!lim) return [];
  const errores: string[] = [];
  if (peso > lim.pesoMax) errores.push(`Peso máximo ${lim.pesoMax} kg para ${pkg}`);
  if (alto  && alto  > lim.altoMax)  errores.push(`Alto máximo ${lim.altoMax} cm`);
  if (ancho && ancho > lim.anchoMax) errores.push(`Ancho máximo ${lim.anchoMax} cm`);
  if (largo && largo > lim.largoMax) errores.push(`Largo máximo ${lim.largoMax} cm`);
  return errores;
}
