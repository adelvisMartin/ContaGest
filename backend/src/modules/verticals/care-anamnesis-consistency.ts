/** #800: deterministic contradictions/duplicates for a single encounter snapshot. */
export type CareAnamnesisConsistencyInput = {
  allergyReview: 'unreviewed'|'none_reported'|'reported';
  allergies: {substance:string}[];
  medications: {name:string}[];
  conditions: {name:string}[];
};
export function careAnamnesisConsistencyIssues(input: CareAnamnesisConsistencyInput) {
  const errors: Array<{path:(string|number)[];message:string}> = [];
  if (input.allergyReview==='reported' && input.allergies.length===0) {
    errors.push({path:['allergyReview'],message:'Una declaración de alergias requiere al menos una sustancia.'});
  }
  if (input.allergyReview!=='reported' && input.allergies.length>0) {
    errors.push({path:['allergyReview'],message:'Revisa la declaración de alergias antes de registrar sustancias.'});
  }
  for (const [key,field] of [
    ['allergies','substance'],['medications','name'],['conditions','name']
  ] as const) {
    const seen=new Set<string>();
    input[key].forEach((entry,index)=>{
      const label='substance' in entry ? entry.substance : entry.name;
      const name=label.normalize('NFKC').trim().toLocaleLowerCase('es');
      if (seen.has(name))errors.push({path:[key,index,field],message:'No repitas una misma entrada en la anamnesis.'});
      seen.add(name);
    });
  }
  return errors;
}
