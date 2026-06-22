export interface TiendaInfo {
  n: string;        // nombre
  z: string;        // sector/comuna (zona)
  v: string;        // ventana horaria
  d?: string;       // dirección
  activo?: boolean;
  corredor?: string;
  region?: string;
  tipo?: string;
  frecuencia?: string;
  correos?: string;
  tel_encargado?: string;
  supervisor?: string;
  tel_supervisor?: string;
  transportista?: string;
  _parada?: boolean;
  _tipo?: string;
  _desc?: string;
}

export const TIENDAS_INICIAL: Record<string, TiendaInfo> = {
  // ── Región Metropolitana ──────────────────────────────────────────────────
  "32BNV":{n:"Buenaventura",              z:"Corredor Poniente",    v:"09:00-12:00", region:"RM",          d:"San Ignacio 500, Quilicura",                                          correos:"buenaventura@kiosclub.com",      tel_encargado:"56932280943"},
  "35BN2":{n:"Buenaventura 2",            z:"Corredor Poniente",    v:"09:00-12:00", region:"RM",          d:"San Ignacio 500, Quilicura",                                          correos:"buenaventura@kiosclub.com",      tel_encargado:"Pendiente"},
  "14PF": {n:"Pedro Fontova",             z:"Corredor Poniente",    v:"09:30-10:00", region:"RM",          d:"Av. Pedro Fontova 6251, Huechuraba",                                  correos:"pedrofontova@kiosclub.com",      tel_encargado:"56940086711"},
  "22LGN":{n:"Laguna",                    z:"Corredor Norte",       v:"09:00-10:00", region:"RM",          d:"Av. Padre Sergio Correa 14500 Local 160, Colina",                     correos:"laguna@kiosclub.com",            tel_encargado:"56944717215"},
  "07CCR":{n:"Chicureo",                  z:"Corredor Norte",       v:"09:00-12:00", region:"RM",          d:"Avenida Chicureo 3100 Local 10, Colina",                              correos:"chicureo@kiosclub.com",          tel_encargado:"56939348205"},
  "17MAI":{n:"Maipú",                     z:"Corredor Poniente",    v:"08:30-09:30", region:"RM",          d:"Av. Américo Vespucio 399 Nivel 1 Pasillo Falabella, Local 560, Maipú",correos:"araucomaipu@kiosclub.com",       tel_encargado:"56994123528"},
  "02SCL":{n:"San Carlos de Apoquindo",   z:"Corredor Oriente",     v:"09:00-12:00", region:"RM",          d:"Av. Plaza 1250, Las Condes",                                          correos:"sancarlos@kiosclub.com",         tel_encargado:"56939192429"},
  "12LAS":{n:"Las Condes",                z:"Corredor Oriente",     v:"09:00-11:30", region:"RM",          d:"Av. Las Condes 12751, Las Condes",                                    correos:"lascondes@kiosclub.com",         tel_encargado:"56933743464"},
  "45EST":{n:"Estoril",                   z:"Corredor Oriente",     v:"09:00-12:00", region:"RM",          d:"Estoril 585 Local 3, Las Condes",                                     correos:"estoril@kiosclub.com",           tel_encargado:"56975624968"},
  "16PQA":{n:"Parque Arauco",             z:"Corredor Oriente",     v:"08:30-09:30", region:"RM",          d:"Av. Kennedy 5413 Local 537, Las Condes",                              correos:"parquearauco@kiosclub.com",      tel_encargado:"56944717269"},
  "20CTC":{n:"Costanera Center",          z:"Corredor Providencia", v:"08:30-09:30", region:"RM",          d:"Av. Andrés Bello 2425 Local 253, Providencia",                        correos:"costaneracenter@kiosclub.com",   tel_encargado:"56926188369"},
  "34SMB":{n:"Simon Bolivar",             z:"Corredor Providencia", v:"09:00-12:00", region:"RM",          d:"Av. Simón Bolívar 4800, Ñuñoa",                                      correos:"simonbolivar@kiosclub.com",      tel_encargado:"56931961796"},
  "09LEO":{n:"Los Leones",                z:"Corredor Providencia", v:"09:00-12:00", region:"RM",          d:"Av. Los Leones 2572, Providencia",                                    correos:"losleones@kiosclub.com",         tel_encargado:"56982554104"},
  "40LIL":{n:"Las Lilas",                 z:"Corredor Providencia", v:"09:00-12:00", region:"RM",          d:"Eliodoro Yáñez 2831, Providencia",                                   correos:"laslilas@kiosclub.com",          tel_encargado:"56928198169"},
  "06MQH":{n:"Manquehue",                 z:"Corredor Oriente",     v:"09:30-12:00", region:"RM",          d:"Av. Manquehue Sur 665, Las Condes",                                   correos:"manquehue@kiosclub.com",         tel_encargado:"56939192426"},
  "05LP": {n:"Luis Pasteur",              z:"Corredor Sur",         v:"09:00-12:00", region:"RM",          d:"Av. Luis Pasteur 6420, Vitacura",                                     correos:"luispasteur@kiosclub.com",       tel_encargado:"56939192424"},
  "01TPS":{n:"Trapenses",                 z:"Corredor Norte",       v:"09:00-12:00", region:"RM",          d:"Camino Los Trapenses 3023 Local 5, Lo Barnechea",                     correos:"trapenses@kiosclub.com",         tel_encargado:"56939192431"},
  "13PIE":{n:"Pie Andino",                z:"Corredor Norte",       v:"09:00-12:00", region:"RM",          d:"Av. Paseo Pie Andino 5855 Local 3A, Lo Barnechea",                    correos:"pieandino@kiosclub.com",         tel_encargado:"56933743463"},
  "10TRQ":{n:"El Tranque",                z:"Corredor Norte",       v:"09:30-12:00", region:"RM",          d:"Manquehue Oriente 2030 Local 3, Lo Barnechea",                        correos:"tranque@kiosclub.com",           tel_encargado:"56994937964"},
  "30PHU":{n:"Padre Hurtado",             z:"Corredor Oriente",     v:"09:00-12:00", region:"RM",          d:"Av. Padre Hurtado Norte 1161, Vitacura",                              correos:"padrehurtado@kiosclub.com",      tel_encargado:"56977664532"},
  "21NUC":{n:"Nueva Costanera",           z:"Corredor Sur",         v:"09:00-12:00", region:"RM",          d:"Av. Nueva Costanera 3889 Local 2, Vitacura",                          correos:"costanera@kiosclub.com",         tel_encargado:"56944717265"},
  "04PDG":{n:"Principe de Gales",         z:"Corredor Sur",         v:"09:00-12:00", region:"RM",          d:"Principe de Gales 6161, La Reina",                                    correos:"principedegales@kiosclub.com",   tel_encargado:"56998328884"},
  "19SUB":{n:"Subcentro",                 z:"Corredor Oriente",     v:"08:30-10:00", region:"RM",          d:"Av. Apoquindo 4400 Loc.110-112, Las Condes",                          correos:"subcentro@kiosclub.com",         tel_encargado:"56944717218"},
  "11ILC":{n:"Isabel la Católica",        z:"Corredor Oriente",     v:"09:30-12:00", region:"RM",          d:"Av. Américo Vespucio Sur 1463, Las Condes",                           correos:"isabellacatolica@kiosclub.com",  tel_encargado:"56932259426"},
  "48BRU":{n:"Las Brujas",                z:"Corredor Sur",         v:"09:00-12:00", region:"RM",          d:"Carlos Silva Vildosola 9073 Local 64, La Reina",                      correos:"lasbrujas@kiosclub.com",         tel_encargado:"56978546014"},
  "03VIT":{n:"Vitacura",                  z:"Corredor Oriente",     v:"09:00-12:00", region:"RM",          d:"Av. Vitacura 4020 Local 10, Vitacura",                                correos:"locastillo@kiosclub.com",        tel_encargado:"56939192428"},
  "52MUT":{n:"El MUT",                    z:"Corredor Oriente",     v:"08:30-09:30", region:"RM",          d:"Roger de Flor 2725, Las Condes",                                      correos:"52mut@kiosclub.com",             tel_encargado:"56926022277"},
  "23PEÑ":{n:"Peñalolén",               z:"Corredor Sur",         v:"09:00-11:00", region:"RM",          d:"Altos del Parque Sur 5800 Local 6, Peñalolén",                       correos:"altosdelparque@kiosclub.com",    tel_encargado:"56934613886"},
  "18FLO":{n:"Florida",                   z:"Corredor Sur",         v:"09:30-12:00", region:"RM",          d:"Av. Gerónimo de Alderete 1800, La Florida",                           correos:"laflorida@kiosclub.com",         tel_encargado:"56944717280"},
  "29CFL":{n:"Florida Center",            z:"Corredor Sur",         v:"08:30-09:30", region:"RM",          d:"Av. Vicuña Mackenna Ote. 6100 Local 3100, La Florida",               correos:"cencoflorida@kiosclub.com",      tel_encargado:"56942536007"},
  "49PTA":{n:"Los Toros (Puente Alto)",   z:"Corredor Sur",         v:"08:30-09:30", region:"RM",          d:"Los Toros 297 Local 1009, Puente Alto",                               correos:"lostoros@kiosclub.com",          tel_encargado:"56995765854"},
  CLI:   {n:"Colina",                      z:"Corredor Norte",       v:"09:00-12:00", region:"RM"},
  "55ITA":{n:"ITA",                        z:"Corredor RM",           v:"09:00-12:00", region:"RM",          correos:"55ita@kiosclub.com"},
  "56PZA":{n:"PZA",                        z:"Corredor RM",           v:"09:00-12:00", region:"RM",          correos:"56pza@kiosclub.com"},
  // ── Costa (Valparaíso) ───────────────────────────────────────────────────
  "37VIÑ":{n:"Viña del Mar",              z:"Costa",                v:"09:30-11:30", region:"Valparaíso",  d:"8 Norte 675, Viña del Mar",                                           correos:"vinadelmar@kiosclub.com",        tel_encargado:"56941223668"},
  "08RNC":{n:"Reñaca",                    z:"Costa",                v:"09:30-12:00", region:"Valparaíso",  d:"Av. Edmundo Eluchans 1850 Local 10, Reñaca",                          correos:"renaca@kiosclub.com",            tel_encargado:"56974772902"},
  "33CON":{n:"Concón",                    z:"Costa",                v:"09:30-12:30", region:"Valparaíso",  d:"Av. Blanca Estela 1560 Locales 8-9, Concón",                         correos:"concon@kiosclub.com",            tel_encargado:"56923786679"},
  "43CUR":{n:"Curauma",                   z:"Costa",                v:"09:30-13:00", region:"Valparaíso",  d:"Boulevard 68 Local 1, Curauma, Valparaíso",                           correos:"curauma@kiosclub.com",           tel_encargado:"56973939049"},
  "54MPQ":{n:"Quilpué",                   z:"Costa",                v:"09:30-12:00", region:"Valparaíso",  d:"Diego Portales 822, Quilpué",                                         correos:"54mpq@kiosclub.com",             tel_encargado:"56932062999"},
  // ── Norte ─────────────────────────────────────────────────────────────────
  "39PSB":{n:"Paseo Balmaceda La Serena 1",z:"Región",             v:"09:00-10:00", region:"Coquimbo",    d:"Av. Balmaceda 2885 Local 133-136, La Serena",                         correos:"paseobalmaceda@kiosclub.com",    tel_encargado:"56961482676"},
  "51SER":{n:"Serena 2",                  z:"Región",               v:"09:00-10:30", region:"Coquimbo",    d:"Av. Cuatro Esquinas 1617 Loc.117-118, La Serena",                     correos:"laserena2@kiosclub.com",         tel_encargado:"56932059464"},
  "41ANA":{n:"Antofagasta",               z:"Región",               v:"09:00-10:00", region:"Antofagasta", d:"Av. Angamos 745 Local 1032, Antofagasta",                             correos:"cencoangamos@kiosclub.com",      tel_encargado:"56976568957"},
  "42ANP":{n:"Antofagasta 2",             z:"Región",               v:"09:00-10:00", region:"Antofagasta", d:"Av. Pedro Aguirre Cerda 10578 Local 303, Antofagasta",                correos:"paseolaportada@kiosclub.com",    tel_encargado:"56934031556"},
  // ── Sur ───────────────────────────────────────────────────────────────────
  "27MCH":{n:"Machalí",                   z:"Región",               v:"09:00-10:30", region:"O'Higgins",   d:"San Juan 133, Machalí",                                               correos:"machali@kiosclub.com",           tel_encargado:"56934266263"},
  "31TLC":{n:"Talca",                     z:"Región",               v:"09:00-16:00", region:"Maule",       d:"2 Norte 3435 Local 6 al 9, Talca",                                    correos:"talca@kiosclub.com",             tel_encargado:"56931908723"},
  "36CHL":{n:"Chillán",                   z:"Región",               v:"09:00-10:00", region:"Ñuble",       d:"Av. Vicente Méndez 1545 Local 1000, Chillán",                        correos:"chillan@kiosclub.com",           tel_encargado:"56923715387"},
  "46TRE":{n:"Talcahuano",                z:"Región",               v:"08:30-09:30", region:"Biobío",      d:"Av. Jorge Alessandri 3177 Local D-106, Talcahuano",                   correos:"eltrebol@kiosclub.com",          tel_encargado:"56964347365"},
  "24SPP":{n:"San Pedro de la Paz",       z:"Región",               v:"09:00-11:00", region:"Biobío",      d:"Camino El Venado 1380, San Pedro de la Paz",                          correos:"sanpedro@kiosclub.com",          tel_encargado:"56928397283"},
  "38SP2":{n:"San Pedro de la Paz 2",     z:"Región",               v:"09:00-12:00", region:"Biobío",      d:"Los Mañíos 4455, San Pedro de la Paz",                               correos:"paseosanpedro@kiosclub.com",     tel_encargado:"56923858047"},
  "28TEM":{n:"Temuco",                    z:"Región",               v:"09:00-13:00", region:"Araucanía",   d:"Av. Alemania 850 Local 3-4, Temuco",                                  correos:"temuco@kiosclub.com",            tel_encargado:"56940712970"},
  "75PUC":{n:"Pucón",                     z:"Región",               v:"09:30-11:00", region:"Araucanía",   d:"Pedro de Valdivia 333, Pucón",                                        correos:"pucon@kiosclub.com",             tel_encargado:"56923944808"},
  "76PAN":{n:"Panguipulli",               z:"Región",               v:"10:30-11:30", region:"Los Ríos",    d:"Av. Martínez de Rozas 430, Panguipulli",                              correos:"panguipulli@kiosclub.com",       tel_encargado:"56995081927"},
  "53VAL":{n:"Valdivia",                  z:"Región",               v:"09:00-10:00", region:"Los Ríos",    d:"Errázuriz 1102-1298, Local 1078, Valdivia",                           correos:"53valdivia@kiosclub.com",        tel_encargado:"56926109718"},
  "47PTV":{n:"Puerto Varas",              z:"Región",               v:"09:00-10:00", region:"Los Lagos",   d:"Vicente Pérez Rosales 1285, Puerto Varas",                            correos:"puertovaras@kiosclub.com",       tel_encargado:"56931774652"},
  "50PTM":{n:"Puerto Montt",              z:"Región",               v:"08:00-10:00", region:"Los Lagos",   d:"Illapel 10, Puerto Montt",                                            correos:"puertomontt@kiosclub.com",       tel_encargado:"56995040635"},
};

export const ALIAS: Record<string, string> = {
  // Códigos canónicos con Ñ: entrada directa para que norm() no haga strip antes del lookup
  "23PEÑ":"23PEÑ",
  // Variante ASCII del código completo (23PEN) → canónico con Ñ. Evita la tienda
  // duplicada 23PEN/23PEÑ: norm() ya resolvía "PEN" pero NO "23PEN".
  "23PEN":"23PEÑ",
  // Variantes con tilde → código interno ASCII
  "PEÑ":"23PEÑ","PEñ":"23PEÑ","PEG":"23PEÑ",
  // Viña: canónico con Ñ (como 23PEÑ). Variantes ASCII/tilde → "37VIÑ".
  "37VIÑ":"37VIÑ","37VIN":"37VIÑ","VIÑ":"37VIÑ","VIñ":"37VIÑ",
  "RÑC":"08RNC","RñC":"08RNC",
  // Códigos cortos antiguos → nuevos códigos numéricos (retrocompatibilidad)
  "BNV":"32BNV","BN2":"35BN2","MAI":"17MAI","SCL":"02SCL","LAS":"12LAS",
  "EST":"45EST","PQA":"16PQA","CTC":"20CTC","PEN":"23PEÑ","SMB":"34SMB",
  "LEO":"09LEO","LIL":"40LIL","MQH":"06MQH","LGN":"22LGN","CCR":"07CCR",
  "FLO":"18FLO","CFL":"29CFL","LP":"05LP","TPS":"01TPS","PIE":"13PIE",
  "TRQ":"10TRQ","PTA":"49PTA","PHU":"30PHU","NUC":"21NUC","PDG":"04PDG",
  "SUB":"19SUB","ILC":"11ILC","BRU":"48BRU","PF":"14PF","VIT":"03VIT",
  "MUT":"52MUT","VIN":"37VIÑ","RNC":"08RNC","CON":"33CON","CUR":"43CUR",
  "MPQ":"54MPQ","PSB":"39PSB","SER":"51SER","MCH":"27MCH","TLC":"31TLC",
  "CHL":"36CHL","TRE":"46TRE","SPP":"24SPP","SP2":"38SP2","TEM":"28TEM",
  "PUC":"75PUC","PAN":"76PAN","PTV":"47PTV","PTM":"50PTM","ANA":"41ANA",
  "ANP":"42ANP","VAL":"53VAL","ITA":"55ITA","PZA":"56PZA",
};

export const GPS_INICIAL: Record<string, [number, number]> = {
  "32BNV":[-33.331041,-70.702658], "35BN2":[-33.331041,-70.702658],
  "17MAI":[-33.481094,-70.751884],
  "02SCL":[-33.391885,-70.506455], "12LAS":[-33.371694,-70.513811], "45EST":[-33.385302,-70.531448],
  "16PQA":[-33.401315,-70.578471], "20CTC":[-33.415851,-70.607317],
  "23PEÑ":[-33.497676,-70.555504], "34SMB":[-33.446862,-70.580861],
  "09LEO":[-33.442166,-70.599243], "40LIL":[-33.428452,-70.595663],
  "06MQH":[-33.412495,-70.566325],
  "22LGN":[-33.277007,-70.627228], "07CCR":[-33.286836,-70.669258], CLI:[-33.195,-70.6667],
  "18FLO":[-33.527866,-70.575826], "29CFL":[-33.511099,-70.605902],
  "05LP": [-33.382757,-70.573066], "01TPS":[-33.347548,-70.542238],
  "13PIE":[-33.324073,-70.538501], "10TRQ":[-33.36159,-70.544865],
  "49PTA":[-33.569135,-70.580537],
  "30PHU":[-33.387667,-70.54889],
  "21NUC":[-33.398684,-70.597442],
  "04PDG":[-33.43842,-70.568825],
  "19SUB":[-33.413644,-70.583988], "11ILC":[-33.426214,-70.576995],
  "48BRU":[-33.439732,-70.536024],
  "14PF": [-33.366405,-70.670044],
  "03VIT":[-33.399499,-70.591214],
  "52MUT":[-33.417053,-70.601451],
  "37VIÑ":[-33.015089,-71.550552],
  "08RNC":[-32.958038,-71.543483],
  "33CON":[-32.941688,-71.545593],
  "43CUR":[-33.123043,-71.561635],
  "54MPQ":[-33.046763,-71.441175],
  "39PSB":[-29.925456,-71.257794], "51SER":[-29.935374,-71.239229],
  "27MCH":[-34.17651,-70.697448],
  "31TLC":[-35.431966,-71.626374],
  "36CHL":[-36.588538,-72.077305],
  "46TRE":[-36.791774,-73.066489], "24SPP":[-36.852911,-73.093466], "38SP2":[-36.859675,-73.132658],
  "28TEM":[-38.73386,-72.61493],   "75PUC":[-39.273563,-71.976928], "76PAN":[-39.643454,-72.328784],
  "47PTV":[-41.327169,-72.965739], "50PTM":[-41.47213,-72.936349],
  "41ANA":[-23.667609,-70.405026], "42ANP":[-23.566051,-70.390208],
};

export const CD_INICIAL: [number, number] = [-33.412581, -70.632438];

export const COLS = ['#D42B2B','#1B2A6B','#34C759','#FF9500','#8b5cf6','#22d3ee','#f97316','#ec4899'];

export const PROVIDENCIA        = new Set(['09LEO','40LIL','20CTC','52MUT']);
export const REGION_V           = new Set(['37VIÑ','08RNC','33CON']);
export const CORREDOR_AUTOPISTA = new Set(['43CUR','32BNV','35BN2']);

export const SID = '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
export const GMAPS_KEY = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
export const SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw0e4hjMDQWTzk1jOdxqYHXyOzTruVv1OYK4m9HczrPgfehYukesxcxDmys49fGVXlQ-g/exec';
