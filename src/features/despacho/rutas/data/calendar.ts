export interface CalDia { rm: string[]; costa: string[]; fal: string[]; }

export const CAL_INICIAL: Record<string, CalDia> = {
  LU:{ rm:["MAI","CTC","MUT","PQA","TRQ","PEN","FLO","LAS","MQH","PHU","LP","LEO","SMB","ILC","LIL","SUB","NUC","SCL"], costa:["CUR","CON","RNC","VIN"], fal:["TRE","TEM","PUC","PTV","PTM","PSB","ANA","ANP"] },
  MA:{ rm:["BNV","BN2","PTA","CFL","PDG","TPS","PIE","BRU","VIT","SCL","EST","PHU","LGN","PF","CCR","MQH","LP","NUC"], costa:[], fal:["MCH","CHL","SPP","SP2","PAN","SER"] },
  MI:{ rm:["CTC","BNV","BN2","PTA","CFL","MAI","MUT","PQA","SUB","TPS","PIE","LGN","CCR","LIL"], costa:["CUR","CON","RNC","VIN"], fal:["TLC","TRE","PTV","PTM","PSB","ANA","ANP"] },
  JU:{ rm:["LP","MQH","LAS","NUC","LEO","SMB","PDG","ILC","FLO","VIT","SCL","EST","PHU","SUB","PEN","TRQ","BRU"], costa:[], fal:["CHL","SPP","SP2","TEM","PUC","SER"] },
  VI:{ rm:["CTC","BNV","BN2","PTA","CFL","MAI","MUT","PQA","TPS","PIE","LGN","CCR","PF"], costa:[], fal:["TLC","TRE","PAN","PTV","PTM","PSB"] },
  SA:{ rm:[], costa:[], fal:[] },
};

export const DNOM: Record<string, string> = {LU:"Lunes",MA:"Martes",MI:"Miércoles",JU:"Jueves",VI:"Viernes",SA:"Sábado"};
export const DCOL: Record<string, string> = {LU:"#007AFF",MA:"#34C759",MI:"#FF9500",JU:"#AF52DE",VI:"#FF2D55",SA:"#5AC8FA"};
