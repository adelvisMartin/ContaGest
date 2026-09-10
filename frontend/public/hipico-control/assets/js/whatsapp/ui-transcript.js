const TIME_RE=/^\d{1,2}:\d{2}\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)$/i;
const PHONE_RE=/^\+?\d[\d\s()\-]{6,}\d$/;
const DAY_RE=/^(?:hoy|ayer|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)$/i;
const FORWARDED_RE=/^reenviado$/i;
const STICKER_RE=/^sticker(?:\s+sin etiquetas)?$/i;
const FILE_RE=/^(.+?)\.([a-z0-9]{2,8})$/i;
const FILE_META_RE=/^(\d+)\s+p[aá]ginas?\s*[•·]\s*([a-z0-9]+)\s*[•·]\s*([\d.,]+)\s*(kb|mb|gb)$/i;

const clean=(value)=>String(value||'').trim();
const phoneDigits=(value)=>clean(value).replace(/\D/g,'');
const senderKey=(sender,phone)=>phoneDigits(phone)||clean(sender).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ');

function documentInfo(filename){
  const match=clean(filename).match(FILE_RE);
  if(!match)return null;
  const [,base,extension]=match;
  const dateMatch=base.match(/(\d{2})(\d{2})(\d{4})$/);
  return {kind:'document',fileName:clean(filename),extension:extension.toLowerCase(),code:dateMatch?base.slice(0,-8):base,embeddedDate:dateMatch?`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`:''};
}

export function looksLikeWhatsAppUiTranscript(input){
  const lines=String(input||'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
  const standaloneTimes=lines.filter((line)=>TIME_RE.test(line)).length;
  const phones=lines.filter((line)=>PHONE_RE.test(line)).length;
  return standaloneTimes>=2&&phones>=1;
}

export function parseWhatsAppUiTranscript(input){
  const lines=String(input||'').replace(/\r/g,'').split('\n').map(clean).filter(Boolean);
  const messages=[];
  let dayLabel='';
  let lastIdentity={sender:'Sin identificar',phone:''};
  let pending=null;
  const ensurePending=()=>{if(!pending)pending={...lastIdentity,dayLabel,forwarded:false,body:[],media:null};return pending;};
  const pushMessage=(time='',forcedKind='')=>{
    if(!pending)return;
    const text=pending.body.join('\n').trim();
    const kind=forcedKind||pending.media?.kind||(STICKER_RE.test(text)?'sticker':'text');
    if(!text&&!pending.media){pending=null;return;}
    messages.push({id:`MSG-${messages.length+1}-UI`,time,date:'',dateLabel:pending.dayLabel||dayLabel,timestamp:null,sender:pending.sender||'Sin identificar',senderKey:senderKey(pending.sender,pending.phone),phone:pending.phone||'',text,sourceFormat:'whatsapp-ui-copy',forwarded:Boolean(pending.forwarded),systemKind:kind==='text'?'':kind,media:pending.media||null});
    pending=null;
  };
  const pushNoise=(text,reason)=>messages.push({id:`MSG-${messages.length+1}-UI-NOISE`,time:TIME_RE.test(text)?text:'',date:'',dateLabel:dayLabel,timestamp:null,sender:lastIdentity.sender||'Sin identificar',senderKey:senderKey(lastIdentity.sender,lastIdentity.phone),phone:lastIdentity.phone||'',text,sourceFormat:'whatsapp-ui-copy',forwarded:false,systemKind:'noise',media:null,noiseReason:reason});

  for(let index=0;index<lines.length;index+=1){
    const line=lines[index];
    const next=lines[index+1]||'';
    if(DAY_RE.test(line)){pushMessage();dayLabel=line;continue;}
    if(next&&PHONE_RE.test(next)&&!TIME_RE.test(line)){pushMessage();lastIdentity={sender:line,phone:next};index+=1;continue;}
    if(FORWARDED_RE.test(line)){ensurePending().forwarded=true;continue;}
    if(TIME_RE.test(line)){if(pending&&(pending.body.length||pending.media))pushMessage(line);else pushNoise(line,'orphan_time');continue;}
    if(STICKER_RE.test(line)){const target=ensurePending();target.body=[line];target.media={kind:'sticker'};continue;}
    const metadata=line.match(FILE_META_RE);
    if(metadata){const target=ensurePending();if(target.media){target.media.pages=Number(metadata[1]);target.media.mediaType=metadata[2].toUpperCase();target.media.size=Number(metadata[3].replace(',','.'));target.media.sizeUnit=metadata[4].toUpperCase();}else target.body.push(line);continue;}
    const document=documentInfo(line);
    if(document){const target=ensurePending();target.media=document;target.body=[line];continue;}
    ensurePending().body.push(line);
  }
  pushMessage();
  return {sourceFormat:'whatsapp-ui-copy',messages};
}

export const __test__=Object.freeze({TIME_RE,PHONE_RE,DAY_RE,FILE_META_RE,documentInfo});
