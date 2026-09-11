const SHA40=/^[a-f0-9]{40}$/i;
const E164=/^\+?[1-9]\d{6,14}$/;

function recipient(value:string){
  const raw=String(value||'').trim();
  if(!E164.test(raw))return null;
  return raw.replace(/^\+/, '');
}

function allowlist(env:NodeJS.ProcessEnv){
  return new Set(String(env.HIPICO_CLOUD_ALLOWED_DESTINATIONS||'')
    .split(',')
    .map(recipient)
    .filter((value):value is string=>Boolean(value)));
}

export function cloudOutboundPolicy(env:NodeJS.ProcessEnv=process.env){
  const runtimeSha=String(env.VERCEL_GIT_COMMIT_SHA||env.GIT_SHA||'').trim();
  const approvedSha=String(env.HIPICO_CLOUD_SEND_CANDIDATE_SHA||'').trim();
  const allowed=allowlist(env);
  const reasons:string[]=[];
  if(String(env.HIPICO_CLOUD_SEND_ENABLED||'').toLowerCase()!=='true')reasons.push('SEND_SWITCH_DISABLED');
  if(String(env.HIPICO_WHATSAPP_COMPLIANCE_DECISION||'').toUpperCase()!=='GO')reasons.push('WHATSAPP_COMPLIANCE_NOT_GO');
  if(!String(env.HIPICO_CLOUD_SEND_APPROVED_BY||'').trim())reasons.push('EXPLICIT_APPROVAL_MISSING');
  if(!SHA40.test(runtimeSha)||!SHA40.test(approvedSha)||runtimeSha.toLowerCase()!==approvedSha.toLowerCase())reasons.push('CANDIDATE_SHA_NOT_BOUND');
  if(!allowed.size)reasons.push('DESTINATION_ALLOWLIST_EMPTY');
  return{enabled:reasons.length===0,reasons,allowedDestinationCount:allowed.size,runtimeShaBound:reasons.includes('CANDIDATE_SHA_NOT_BOUND')===false};
}

export function cloudDestinationAllowed(value:string,env:NodeJS.ProcessEnv=process.env){
  const normalized=recipient(value);
  return Boolean(normalized&&allowlist(env).has(normalized));
}

export function assertCloudOutboundAllowed(value:string,env:NodeJS.ProcessEnv=process.env){
  const policy=cloudOutboundPolicy(env);
  if(!policy.enabled)throw Object.assign(new Error(`Cloud outbound disabled: ${policy.reasons.join(',')}`),{code:'HIPICO_CLOUD_SEND_DISABLED',reasons:policy.reasons});
  if(!cloudDestinationAllowed(value,env))throw Object.assign(new Error('Destination is not explicitly allowlisted.'),{code:'HIPICO_DESTINATION_NOT_ALLOWLISTED'});
  return true;
}

export const __test__={recipient};
