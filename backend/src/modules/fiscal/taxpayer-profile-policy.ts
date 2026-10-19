/** #774: candidate profile only; no legal classification is approved from client input. */
export type TaxpayerProfileDraftInput = Readonly<{
  effectiveFrom: string; effectiveTo?: string | null;
  jurisdiction: string; taxpayerCategory: string;
  activityCodes: readonly string[];
  sourceReference: string; sourceContentSha256: string;
}>;
const ISO_UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const SHA=/^[a-f0-9]{64}$/i;
const code=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,59}$/;
const fail=():never=>{throw new Error('TAXPAYER_PROFILE_DRAFT_INVALID');};
function validUtc(s:unknown):s is string {
  if(typeof s!=='string'||!ISO_UTC.test(s))return false;
  const d=new Date(s);
  return Number.isFinite(d.getTime())&&d.toISOString().replace(/\.000Z$/,'Z')===s.replace(/\.000Z$/,'Z');
}
function named(s:unknown,max:number){return typeof s==='string' && s.trim()===s && s.length>=3 && s.length<=max;}
export function prepareTaxpayerProfileDraft(
  input:TaxpayerProfileDraftInput,
  context:Readonly<{tenantId:string;userId:string;tenantRif:string}>,
  clock:Date=new Date()
){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     !context||!named(context.tenantId,128)||!named(context.userId,128)||
     typeof context.tenantRif!=='string'||!context.tenantRif.trim()||
     !(clock instanceof Date)||!Number.isFinite(clock.getTime()))fail();
  if(Object.keys(input).some(k=>!['effectiveFrom','effectiveTo','jurisdiction','taxpayerCategory','activityCodes','sourceReference','sourceContentSha256'].includes(k))||
    !validUtc(input.effectiveFrom)||
    (input.effectiveTo!=null&&(!validUtc(input.effectiveTo)||input.effectiveTo<=input.effectiveFrom))||
    !named(input.jurisdiction,120)||!named(input.taxpayerCategory,80)||
    !named(input.sourceReference,240)||
    typeof input.sourceContentSha256!=='string'||!SHA.test(input.sourceContentSha256)||
    !Array.isArray(input.activityCodes)||input.activityCodes.length<1||input.activityCodes.length>20||
    !input.activityCodes.every(x=>typeof x==='string'&&code.test(x))||
    new Set(input.activityCodes).size!==input.activityCodes.length)fail();
  return Object.freeze({
    tenantId:context.tenantId,createdBy:context.userId,rifSnapshot:context.tenantRif,
    effectiveFrom:new Date(input.effectiveFrom).toISOString(),
    effectiveTo:input.effectiveTo?new Date(input.effectiveTo).toISOString():null,
    jurisdiction:input.jurisdiction,taxpayerCategory:input.taxpayerCategory,
    activityCodes:Object.freeze([...input.activityCodes].sort()),
    sourceReference:input.sourceReference,
    sourceContentSha256:input.sourceContentSha256.toLowerCase(),
    capturedAt:clock.toISOString(),status:'DRAFT' as const
  });
}
