export interface TiendaInfo { n: string; z: string; v: string; d?: string; activo?: boolean; corredor?: string; _parada?: boolean; _tipo?: string; _desc?: string; }

export const TIENDAS_INICIAL: Record<string, TiendaInfo> = {
  "32BNV":{n:"Buenaventura",z:"Corredor Poniente",v:"09:00-12:00",d:"San Ignacio 500, Quilicura"},
  "35BN2":{n:"Buenaventura 2",z:"Corredor Poniente",v:"09:00-12:00",d:"San Ignacio 500, Quilicura"},
  "17MAI":{n:"Maipú",z:"Corredor Poniente",v:"08:30-09:30",d:"Av. Américo Vespucio 399, Maipú"},
  "02SCL":{n:"San Carlos",z:"Corredor Oriente",v:"09:00-12:00",d:"Av. Plaza 1250, Las Condes"},
  "12LAS":{n:"Las Condes",z:"Corredor Oriente",v:"09:00-11:30",d:"Av. Las Condes 12751, Las Condes"},
  "45EST":{n:"Estoril",z:"Corredor Oriente",v:"09:00-12:00",d:"Estoril 585 Local 3, Las Condes"},
  "16PQA":{n:"Parque Arauco",z:"Corredor Oriente",v:"08:30-09:30",d:"Av. Kennedy 5413 Local 537, Las Condes"},
  "20CTC":{n:"Costanera Center",z:"Corredor Providencia",v:"08:30-09:30",d:"Av. Andrés Bello 2425 Local 253, Providencia"},
  "23PEÑ":{n:"Peñalolén",z:"Corredor Sur",v:"09:00-11:00",d:"Altos del Parque Sur 5800 Local 6, Peñalolén"},
  "34SMB":{n:"Simon Bolivar",z:"Corredor Providencia",v:"09:00-12:00",d:"Av. Simón Bolívar 4800, Ñuñoa"},
  "09LEO":{n:"Los Leones",z:"Corredor Providencia",v:"09:00-12:00",d:"Av. Los Leones 2572, Providencia"},
  "40LIL":{n:"Las Lilas",z:"Corredor Providencia",v:"09:00-12:00",d:"Eliodoro Yáñez 2831, Providencia"},
  "06MQH":{n:"Manquehue",z:"Corredor Oriente",v:"09:30-12:00",d:"Av. Manquehue Sur 665, Las Condes"},
  "22LGN":{n:"Laguna",z:"Corredor Norte",v:"09:00-10:00",d:"Av. Padre Sergio Correa 14500 Local 160, Colina"},
  "07CCR":{n:"Chicureo",z:"Corredor Norte",v:"09:00-12:00",d:"Av. Chicureo 3100 Local 10, Colina"},
  CLI:   {n:"Colina",z:"Corredor Norte",v:"09:00-12:00"},
  "18FLO":{n:"Florida",z:"Corredor Sur",v:"09:30-12:00",d:"Av. Gerónimo de Alderete 1800 Locales 7 y 8, La Florida"},
  "29CFL":{n:"Florida Center",z:"Corredor Sur",v:"08:30-09:30",d:"Av. Vicuña Mackenna Ote. 6100 Local 3100, La Florida"},
  "05LP": {n:"Luis Pasteur",z:"Corredor Sur",v:"09:00-12:00",d:"Av. Luis Pasteur 6420, Vitacura"},
  "01TPS":{n:"Trapenses",z:"Corredor Norte",v:"09:00-12:00",d:"Camino Los Trapenses 3023 Local 5, Lo Barnechea"},
  "13PIE":{n:"Pie Andino",z:"Corredor Norte",v:"09:00-12:00",d:"Av. Paseo Pie Andino 5855 Local 3A, Lo Barnechea"},
  "10TRQ":{n:"Tranque",z:"Corredor Norte",v:"09:30-12:00",d:"Manquehue Oriente 2030 Local 3, Lo Barnechea"},
  "49PTA":{n:"Puente Alto",z:"Corredor Sur",v:"08:30-09:30",d:"Los Toros 297 Local 1009, Puente Alto"},
  "30PHU":{n:"Padre Hurtado",z:"Corredor Oriente",v:"09:00-12:00",d:"Av. Padre Hurtado Norte 1161, Vitacura"},
  "21NUC":{n:"Nueva Costanera",z:"Corredor Sur",v:"09:00-12:00",d:"Av. Nueva Costanera 3889 Local 2, Vitacura"},
  "04PDG":{n:"Príncipe de Gales",z:"Corredor Sur",v:"09:00-12:00",d:"Príncipe de Gales 6161, La Reina"},
  "19SUB":{n:"Subcentro",z:"Corredor Oriente",v:"08:30-10:00",d:"Av. Apoquindo 4400 Locales 110 y 112, Las Condes"},
  "11ILC":{n:"Isabela Católica",z:"Corredor Oriente",v:"09:30-12:00",d:"Av. Américo Vespucio Sur 1463, Las Condes"},
  "48BRU":{n:"Las Brujas",z:"Corredor Sur",v:"09:00-12:00",d:"Carlos Silva Vildosola 9073 Local 64, La Reina"},
  "14PF": {n:"Pedro Fontova",z:"Corredor Poniente",v:"09:30-10:00",d:"Av. Pedro Fontova 6251, Huechuraba"},
  "03VIT":{n:"Vitacura",z:"Corredor Oriente",v:"09:00-12:00",d:"Av. Vitacura 4020 Local 10, Vitacura"},
  "52MUT":{n:"El MUT",z:"Corredor Oriente",v:"08:30-09:30",d:"Roger de Flor 2725, Las Condes"},
  "37VIN":{n:"Viña del Mar",z:"Costa",v:"09:30-11:30",d:"8 Norte 675, Viña del Mar"},
  "08RNC":{n:"Reñaca",z:"Costa",v:"09:30-12:00",d:"Av. Edmundo Eluchans 1850 Local 10, Reñaca"},
  "33CON":{n:"Concón",z:"Costa",v:"09:30-12:30",d:"Av. Blanca Estela 1560 Locales 8 y 9, Concón"},
  "43CUR":{n:"Curauma",z:"Costa",v:"09:30-13:00",d:"Boulevard 68 Local 1, Curauma, Valparaíso"},
  "54MPQ":{n:"Quilpué",z:"Costa",v:"09:30-12:00",d:"Diego Portales 822, Quilpué"},
  "39PSB":{n:"La Serena",z:"Región",v:"09:00-10:00",d:"Av. Balmaceda 2885 Local 133-136, La Serena"},
  "51SER":{n:"Serena 2",z:"Región",v:"09:00-10:30",d:"Av. Cuatro Esquinas 1617 Local 117-118, La Serena"},
  "27MCH":{n:"Machalí",z:"Región",v:"09:00-10:30",d:"San Juan 133, Machalí"},
  "31TLC":{n:"Talca",z:"Región",v:"09:00-16:00",d:"2 Norte 3435 Local 6-9, Talca"},
  "36CHL":{n:"Chillán",z:"Región",v:"09:00-10:00",d:"Av. Vicente Méndez 1545 Local 1000, Chillán"},
  "46TRE":{n:"Talcahuano",z:"Región",v:"08:30-09:30",d:"Av. Jorge Alessandri 3177 Local D106, Talcahuano"},
  "24SPP":{n:"San Pedro",z:"Región",v:"09:00-11:00",d:"Camino El Venado 1380 Local 2, San Pedro de la Paz"},
  "38SP2":{n:"San Pedro 2",z:"Región",v:"09:00-12:00",d:"Los Mañios 4455 Paseo San Pedro, San Pedro de la Paz"},
  "28TEM":{n:"Temuco",z:"Región",v:"09:00-13:00",d:"Av. Alemania 850 Local 3-4, Temuco"},
  "75PUC":{n:"Pucón",z:"Región",v:"09:30-11:00",d:"Pedro de Valdivia 333, Pucón"},
  "76PAN":{n:"Panguipulli",z:"Región",v:"10:30-11:30",d:"Av. Martínez de Rozas 430, Panguipulli"},
  "47PTV":{n:"Puerto Varas",z:"Región",v:"09:00-10:00",d:"Vicente Pérez Rosales 1285 Local 101-102, Puerto Varas"},
  "50PTM":{n:"Puerto Montt",z:"Región",v:"08:00-10:00",d:"Illapel 10 Local 111A, Puerto Montt"},
  "41ANA":{n:"Antofagasta",z:"Región",v:"09:00-10:00",d:"Av. Angamos 745 Local 1032, Antofagasta"},
  "42ANP":{n:"Antofagasta 2",z:"Región",v:"09:00-10:00",d:"Av. Pedro Aguirre Cerda 10578 Local 303, Antofagasta"},
  "53VAL":{n:"Valdivia",z:"Región",v:"09:00-10:00",d:"Errazuriz 1102 Local 1078, Valdivia"},
};

export const ALIAS: Record<string, string> = {
  // Variantes con tilde → código interno ASCII
  "PEÑ":"23PEÑ","PEñ":"23PEÑ","PEG":"23PEÑ",
  "VIÑ":"37VIN","VIñ":"37VIN",
  "RÑC":"08RNC","RñC":"08RNC",
  // Códigos cortos antiguos → nuevos códigos numéricos (retrocompatibilidad)
  "BNV":"32BNV","BN2":"35BN2","MAI":"17MAI","SCL":"02SCL","LAS":"12LAS",
  "EST":"45EST","PQA":"16PQA","CTC":"20CTC","PEN":"23PEÑ","SMB":"34SMB",
  "LEO":"09LEO","LIL":"40LIL","MQH":"06MQH","LGN":"22LGN","CCR":"07CCR",
  "FLO":"18FLO","CFL":"29CFL","LP":"05LP","TPS":"01TPS","PIE":"13PIE",
  "TRQ":"10TRQ","PTA":"49PTA","PHU":"30PHU","NUC":"21NUC","PDG":"04PDG",
  "SUB":"19SUB","ILC":"11ILC","BRU":"48BRU","PF":"14PF","VIT":"03VIT",
  "MUT":"52MUT","VIN":"37VIN","RNC":"08RNC","CON":"33CON","CUR":"43CUR",
  "MPQ":"54MPQ","PSB":"39PSB","SER":"51SER","MCH":"27MCH","TLC":"31TLC",
  "CHL":"36CHL","TRE":"46TRE","SPP":"24SPP","SP2":"38SP2","TEM":"28TEM",
  "PUC":"75PUC","PAN":"76PAN","PTV":"47PTV","PTM":"50PTM","ANA":"41ANA",
  "ANP":"42ANP","VAL":"53VAL",
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
  "37VIN":[-33.015089,-71.550552],
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
export const REGION_V           = new Set(['37VIN','08RNC','33CON']);
export const CORREDOR_AUTOPISTA = new Set(['43CUR','32BNV','35BN2']);

export const SID = '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
export const GMAPS_KEY = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
export const SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw0e4hjMDQWTzk1jOdxqYHXyOzTruVv1OYK4m9HczrPgfehYukesxcxDmys49fGVXlQ-g/exec';
