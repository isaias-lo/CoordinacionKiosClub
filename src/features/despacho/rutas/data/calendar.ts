export interface CalDia { rm: string[]; costa: string[]; fal: string[]; }

export const CAL_INICIAL: Record<string, CalDia> = {
  LU:{ rm:["18FLO","23PEN","11ILC","34SMB","09LEO","40LIL","21NUC","05LP","30PHU","02SCL","12LAS","06MQH","19SUB","20CTC","52MUT","16PQA","17MAI"], costa:["43CUR","33CON","08RNC","37VIN","54MPQ"], fal:["46TRE","28TEM","75PUC","53VAL","47PTV","50PTM","39PSB","41ANA","42ANP"] },
  MA:{ rm:["49PTA","29CFL","01TPS","14PIE","10TRQ","48BRU","04PDG","21NUC","05LP","30PHU","03VIT","02SCL","45EST","06MQH","32BNV","35BN2","14PF","22LGN","07CCR"], costa:[], fal:["27MCH","36CHL","24SPP","38SP2","76PAN","51SER"] },
  MI:{ rm:["49PTA","29CFL","01TPS","14PIE","40LIL","19SUB","20CTC","52MUT","16PQA","17MAI","32BNV","35BN2","22LGN","07CCR"], costa:["43CUR","33CON","08RNC","37VIN","54MPQ"], fal:["31TLC","46TRE","53VAL","47PTV","50PTM","39PSB","41ANA","42ANP"] },
  JU:{ rm:["18FLO","23PEN","48BRU","04PDG","11ILC","34SMB","09LEO","21NUC","05LP","30PHU","03VIT","02SCL","45EST","12LAS","06MQH","19SUB"], costa:[], fal:["36CHL","24SPP","38SP2","28TEM","75PUC","51SER"] },
  VI:{ rm:["49PTA","29CFL","01TPS","14PIE","10TRQ","20CTC","52MUT","16PQA","17MAI","32BNV","35BN2","14PF","22LGN","07CCR"], costa:[], fal:["31TLC","46TRE","76PAN","47PTV","50PTM","39PSB"] },
  SA:{ rm:[], costa:[], fal:[] },
};

export const DNOM: Record<string, string> = {LU:"Lunes",MA:"Martes",MI:"Miércoles",JU:"Jueves",VI:"Viernes",SA:"Sábado"};
export const DCOL: Record<string, string> = {LU:"#007AFF",MA:"#34C759",MI:"#FF9500",JU:"#AF52DE",VI:"#FF2D55",SA:"#5AC8FA"};
