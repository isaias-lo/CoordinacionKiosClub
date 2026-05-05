export interface TiendaInfo { n: string; z: string; v: string; activo?: boolean; corredor?: string; _parada?: boolean; _tipo?: string; _desc?: string; }

export const TIENDAS_INICIAL: Record<string, TiendaInfo> = {
  BNV:{n:"Buenaventura",z:"Corredor Poniente",v:"09:00-12:00"},
  BN2:{n:"Buenaventura 2",z:"Corredor Poniente",v:"09:00-12:00"},
  MAI:{n:"Maipú",z:"Corredor Poniente",v:"08:30-09:30"},
  SCL:{n:"San Carlos",z:"Corredor Oriente",v:"09:00-12:00"},
  LAS:{n:"Las Condes",z:"Corredor Oriente",v:"09:00-11:30"},
  EST:{n:"Estoril",z:"Corredor Oriente",v:"09:00-12:00"},
  PQA:{n:"Parque Arauco",z:"Corredor Oriente",v:"08:30-09:30"},
  CTC:{n:"Costanera Center",z:"Corredor Providencia",v:"08:30-09:30"},
  PEN:{n:"Peñalolén",z:"Corredor Sur",v:"09:00-11:00"},
  SMB:{n:"Simon Bolivar",z:"Corredor Providencia",v:"09:00-12:00"},
  LEO:{n:"Los Leones",z:"Corredor Providencia",v:"09:00-12:00"},
  LIL:{n:"Las Lilas",z:"Corredor Providencia",v:"09:00-12:00"},
  MQH:{n:"Manquehue",z:"Corredor Oriente",v:"09:30-12:00"},
  LGN:{n:"Laguna",z:"Corredor Norte",v:"09:00-10:00"},
  CCR:{n:"Chicureo",z:"Corredor Norte",v:"09:00-12:00"},
  CLI:{n:"Colina",z:"Corredor Norte",v:"09:00-12:00"},
  FLO:{n:"Florida",z:"Corredor Sur",v:"09:30-12:00"},
  CFL:{n:"Florida Center",z:"Corredor Sur",v:"08:30-09:30"},
  LP: {n:"Luis Pasteur",z:"Corredor Sur",v:"09:00-12:00"},
  TPS:{n:"Trapenses",z:"Corredor Norte",v:"09:00-12:00"},
  PIE:{n:"Pie Andino",z:"Corredor Norte",v:"09:00-12:00"},
  TRQ:{n:"Tranque",z:"Corredor Norte",v:"09:30-12:00"},
  PTA:{n:"Puente Alto",z:"Corredor Sur",v:"08:30-09:30"},
  PHU:{n:"Padre Hurtado",z:"Corredor Oriente",v:"09:00-12:00"},
  NUC:{n:"Nueva Costanera",z:"Corredor Sur",v:"09:00-12:00"},
  PDG:{n:"Príncipe de Gales",z:"Corredor Sur",v:"09:00-12:00"},
  SUB:{n:"Subcentro",z:"Corredor Oriente",v:"08:30-10:00"},
  ILC:{n:"Isabela Católica",z:"Corredor Oriente",v:"09:30-12:00"},
  BRU:{n:"Las Brujas",z:"Corredor Sur",v:"09:00-12:00"},
  PF: {n:"Pedro Fontova",z:"Corredor Poniente",v:"09:30-10:00"},
  VIT:{n:"Vitacura",z:"Corredor Oriente",v:"09:00-12:00"},
  VIN:{n:"Viña del Mar",z:"Costa",v:"09:30-11:30"},
  RNC:{n:"Reñaca",z:"Costa",v:"09:30-12:00"},
  CON:{n:"Concón",z:"Costa",v:"09:30-12:30"},
  CUR:{n:"Curauma",z:"Costa",v:"09:30-13:00"},
  PSB:{n:"La Serena",z:"Región",v:"09:00-10:00"},
  SER:{n:"Serena 2",z:"Región",v:"09:00-10:30"},
  MCH:{n:"Machalí",z:"Región",v:"09:00-10:30"},
  TLC:{n:"Talca",z:"Región",v:"09:00-16:00"},
  CHL:{n:"Chillán",z:"Región",v:"09:00-10:00"},
  TRE:{n:"Talcahuano",z:"Región",v:"08:30-09:30"},
  SPP:{n:"San Pedro",z:"Región",v:"09:00-11:00"},
  SP2:{n:"San Pedro 2",z:"Región",v:"09:00-12:00"},
  TEM:{n:"Temuco",z:"Región",v:"09:00-13:00"},
  PUC:{n:"Pucón",z:"Región",v:"09:30-11:00"},
  PAN:{n:"Panguipulli",z:"Región",v:"10:30-11:30"},
  PTV:{n:"Puerto Varas",z:"Región",v:"09:00-10:00"},
  PTM:{n:"Puerto Montt",z:"Región",v:"08:00-10:00"},
  ANA:{n:"Antofagasta",z:"Región",v:"09:00-10:00"},
  MUT:{n:"El MUT",z:"Corredor Oriente",v:"08:30-09:30"},
  ANP:{n:"Antofagasta 2",z:"Región",v:"09:00-10:00"},
};

export const ALIAS: Record<string, string> = {
  "PEÑ":"PEN","PEG":"PEN","PEñ":"PEN",
  "VIÑ":"VIN","VIñ":"VIN",
  "RÑC":"RNC","RñC":"RNC",
};

export const GPS_INICIAL: Record<string, [number, number]> = {
  BNV:[-33.331041,-70.702658], BN2:[-33.331041,-70.702658],
  MAI:[-33.481094,-70.751884],
  SCL:[-33.391885,-70.506455], LAS:[-33.371694,-70.513811], EST:[-33.385302,-70.531448],
  PQA:[-33.401315,-70.578471], CTC:[-33.415851,-70.607317],
  PEN:[-33.497676,-70.555504], SMB:[-33.446862,-70.580861],
  LEO:[-33.442166,-70.599243], LIL:[-33.428452,-70.595663],
  MQH:[-33.412495,-70.566325],
  LGN:[-33.277007,-70.627228], CCR:[-33.286836,-70.669258], CLI:[-33.195,-70.6667],
  FLO:[-33.527866,-70.575826], CFL:[-33.511099,-70.605902],
  LP: [-33.382757,-70.573066], TPS:[-33.347548,-70.542238],
  PIE:[-33.324073,-70.538501], TRQ:[-33.36159,-70.544865],
  PTA:[-33.569135,-70.580537],
  PHU:[-33.387667,-70.54889],
  NUC:[-33.398684,-70.597442],
  PDG:[-33.43842,-70.568825],
  SUB:[-33.413644,-70.583988], ILC:[-33.426214,-70.576995],
  BRU:[-33.439732,-70.536024],
  PF: [-33.366405,-70.670044],
  VIT:[-33.399499,-70.591214],
  MUT:[-33.417053,-70.601451],
  VIN:[-33.015089,-71.550552],
  RNC:[-32.958038,-71.543483],
  CON:[-32.941688,-71.545593],
  CUR:[-33.123043,-71.561635],
  PSB:[-29.925456,-71.257794], SER:[-29.935374,-71.239229],
  MCH:[-34.17651,-70.697448],
  TLC:[-35.431966,-71.626374],
  CHL:[-36.588538,-72.077305],
  TRE:[-36.791774,-73.066489], SPP:[-36.852911,-73.093466], SP2:[-36.859675,-73.132658],
  TEM:[-38.73386,-72.61493],   PUC:[-39.273563,-71.976928], PAN:[-39.643454,-72.328784],
  PTV:[-41.327169,-72.965739], PTM:[-41.47213,-72.936349],
  ANA:[-23.667609,-70.405026], ANP:[-23.566051,-70.390208],
};

export const CD_INICIAL: [number, number] = [-33.412581, -70.632438];

export const COLS = ['#D42B2B','#1B2A6B','#34C759','#FF9500','#8b5cf6','#22d3ee','#f97316','#ec4899'];

export const PROVIDENCIA        = new Set(['LEO','LIL','CTC','MUT']);
export const REGION_V           = new Set(['VIN','RNC','CON']);
export const CORREDOR_AUTOPISTA = new Set(['CUR','BNV','BN2']);

export const SID = '16UHW1UoeX1egZ5WK2CzbaVYy6_INyIqTY3cxdkySuHU';
export const GMAPS_KEY = process.env.NEXT_PUBLIC_GMAPS_KEY || '';
export const SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw0e4hjMDQWTzk1jOdxqYHXyOzTruVv1OYK4m9HczrPgfehYukesxcxDmys49fGVXlQ-g/exec';
