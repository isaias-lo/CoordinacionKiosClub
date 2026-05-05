export interface Vehiculo {
  p: string;
  c: number;
  b: number;
  t: string;
  tlbd: boolean;
  on: boolean;
  ch: string;
  porton: boolean | null;
  refrigerado: boolean;
  empresa: string;
}

export const FLOTA_INICIAL: Vehiculo[] = [
  {p:"TYKK42",c:10,b:20,t:"Camión grande",  tlbd:false,on:true, ch:"Juan Sepulveda",   porton:true, refrigerado:false,empresa:"Luis Fica"},
  {p:"VSDR91",c:10,b:20,t:"Camión grande",  tlbd:false,on:true, ch:"Frank Mora",       porton:true, refrigerado:false,empresa:"Luis Fica"},
  {p:"SPJP88",c:10,b:20,t:"Camión mediano", tlbd:false,on:true, ch:"Alex Uribe",       porton:null, refrigerado:false,empresa:""},
  {p:"PTFZ21",c:10,b:20,t:"Camión mediano", tlbd:false,on:true, ch:"Ronald Valenzuela",porton:null, refrigerado:false,empresa:""},
  {p:"TDCV15",c:10,b:20,t:"Por confirmar",  tlbd:false,on:true, ch:"Franco Espíndola", porton:null, refrigerado:false,empresa:""},
  {p:"TLBD53",c:3, b:6, t:"FurgónTLBD",     tlbd:true, on:false,ch:"Luis Fica",        porton:false,refrigerado:false,empresa:"Luis Fica"},
];
