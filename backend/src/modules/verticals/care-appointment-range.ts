/** #801: bounded, unambiguous inputs to the existing tenant-owned agenda query. */
export function parseCareAppointmentReadWindow(
  query: unknown, nowMs: number = Date.now()
): {from:string; to:string; type:string} {
  if (!query || typeof query !== 'object' || Array.isArray(query) ||
      !Number.isFinite(nowMs)) throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
  const values=query as Record<string,unknown>;
  if (Object.keys(values).some(key=>!['from','to','type'].includes(key))) {
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
  const from=iso(values.from,new Date(nowMs-86400000).toISOString());
  const to=iso(values.to,new Date(nowMs+90*86400000).toISOString());
  if(Date.parse(to)<Date.parse(from)||Date.parse(to)-Date.parse(from)>366*86400000) {
    throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
  }
  const rawType=values.type===undefined?'':values.type;
  if(typeof rawType!=='string'||rawType.length>120||
     /[\u0000-\u001f\u007f]/.test(rawType))throw new Error('CARE_APPOINTMENT_RANGE_INVALID');
  return {from,to,type:rawType.trim()};
}
