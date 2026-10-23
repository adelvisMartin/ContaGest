// @ts-check
/**
 * #849 Public *read projection* from an already tenant-scoped server catalog.
 * The source is NOT request.body and NOT the Product/pricing/tax authority.
 * No staff/clinical data, internal cost, benefits, resources or allocations.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INPUT_KEYS=new Set(['id','tenantId','categoryId','name','description','status',
  'visibility','version','modality','durationMinutes']);
const MODALITIES=new Set(['onsite','remote','hybrid']);
export class ServicePublicProjectionError extends Error {
  constructor(){super('SERVICE_PUBLIC_PROJECTION_INVALID');}
}
const denied=()=>{throw new ServicePublicProjectionError();};
function plain(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&Object.getPrototypeOf(value)===Object.prototype;
}
function validName(value,max){
  return typeof value==='string'&&value.length>=1&&value.length<=max&&
    value===value.trim()&&!/[\u0000-\u001f\u007f]/u.test(value);
}
/**
 * @param {{tenantId:string, rows:unknown}} input
 */
export function projectPublicServiceCatalog(input){
  if(!plain(input)||Object.keys(input).some(k=>!['tenantId','rows'].includes(k))||
    typeof input.tenantId!=='string'||!UUID.test(input.tenantId)||
    !Array.isArray(input.rows)||input.rows.length>100)denied();
  const ids=new Set();
  const output=[];
  for(let i=0;i<input.rows.length;i++){
    if(!Object.hasOwn(input.rows,i))denied();
    const row=input.rows[i];
    if(!plain(row)||Object.keys(row).some(k=>!INPUT_KEYS.has(k))||
      typeof row.tenantId!=='string'||row.tenantId!==input.tenantId||
      typeof row.id!=='string'||!UUID.test(row.id)||ids.has(row.id)||
      (row.categoryId!==null&&(typeof row.categoryId!=='string'||!UUID.test(row.categoryId)))||
      !validName(row.name,160)||
      (row.description!==null&&typeof row.description!=='string')||
      (typeof row.description==='string'&&row.description.length>600)||
      !['active','archived'].includes(row.status)||
      !['public','internal'].includes(row.visibility)||
      !Number.isSafeInteger(row.version)||row.version<1||
      !MODALITIES.has(row.modality)||!Number.isSafeInteger(row.durationMinutes)||
      row.durationMinutes<1||row.durationMinutes>2880)denied();
    ids.add(row.id);
    if(row.status!=='active'||row.visibility!=='public')continue;
    // Explicit allowlist: no Product price/tax, audit, staff, clinical data.
    output.push(Object.freeze({
      id:row.id,categoryId:row.categoryId,name:row.name,
      description:row.description,modality:row.modality,
      durationMinutes:row.durationMinutes,version:row.version
    }));
  }
  output.sort((a,b)=>a.name.localeCompare(b.name,'es')||a.id.localeCompare(b.id));
  return Object.freeze({tenantId:input.tenantId,services:Object.freeze(output),
    publicOnly:true,pricingProvided:false,availabilityProvided:false});
}
