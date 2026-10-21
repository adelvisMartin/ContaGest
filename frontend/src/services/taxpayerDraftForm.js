// Client-side preflight only. The tenant, RIF, version, status and permission are server authority.
function dateUtc(value,label){
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d$/.test(value))throw new Error(`${label}: fecha inválida.`);
  const date=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error(`${label}: fecha inexistente.`);
  return `${value}T00:00:00Z`;
}
function named(value,label,max){
  if(typeof value!=='string'||value.trim().length<3||value.trim().length>max)throw new Error(`${label}: indique de 3 a ${max} caracteres.`);
  return value.trim();
}

export function buildTaxpayerDraftSubmission(form){
  const effectiveFrom=dateUtc(form.effectiveFrom,'Inicio de vigencia');
  const effectiveTo=form.effectiveTo?dateUtc(form.effectiveTo,'Fin de vigencia'):null;
  if(effectiveTo&&effectiveTo<=effectiveFrom)throw new Error('Fin de vigencia debe ser posterior al inicio.');
  const activityCodes=String(form.activityCodes||'').split(',').map((item)=>item.trim());
  if(activityCodes.length<1||activityCodes.length>20||
    !activityCodes.every((item)=>/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/.test(item))||
    new Set(activityCodes).size!==activityCodes.length){
    throw new Error('Las actividades deben ser códigos únicos y válidos, separados por coma.');
  }
  if(!/^[a-f0-9]{64}$/i.test(form.sourceContentSha256||''))throw new Error('Se requiere SHA-256 verificable de la fuente de respaldo.');
  return {
    effectiveFrom,effectiveTo,
    jurisdiction:named(form.jurisdiction,'Jurisdicción',120),
    taxpayerCategory:named(form.taxpayerCategory,'Categoría tributaria documentada',80),
    activityCodes,sourceReference:named(form.sourceReference,'Referencia documental',240),
    sourceContentSha256:form.sourceContentSha256.toLowerCase()
  };
}
