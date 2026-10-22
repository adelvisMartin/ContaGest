/** #751/#775/#776: no tax document may borrow a rule from another tax family. */
const reject = ():never=>{throw new Error('FISCAL_EVENT_RULE_FAMILY_MISMATCH');};
const PREFIX:Readonly<Record<string,string>>=Object.freeze({
  iva:'iva',islr:'islr',retiva:'ret_iva',igtf:'igtf',municipal:'municipal'
});
const classOf=(key:string)=>key.toLowerCase().split(/[.:]/,1)[0];
export function assertFiscalDocumentRuleFamily(input:Readonly<{
  module:string; kind:string; period:string; effectiveAt:Date;
  explicitEffectiveAt:boolean; ruleKeys:readonly string[];
}>) {
  if(!input||typeof input.module!=='string'||typeof input.kind!=='string'||
    typeof input.period!=='string'||!/^(20|21)\d{2}-(0[1-9]|1[0-2])$/.test(input.period)||
    !(input.effectiveAt instanceof Date)||!Number.isFinite(input.effectiveAt.getTime())||
    !Array.isArray(input.ruleKeys)||input.ruleKeys.length<1||input.ruleKeys.length>20||
    input.ruleKeys.some(k=>typeof k!=='string'||!/^[a-z0-9][a-z0-9._:-]{1,79}$/i.test(k))||
    new Set(input.ruleKeys).size!==input.ruleKeys.length)reject();
  const family=PREFIX[input.module];
  const required=input.kind==='withholding'||Boolean(family);
  if(required) {
    if(!input.explicitEffectiveAt ||
      input.effectiveAt.toISOString().slice(0,7)!==input.period)reject();
    if(family && !input.ruleKeys.some(key=>classOf(key)===family))reject();
    if(input.kind==='withholding' &&
       !input.ruleKeys.some(key=>['ret_iva','islr'].includes(classOf(key))))reject();
    if(input.ruleKeys.some(key=>!Object.values(PREFIX).includes(classOf(key))))reject();
  }
}
