/** #801: bounded, unambiguous inputs to the existing tenant-owned agenda query. */
export function parseCareAppointmentReadWindow(
  query: unknown, nowMs: number = Date.now()
): {from:string; to:string; type:string} {
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      !Number.isFinite(nowMs)) throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
  // The query parser may provide an object with inherited properties or
  // getters; never invoke user-controlled accessors in a clinical filter.
  const keys=['from','to','type'] as const;
  const descriptors=Object.getOwnPropertyDescriptors(query);
  if(Reflect.ownKeys(query).some(key=>typeof key!=='string'||!keys.includes(key as typeof keys[number]))||
     keys.some(key=>(key in query&&!Object.hasOwn(query,key))||
       (Object.hasOwn(descriptors,key)&&!Object.hasOwn(descriptors[key],'value')))){
    throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
  }
  const iso=(input: unknown, fallback: string) => {
    if(input===undefined) return fallback;
    if(typeof input!=='string'||input.length>40)throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
    const dateOnly=/^\d{4}-\d{2}-\d{2}$/.test(input);
    const utc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input);
    if(!dateOnly&&!utc)throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
    const millis=Date.parse(dateOnly?input+'T00:00:00.000Z':input);
    if(!Number.isFinite(millis))throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
    const canonical=new Date(millis).toISOString();
    if(dateOnly?canonical.slice(0,10)!==input:
       canonical.slice(0,19)!==input.slice(0,19))throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
    return canonical;
  };
  const from=iso(descriptors.from?.value,new Date(nowMs-86400000).toISOString());
  const to=iso(descriptors.to?.value,new Date(nowMs+90*86400000).toISOString());
  if(Date.parse(to)<Date.parse(from)||Date.parse(to)-Date.parse(from)>366*86400000) {
    throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
  }
  const rawType=descriptors.type?.value===undefined?'':descriptors.type.value;
  if(typeof rawType!=='string'||rawType.length>120||
     /[\u0000-\u001f\u007f]/.test(rawType))throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
  return {from,to,type:rawType.trim()};
}
