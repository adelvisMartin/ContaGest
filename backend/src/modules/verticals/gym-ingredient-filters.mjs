/** #795 Gym ingredient query: reject invalid boolean casts, oversized filters
 * and ambiguous Express query shapes before touching tenant-owned SQL.
 */
const denied=()=>{throw new TypeError('GYM_INGREDIENT_FILTER_INVALID');};

export function parseGymIngredientFilters(input){
  if(!input||typeof input!=='object'||Array.isArray(input))denied();
  const keys=new Set(['q','category','active','take','skip']);
  if(Object.keys(input).some(key=>!keys.has(key)))denied();
  const text=(key,max)=>{
    const value=input[key];
    if(value===undefined)return '';
    if(typeof value!=='string'||value.length>max||
       /[\u0000-\u001f\u007f]/u.test(value))denied();
    return value.trim();
  };
  const positiveInt=(key,defaultValue,min,max)=>{
    const value=input[key];
    if(value===undefined)return defaultValue;
    if(typeof value!=='string'||!/^(0|[1-9][0-9]*)$/.test(value))denied();
    const parsed=Number(value);
    if(!Number.isSafeInteger(parsed)||parsed<min||parsed>max)denied();
    return parsed;
  };
  const q=text('q',120),category=text('category',120),active=text('active',5);
  if(!['','true','false'].includes(active))denied();
  return Object.freeze({
    q,category,active,
    take:positiveInt('take',1000,1,1000),
    skip:positiveInt('skip',0,0,100000)
  });
}
