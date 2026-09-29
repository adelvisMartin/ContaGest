const DATE_RE=/^\d{4}-\d{2}-\d{2}/;
const TIME_RE=/^(\d{2}:\d{2})/;

export function normalizeUiError(error={}){
  const payload=error?.response?.data||error?.data||error||{};
  const status=Number(error?.status||error?.response?.status||payload?.status||0)||undefined;
  const message=String(payload?.message||error?.message||'No se pudo completar la operación');
  const code=payload?.code?String(payload.code):undefined;
  const field=payload?.field?String(payload.field):undefined;
  const correlationId=payload?.correlationId?String(payload.correlationId):undefined;
  const scope=field?'field':status===422?'form':'global';
  return {message,code,field,correlationId,status,scope};
}

export function normalizeOptionalFormValue(value,{emptyAs=''}={}){
  if(value===undefined)return undefined;
  if(value===null)return null;
  if(value===''){
    if(emptyAs==='absent')return undefined;
    if(emptyAs===null)return null;
    return '';
  }
  return value;
}

export function normalizeDateValue(value=''){
  const match=String(value||'').match(DATE_RE);
  return match?.[0]||'';
}

export function normalizeTimeValue(value=''){
  const match=String(value||'').match(TIME_RE);
  return match?.[1]||'';
}

export function serializeDateRange(range={}){
  return {from:normalizeDateValue(range?.from),to:normalizeDateValue(range?.to)};
}
