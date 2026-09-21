const STATUSES=Object.freeze(['PASS','FAIL','BLOCKED','NOT_EXECUTED']);

function normalizeStatus(value){
  const normalized=String(value||'NOT_EXECUTED').trim().toUpperCase();
  return STATUSES.includes(normalized)?normalized:'FAIL';
}

export function combineAuthRecoveryGate(jobStatus,evidenceStatus){
  const statuses=[normalizeStatus(jobStatus),normalizeStatus(evidenceStatus)];
  if(statuses.includes('FAIL'))return 'FAIL';
  if(statuses.includes('BLOCKED'))return 'BLOCKED';
  if(statuses.every((status)=>status==='PASS'))return 'PASS';
  return 'NOT_EXECUTED';
}

export const __test__={normalizeStatus,STATUSES};
