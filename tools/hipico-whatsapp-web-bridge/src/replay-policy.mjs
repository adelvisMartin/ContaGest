const ALLOWED_REPLAY_ARGS=new Set([
  'dir','kind','destination','limit','execute','parser','from','to','expected-count','confirm'
]);
const ISO_TIMESTAMP_WITH_ZONE=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

function normalizedReplayInstant(value,label){
  if(value===undefined||value===null||value==='')return null;
  const raw=String(value).trim();
  const match=raw.match(ISO_TIMESTAMP_WITH_ZONE);
  if(!match)throw new Error(`REPLAY_${label}_INVALID`);
  const[,yearRaw,monthRaw,dayRaw,hourRaw,minuteRaw,secondRaw,,zone]=match;
  const year=Number(yearRaw),month=Number(monthRaw),day=Number(dayRaw);
  const hour=Number(hourRaw),minute=Number(minuteRaw),second=Number(secondRaw);
  if(month<1||month>12||hour>23||minute>59||second>59)throw new Error(`REPLAY_${label}_INVALID`);
  const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();
  if(day<1||day>daysInMonth)throw new Error(`REPLAY_${label}_INVALID`);
  if(zone!=='Z'){
    const offsetHour=Number(zone.slice(1,3));
    const offsetMinute=Number(zone.slice(4,6));
    if(offsetHour>14||offsetMinute>59||(offsetHour===14&&offsetMinute!==0))throw new Error(`REPLAY_${label}_INVALID`);
  }
  const parsed=Date.parse(raw);
  if(!Number.isFinite(parsed))throw new Error(`REPLAY_${label}_INVALID`);
  return new Date(parsed).toISOString();
}

function parseExecute(value){
  if(value===undefined)return false;
  if(value==='true')return true;
  if(value==='false')return false;
  throw new Error('REPLAY_EXECUTE_INVALID');
}

export function normalizeReplayArgs(args={}){
  for(const key of Object.keys(args)){
    if(!ALLOWED_REPLAY_ARGS.has(key))throw new Error(`REPLAY_UNKNOWN_ARGUMENT:${key}`);
  }
  const rawLimit=args.limit===undefined?100:Number(args.limit);
  if(!Number.isInteger(rawLimit)||rawLimit<1||rawLimit>1000)throw new Error('REPLAY_LIMIT_INVALID');
  const from=normalizedReplayInstant(args.from,'FROM');
  const to=normalizedReplayInstant(args.to,'TO');
  if(from&&to&&Date.parse(from)>Date.parse(to))throw new Error('REPLAY_RANGE_INVALID');
  return{
    ...args,
    limit:rawLimit,
    execute:parseExecute(args.execute),
    from,
    to
  };
}

export const __test__={normalizedReplayInstant,parseExecute,ALLOWED_REPLAY_ARGS};
