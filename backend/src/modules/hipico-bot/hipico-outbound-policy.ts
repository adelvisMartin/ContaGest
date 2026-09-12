import { hipicoNumericProviderIdConfigured, hipicoRuntimeSecretConfigured } from './hipico-secret-security.js';

const SHA40=/^[a-f0-9]{40}$/i;
const E164=/^\+?[1-9]\d{6,14}$/;
const GRAPH_VERSION=/^v\d+\.\d+$/;
const DEFAULT_CLOUD_SEND_TIMEOUT_MS=12_000;
const MIN_CLOUD_SEND_TIMEOUT_MS=1_000;
const MAX_CLOUD_SEND_TIMEOUT_MS=60_000;

type RuntimeEnv=NodeJS.ProcessEnv|Record<string,string|undefined>;

function recipient(value:string){
  const raw=String(value||'').trim();
  if(!E164.test(raw))return null;
  return raw.replace(/^\+/, '');
}

function allowlist(env:RuntimeEnv){
  return new Set(String(env.HIPICO_CLOUD_ALLOWED_DESTINATIONS||'')
    .split(',')
    .map(recipient)
    .filter((value):value is string=>Boolean(value)));
}

function runtimeSha(env:RuntimeEnv){
  return String(env.VERCEL_GIT_COMMIT_SHA||env.GITHUB_SHA||env.GIT_COMMIT_SHA||env.GIT_SHA||'').trim();
}

export function cloudSendTimeoutMs(env:RuntimeEnv=process.env){
  const parsed=Number(env.HIPICO_CLOUD_SEND_TIMEOUT_MS);
  if(!Number.isFinite(parsed)||parsed<=0)return DEFAULT_CLOUD_SEND_TIMEOUT_MS;
  return Math.min(MAX_CLOUD_SEND_TIMEOUT_MS,Math.max(MIN_CLOUD_SEND_TIMEOUT_MS,Math.trunc(parsed)));
}

export function cloudOutboundPolicy(env:RuntimeEnv=process.env){
  const deployedSha=runtimeSha(env);
  const approvedSha=String(env.HIPICO_CLOUD_SEND_CANDIDATE_SHA||'').trim();
  const allowed=allowlist(env);
  const reasons:string[]=[];
  if(String(env.HIPICO_CLOUD_SEND_ENABLED||'').toLowerCase()!=='true')reasons.push('SEND_SWITCH_DISABLED');
  if(String(env.HIPICO_WHATSAPP_COMPLIANCE_DECISION||'').toUpperCase()!=='GO')reasons.push('WHATSAPP_COMPLIANCE_NOT_GO');
  if(!String(env.HIPICO_CLOUD_SEND_APPROVED_BY||'').trim())reasons.push('EXPLICIT_APPROVAL_MISSING');
  if(!SHA40.test(deployedSha)||!SHA40.test(approvedSha)||deployedSha.toLowerCase()!==approvedSha.toLowerCase())reasons.push('CANDIDATE_SHA_NOT_BOUND');
  if(!allowed.size)reasons.push('DESTINATION_ALLOWLIST_EMPTY');
  return{enabled:reasons.length===0,reasons,allowedDestinationCount:allowed.size,runtimeShaBound:reasons.includes('CANDIDATE_SHA_NOT_BOUND')===false};
}

export function cloudDestinationAllowed(value:string,env:RuntimeEnv=process.env){
  const normalized=recipient(value);
  return Boolean(normalized&&allowlist(env).has(normalized));
}

export function cloudTransportConfiguration(env:RuntimeEnv=process.env){
  const token=String(env.WHATSAPP_CLOUD_TOKEN||'').trim();
  const phoneId=String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
  const rawVersion=String(env.WHATSAPP_GRAPH_API_VERSION||env.WHATSAPP_GRAPH_VERSION||'v23.0').trim();
  const timeoutMs=cloudSendTimeoutMs(env);
  const reasons:string[]=[];
  if(!hipicoRuntimeSecretConfigured(token))reasons.push('CLOUD_TOKEN_NOT_CONFIGURED');
  if(!hipicoNumericProviderIdConfigured(phoneId))reasons.push('PHONE_NUMBER_ID_INVALID');
  if(!GRAPH_VERSION.test(rawVersion))reasons.push('GRAPH_VERSION_INVALID');
  return{configured:reasons.length===0,reasons,token,phoneId,version:rawVersion,timeoutMs};
}

export function assertCloudTransportConfigured(env:RuntimeEnv=process.env){
  const config=cloudTransportConfiguration(env);
  if(!config.configured){
    throw Object.assign(new Error(`Cloud transport invalid: ${config.reasons.join(',')}`),{code:'HIPICO_CLOUD_TRANSPORT_NOT_CONFIGURED',reasons:config.reasons});
  }
  return{token:config.token,phoneId:config.phoneId,version:config.version,timeoutMs:config.timeoutMs};
}

export function assertCloudOutboundAllowed(value:string,env:RuntimeEnv=process.env){
  const policy=cloudOutboundPolicy(env);
  if(!policy.enabled)throw Object.assign(new Error(`Cloud outbound disabled: ${policy.reasons.join(',')}`),{code:'HIPICO_CLOUD_SEND_DISABLED',reasons:policy.reasons});
  if(!cloudDestinationAllowed(value,env))throw Object.assign(new Error('Destination is not explicitly allowlisted.'),{code:'HIPICO_DESTINATION_NOT_ALLOWLISTED'});
  return true;
}

export const __test__={recipient,GRAPH_VERSION,runtimeSha};
