/** #747: prevent ambiguous surface history before a dental encounter is recorded. */
export function dentalChartConsistencyIssues(input: {
  tooth?: string | null;
  odontogram: { tooth: string; surfaces: string[] };
}): Array<{path:(string|number)[]; message:string}> {
  const issues: Array<{path:(string|number)[]; message:string}> = [];
  const selected = input.odontogram.tooth;
  if (input.tooth && input.tooth.trim() !== selected) {
    issues.push({path:['tooth'],message:'La pieza principal debe coincidir con la del odontograma.'});
  }
  const seen = new Set<string>();
  input.odontogram.surfaces.forEach((surface,index)=>{
    if (seen.has(surface)) {
      issues.push({path:['odontogram','surfaces',index],
        message:'Una superficie sólo puede figurar una vez por registro.'});
    }
    seen.add(surface);
  });
  return issues;
}
