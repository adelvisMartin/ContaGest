export const MAX_META_FUTURE_SKEW_MS=5*60*1000;
const UNIX_SECONDS=/^\d{1,12}$/;

export function normalizeMetaTimestamp(value:unknown,nowMs=Date.now()){
  const raw=String(value??'').trim();
  if(!UNIX_SECONDS.test(raw))return null;
  const seconds=Number(raw);
  if(!Number.isSafeInteger(seconds)||seconds<0)return null;
  const milliseconds=seconds*1000;
  if(!Number.isSafeInteger(milliseconds))return null;
  const now=Number(nowMs);
  if(!Number.isFinite(now))return null;
  if(milliseconds>now+MAX_META_FUTURE_SKEW_MS)return null;
  const date=new Date(milliseconds);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}

export function metaTimestampValid(value:unknown,nowMs=Date.now()){
  return normalizeMetaTimestamp(value,nowMs)!==null;
}
