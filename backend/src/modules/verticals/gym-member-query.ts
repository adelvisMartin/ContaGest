/** Boundary validation for read-only Gym member-scoped queries.
 * Does not authorize member access: tenant and RBAC checks remain server-side.
 */
export type GymMemberQuery = Readonly<{memberId:string;from?:string;to?:string}>;
export function parseGymMemberQuery(value:unknown, opts:{requireMember?:boolean;allowDates?:boolean}={}):GymMemberQuery {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('GYM_MEMBER_QUERY_INVALID');
  const proto=Object.getPrototypeOf(value);
  if(proto!==Object.prototype&&proto!==null)throw new TypeError('GYM_MEMBER_QUERY_INVALID');
  const record=value as Record<string,unknown>;
  const allowed=new Set(opts.allowDates?['memberId','from','to']:['memberId']);
  if(Object.keys(record).some(k=>!allowed.has(k)))throw new TypeError('GYM_MEMBER_QUERY_UNKNOWN_KEY');
  const get=(key:string)=>{
    const d=Object.getOwnPropertyDescriptor(record,key);
    if(!d)return undefined;
    if(!Object.prototype.hasOwnProperty.call(d,'value'))throw new TypeError('GYM_MEMBER_QUERY_INVALID');
    return d.value;
  };
  const rawMember=get('memberId');
  if(rawMember!==undefined&&typeof rawMember!=='string')throw new TypeError('GYM_MEMBER_QUERY_ID_INVALID');
  const memberId=rawMember===undefined?'':rawMember as string;
  if(memberId.length>128||memberId!==memberId.trim()||(memberId!==''&&memberId.length<10)||
    (opts.requireMember&&memberId===''))throw new TypeError('GYM_MEMBER_QUERY_ID_INVALID');
  const result:{memberId:string;from?:string;to?:string}={memberId};
  if(opts.allowDates){
    for(const key of ['from','to'] as const){
      const val=get(key);
      if(val===undefined||val==='')continue;
      if(typeof val!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(val))
        throw new TypeError('GYM_MEMBER_QUERY_DATE_INVALID');
      result[key]=val;
    }
  }
  return Object.freeze(result);
}
