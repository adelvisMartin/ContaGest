export const V182_TRUTH_STATES=new Set(['PASS','FAIL','BLOCKED','NOT_EXECUTED']);

export function evaluateServedMobileRelease({candidateSha,buildInfo,serviceWorker,installUpgrade,routes}){
  const reasons=[];
  const expected=String(candidateSha||'').trim().toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(expected))reasons.push('CANDIDATE_SHA_INVALID');
  if(!buildInfo)reasons.push('BUILD_INFO_NOT_EXECUTED');
  else {
    if(buildInfo.product!=='contagest-erp')reasons.push('BUILD_PRODUCT_MISMATCH');
    if(buildInfo.bound!==true)reasons.push('BUILD_IDENTITY_UNBOUND');
    if(String(buildInfo.candidateSha||'').toLowerCase()!==expected)reasons.push('SERVED_SHA_MISMATCH');
  }
  if(serviceWorker?.status!=='PASS')reasons.push(`SERVICE_WORKER_${serviceWorker?.status||'NOT_EXECUTED'}`);
  if(installUpgrade?.status!=='PASS')reasons.push(`PWA_INSTALL_UPGRADE_${installUpgrade?.status||'NOT_EXECUTED'}`);
  const rows=Array.isArray(routes)?routes:[];
  if(rows.length!==58)reasons.push('ROUTE_COVERAGE_INCOMPLETE');
  for(const row of rows){
    if(row.status!=='PASS')reasons.push(`ROUTE_${row.route||'UNKNOWN'}_${row.status||'NOT_EXECUTED'}`);
    const widths=Array.isArray(row.widths)?row.widths:[];
    for(const width of [360,390,430])if(!widths.includes(width))reasons.push(`ROUTE_${row.route||'UNKNOWN'}_WIDTH_${width}_MISSING`);
  }
  let verdict='PASS';
  if(reasons.some((reason)=>reason.includes('FAIL')||reason.includes('MISMATCH')||reason.includes('INVALID')||reason.includes('UNBOUND')))verdict='FAIL';
  else if(reasons.some((reason)=>reason.includes('BLOCKED')))verdict='BLOCKED';
  else if(reasons.length)verdict='NOT_EXECUTED';
  return {issue:182,candidateSha:expected,verdict,reasons:[...new Set(reasons)]};
}
