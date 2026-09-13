import type { DocumentAuthority, DocumentClassification } from './document-engine.js';

export type ParsedRunner = {
  post?: string;
  horse?: string;
  jockey?: string;
  trainer?: string;
  weight?: string;
  owner?: string;
};

export type ParsedResultPosition = {
  position: number;
  post?: string;
  horse?: string;
};

export type ParsedRaceDocument = {
  track?: string;
  meetingDate?: string;
  raceNumber?: number;
  raceName?: string;
  raceTime?: string;
  distance?: string;
  surface?: string;
  runners?: ParsedRunner[];
  scratches?: Array<{ post?: string; horse?: string }>;
  result?: ParsedResultPosition[];
  tables?: string[][][];
};

function normalized(value:string){
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
}

function lines(text:string){
  return String(text||'').replace(/\r/g,'').split('\n').map((line)=>line.trim()).filter(Boolean).slice(0,5000);
}

function labelValue(rows:string[], labels:string[]){
  const names=labels.map((label)=>label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const re=new RegExp(`^(?:${names})\\s*[:\\-]\\s*(.+)$`,'i');
  for(const row of rows){const match=row.match(re);if(match?.[1]?.trim())return match[1].trim().slice(0,240);}
  return undefined;
}

function splitTableRow(row:string){
  return row.split(/\t+|\s{2,}/).map((cell)=>cell.trim()).filter(Boolean).slice(0,16);
}

export function extractTextTables(text:string){
  const result:string[][][]=[];let current:string[][]=[];
  const flush=()=>{if(current.length>=2)result.push(current.slice(0,100));current=[];};
  for(const row of String(text||'').replace(/\r/g,'').split('\n').slice(0,5000)){
    const cells=splitTableRow(row.trim());
    if(cells.length>=2)current.push(cells);else flush();
    if(result.length>=20)break;
  }
  flush();
  return result.slice(0,20);
}

function runnerFromKeyValue(row:string):ParsedRunner|null{
  const fields:Array<[keyof ParsedRunner,string[]]> = [
    ['post',['POST','PUESTO','NRO','NO','NUMERO']],
    ['horse',['EJEMPLAR','CABALLO','HORSE']],
    ['jockey',['JOCKEY']],
    ['trainer',['ENTRENADOR','TRAINER']],
    ['weight',['PESO','WEIGHT']],
    ['owner',['PROPIETARIO','OWNER']]
  ];
  const found:ParsedRunner={};
  for(let i=0;i<fields.length;i++){
    const [key,names]=fields[i];
    const allLabels=fields.flatMap(([,labels])=>labels).join('|');
    const re=new RegExp(`(?:${names.join('|')})\\s*[:\\-]\\s*(.+?)(?=\\s+(?:${allLabels})\\s*[:\\-]|$)`,'i');
    const match=row.match(re);if(match?.[1]?.trim())found[key]=match[1].trim().slice(0,180);
  }
  return Object.keys(found).length>=2?found:null;
}

function runnersFromTables(tables:string[][][]){
  const aliases:Record<keyof ParsedRunner,string[]>={
    post:['POST','PUESTO','NRO','NO','NUMERO'],horse:['EJEMPLAR','CABALLO','HORSE'],jockey:['JOCKEY'],trainer:['ENTRENADOR','TRAINER'],weight:['PESO','WEIGHT'],owner:['PROPIETARIO','OWNER']
  };
  for(const table of tables){
    const header=table[0].map(normalized);const mapping=new Map<number,keyof ParsedRunner>();
    header.forEach((cell,index)=>{for(const [field,names] of Object.entries(aliases) as Array<[keyof ParsedRunner,string[]]>)if(names.some((name)=>cell===name||cell.includes(name)))mapping.set(index,field);});
    if(![...mapping.values()].includes('horse')||mapping.size<2)continue;
    const runners:ParsedRunner[]=[];
    for(const row of table.slice(1)){
      const runner:ParsedRunner={};
      for(const [index,field] of mapping){const value=row[index]?.trim();if(value)runner[field]=value.slice(0,180);}
      if(runner.horse||runner.post)runners.push(runner);
      if(runners.length>=80)break;
    }
    if(runners.length)return runners;
  }
  return [];
}

function parseScratches(rows:string[]){
  const values:Array<{post?:string;horse?:string}>=[];
  for(const row of rows){
    const match=row.match(/^(?:RETIRADOS?|SCRATCH(?:ES)?|NO\s+CORRE)\s*[:\-]\s*(.+)$/i);if(!match)continue;
    for(const token of match[1].split(/[,;]+/).map((item)=>item.trim()).filter(Boolean)){
      const numbered=token.match(/^(\d{1,2})\s*[-.)]?\s*(.*)$/);const entry:{post?:string;horse?:string}={};
      if(numbered?.[1])entry.post=numbered[1];if(numbered?.[2]?.trim())entry.horse=numbered[2].trim().slice(0,180);else if(!numbered)entry.horse=token.slice(0,180);
      if(entry.post||entry.horse)values.push(entry);
    }
  }
  return values.slice(0,80);
}

function parseResult(rows:string[]){
  const values:ParsedResultPosition[]=[];
  for(const row of rows){
    const compact=row.match(/^(?:LLEGADA|ORDEN\s+DE\s+LLEGADA|RESULTADO|PIZARRA)\s*[:\-]\s*((?:\d{1,2}\s*[-,/]\s*)+\d{1,2})$/i);
    if(compact){compact[1].split(/\s*[-,/]\s*/).forEach((post,index)=>values.push({position:index+1,post}));continue;}
    const match=row.match(/^(\d{1,2})(?:RO|DO|TO|ER|ST|ND|RD|TH)?\s*[.)\-:]\s*(?:(\d{1,2})\s+)?(.+)$/i);
    if(match&&Number(match[1])<=30){const item:ParsedResultPosition={position:Number(match[1])};if(match[2])item.post=match[2];if(match[3]?.trim())item.horse=match[3].trim().slice(0,180);values.push(item);}
  }
  return values.slice(0,30);
}

export function parseHorseRacingDocument(text:string):ParsedRaceDocument{
  const rows=lines(text);const tables=extractTextTables(text);const parsed:ParsedRaceDocument={};
  const track=labelValue(rows,['HIPODROMO','HIPÓDROMO','TRACK','VENUE']);if(track)parsed.track=track;
  const meetingDate=labelValue(rows,['FECHA','MEETING DATE','DATE']);if(meetingDate)parsed.meetingDate=meetingDate;
  const raceTime=labelValue(rows,['HORA','TIME']);if(raceTime)parsed.raceTime=raceTime;
  const distance=labelValue(rows,['DISTANCIA','DISTANCE']);if(distance)parsed.distance=distance;
  const surface=labelValue(rows,['SUPERFICIE','SURFACE']);if(surface)parsed.surface=surface;
  for(const row of rows){
    const match=row.match(/^(?:CARRERA|RACE)\s*(?:N[º°O.]?\s*)?#?\s*(\d{1,2})(?:\s*[-:–—]\s*(.+))?$/i);
    if(match){parsed.raceNumber=Number(match[1]);if(match[2]?.trim())parsed.raceName=match[2].trim().slice(0,220);break;}
  }
  let runners=runnersFromTables(tables);
  if(!runners.length)runners=rows.map(runnerFromKeyValue).filter((value):value is ParsedRunner=>Boolean(value)).slice(0,80);
  if(runners.length)parsed.runners=runners;
  const scratches=parseScratches(rows);if(scratches.length)parsed.scratches=scratches;
  const result=parseResult(rows);if(result.length)parsed.result=result;
  if(tables.length)parsed.tables=tables;
  return parsed;
}

export function reconcileDocumentExtraction(input:{classification:DocumentClassification;authority:DocumentAuthority;confidence:number;parsed:ParsedRaceDocument}){
  return {
    evidenceType:'document' as const,
    classification:input.classification,
    authority:input.authority,
    confidence:input.confidence,
    financialAuthority:false as const,
    reviewRequired:input.classification==='UNKNOWN',
    autoSettlementAllowed:false as const,
    autoOfficialResultAllowed:false as const,
    officialResultCandidate:input.classification==='OFFICIAL_RESULT'&&input.authority==='official',
    context:{
      ...(input.parsed.track?{track:input.parsed.track}:{}),
      ...(input.parsed.meetingDate?{meetingDate:input.parsed.meetingDate}:{}),
      ...(input.parsed.raceNumber?{raceNumber:input.parsed.raceNumber}:{}),
      ...(input.parsed.raceName?{raceName:input.parsed.raceName}:{})
    }
  };
}
