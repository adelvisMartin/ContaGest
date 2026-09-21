import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SHA40=/^[a-f0-9]{40}$/i;
const PHASES=new Set(['REQUEST','COMPLETE']);
const EXPECTED_PATH='/hipico-control/';

function normalizeSha(value){
  const sha=String(value||'').trim().toLowerCase();
  return SHA40.test(sha)?sha:null;
}

function fingerprint(value){
  return createHash('sha256').update(String(value||''),'utf8').digest('hex');
}

function normalizedOrigin(value){
  try{
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.username||url.password)return null;
    return url.origin;
  }catch{
    return null;
  }
}
export function validatePublishableKey(value){
  const key=String(value||'').trim();
  if(!key)return {ok:false,reason:'PUBLISHABLE_KEY_REQUIRED'};
  if(/^sb_secret_/i.test(key))return {ok:false,reason:'SERVICE_ROLE_KEY_FORBIDDEN'};
  if(/^sb_publishable_/i.test(key))return {ok:true,reason:null};
  const parts=key.split('.');
  if(parts.length!==3)return {ok:false,reason:'PUBLISHABLE_KEY_INVALID'};
  try{
    const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    const role=String(payload?.role||'').toLowerCase();
    if(role==='service_role')return {ok:false,reason:'SERVICE_ROLE_KEY_FORBIDDEN'};
    if(role==='anon')return {ok:true,reason:null};
  }catch{}
  return {ok:false,reason:'PUBLISHABLE_KEY_INVALID'};
}

export function validateRedirectTarget(value,{expectedOrigin=null}={}){
  try{
    const url=new URL(String(value||'').trim());
    if(url.protocol!=='https:'||url.username||url.password)return {ok:false,reason:'REDIRECT_HTTPS_REQUIRED',url:null};
    if(url.pathname!==EXPECTED_PATH)return {ok:false,reason:'REDIRECT_PATH_MISMATCH',url:null};
    if(url.search||url.hash)return {ok:false,reason:'REDIRECT_MUST_BE_CLEAN',url:null};
    if(expectedOrigin&&url.origin!==expectedOrigin)return {ok:false,reason:'REDIRECT_ORIGIN_MISMATCH',url:null};
    return {ok:true,reason:null,url:url.toString()};
  }catch{
    return {ok:false,reason:'REDIRECT_URL_INVALID',url:null};
  }
}

function baseReport({candidateSha,phase,expectedRedirect,emailFingerprint='',now=new Date()}){
  return {
    schema:'hipico-auth-recovery-e2e.v28',
    candidateSha:normalizeSha(candidateSha),
    phase:String(phase||'').toUpperCase(),
    checkedAt:now.toISOString(),
    status:'NOT_EXECUTED',
    reason:null,
    e2eComplete:false,
    requestAccepted:false,
    redirectMatched:false,
    identityStable:false,
    profileLinked:false,
    accessLinked:false,
    workspaceLinked:false,
    sessionClosed:false,
    expectedRedirect:expectedRedirect||null,
    emailFingerprint:emailFingerprint||null,
    userFingerprint:null,
    workspaceOwnerFingerprint:null,
    failedChecks:[]
  };
}

export function classifyRequestEvidence({
  candidateSha,
  requestAccepted,
  emailFingerprint,
  expectedRedirect,
  now=new Date()
}={}){
  const report=baseReport({candidateSha,phase:'REQUEST',expectedRedirect,emailFingerprint,now});
  if(!normalizeSha(candidateSha)){
    report.reason='CANDIDATE_SHA_REQUIRED';
    return report;
  }
  if(requestAccepted!==true){
    report.status='FAIL';
    report.reason='RECOVERY_REQUEST_REJECTED';
    return report;
  }
  report.status='PASS';
  report.reason=null;
  report.requestAccepted=true;
  return report;
}

export function classifyCompleteEvidence({
  candidateSha,
  redirectMatched,
  identityStable,
  profileLinked,
  accessLinked,
  workspaceLinked,
  sessionClosed,
  emailFingerprint,
  userFingerprint,
  workspaceOwnerFingerprint,
  expectedRedirect,
  now=new Date()
}={}){
  const report=baseReport({candidateSha,phase:'COMPLETE',expectedRedirect,emailFingerprint,now});
  report.redirectMatched=redirectMatched===true;
  report.identityStable=identityStable===true;
  report.profileLinked=profileLinked===true;
  report.accessLinked=accessLinked===true;
  report.workspaceLinked=workspaceLinked===true;
  report.sessionClosed=sessionClosed===true;
  report.userFingerprint=userFingerprint||null;
  report.workspaceOwnerFingerprint=workspaceOwnerFingerprint||null;

  if(!normalizeSha(candidateSha)){
    report.reason='CANDIDATE_SHA_REQUIRED';
    return report;
  }

  const checks={redirectMatched,identityStable,profileLinked,accessLinked,workspaceLinked,sessionClosed};
  report.failedChecks=Object.entries(checks).filter(([,value])=>value!==true).map(([name])=>name);
  if(report.failedChecks.length){
    report.status='FAIL';
    report.reason='RECOVERY_E2E_CHECK_FAILED';
    return report;
  }

  report.status='PASS';
  report.reason=null;
  report.e2eComplete=true;
  return report;
}

function notExecutedReport({candidateSha,phase,expectedRedirect,emailFingerprint,reason,now=new Date()}){
  const report=baseReport({candidateSha,phase,expectedRedirect,emailFingerprint,now});
  report.reason=reason;
  return report;
}

function failedReport({candidateSha,phase,expectedRedirect,emailFingerprint,reason,now=new Date()}){
  const report=baseReport({candidateSha,phase,expectedRedirect,emailFingerprint,now});
  report.status='FAIL';
  report.reason=reason;
  return report;
}

function authHeaders(publishableKey,token=''){
  return {
    apikey:publishableKey,
    Authorization:`Bearer ${token||publishableKey}`,
    'Content-Type':'application/json'
  };
}

async function jsonOrNull(response){
  try{return await response.json();}catch{return null;}
}

function normalizeConfig(env=process.env){
  const phase=String(env.HIPICO_AUTH_RECOVERY_PHASE||'').trim().toUpperCase();
  const candidateSha=String(env.HIPICO_CANDIDATE_SHA||env.GITHUB_SHA||'').trim();
  const supabaseUrl=String(env.HIPICO_SUPABASE_URL||'').trim();
  const publishableKey=String(env.HIPICO_SUPABASE_PUBLISHABLE_KEY||'').trim();
  const email=String(env.HIPICO_AUTH_RECOVERY_TEST_EMAIL||'').trim().toLowerCase();
  const expectedRedirect=String(env.HIPICO_AUTH_RECOVERY_REDIRECT_URL||'').trim();
  const rawRecoveryLink=String(env.HIPICO_AUTH_RECOVERY_EMAIL_LINK||'').trim();
  const acknowledged=['true','1','yes'].includes(String(env.HIPICO_AUTH_RECOVERY_TEST_ACCOUNT_ACK||'').trim().toLowerCase());
  const reportPath=String(env.HIPICO_AUTH_RECOVERY_REPORT||'').trim();
  return {phase,candidateSha,supabaseUrl,publishableKey,email,expectedRedirect,rawRecoveryLink,acknowledged,reportPath};
}

function validateConfig(config){
  if(!normalizeSha(config.candidateSha))return 'CANDIDATE_SHA_REQUIRED';
  if(!PHASES.has(config.phase))return 'PHASE_INVALID';
  if(config.acknowledged!==true)return 'DEDICATED_TEST_ACCOUNT_ACK_REQUIRED';
  if(!/^\S+@\S+\.\S+$/.test(config.email))return 'TEST_EMAIL_REQUIRED';
  if(!normalizedOrigin(config.supabaseUrl))return 'SUPABASE_URL_INVALID';
  const keyValidation=validatePublishableKey(config.publishableKey);
  if(!keyValidation.ok)return keyValidation.reason;
  const redirect=validateRedirectTarget(config.expectedRedirect);
  if(!redirect.ok)return redirect.reason;
  if(config.phase==='COMPLETE'&&!config.rawRecoveryLink)return 'RECOVERY_EMAIL_LINK_REQUIRED';
  return null;
}

async function requestRecovery({config,fetchImpl=fetch,now=new Date()}){
  const redirect=validateRedirectTarget(config.expectedRedirect);
  const emailHash=fingerprint(config.email);
  const url=`${normalizedOrigin(config.supabaseUrl)}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect.url)}`;
  let response;
  try{
    response=await fetchImpl(url,{
      method:'POST',
      headers:authHeaders(config.publishableKey),
      cache:'no-store',
      redirect:'manual',
      body:JSON.stringify({email:config.email})
    });
  }catch{
    return failedReport({
      candidateSha:config.candidateSha,
      phase:'REQUEST',
      expectedRedirect:redirect.url,
      emailFingerprint:emailHash,
      reason:'RECOVERY_REQUEST_NETWORK_ERROR',
      now
    });
  }
  if(!response?.ok){
    return failedReport({
      candidateSha:config.candidateSha,
      phase:'REQUEST',
      expectedRedirect:redirect.url,
      emailFingerprint:emailHash,
      reason:`RECOVERY_REQUEST_HTTP_${Number(response?.status)||0}`,
      now
    });
  }
  return classifyRequestEvidence({
    candidateSha:config.candidateSha,
    requestAccepted:true,
    emailFingerprint:emailHash,
    expectedRedirect:redirect.url,
    now
  });
}

async function resolveRecoveryRedirect({
  rawRecoveryLink,
  supabaseOrigin,
  expectedRedirect,
  fetchImpl=fetch,
  maxHops=5
}){
  let current;
  try{current=new URL(rawRecoveryLink);}catch{return {ok:false,reason:'RECOVERY_LINK_INVALID'};}
  if(current.protocol!=='https:'||current.origin!==supabaseOrigin||current.pathname!=='/auth/v1/verify'){
    return {ok:false,reason:'RECOVERY_LINK_ORIGIN_OR_PATH_INVALID'};
  }

  const expected=new URL(expectedRedirect);
  for(let hop=0;hop<maxHops;hop+=1){
    let response;
    try{
      response=await fetchImpl(current.toString(),{method:'GET',redirect:'manual',cache:'no-store'});
    }catch{
      return {ok:false,reason:'RECOVERY_LINK_NETWORK_ERROR'};
    }

    if(![301,302,303,307,308].includes(Number(response?.status))){
      return {ok:false,reason:'RECOVERY_LINK_REDIRECT_REQUIRED'};
    }

    const location=response.headers?.get?.('location');
    if(!location)return {ok:false,reason:'RECOVERY_LINK_LOCATION_MISSING'};

    let next;
    try{next=new URL(location,current);}catch{return {ok:false,reason:'RECOVERY_LINK_LOCATION_INVALID'};}

    if(next.origin===expected.origin&&next.pathname===expected.pathname){
      if(next.search&&next.search!=='')return {ok:false,reason:'RECOVERY_REDIRECT_QUERY_UNEXPECTED'};
      const hash=new URLSearchParams(next.hash.replace(/^#/,''));
      const type=String(hash.get('type')||'').toLowerCase();
      const accessToken=String(hash.get('access_token')||'');
      if(type!=='recovery'||!accessToken)return {ok:false,reason:'RECOVERY_CONTEXT_MISSING'};
      return {ok:true,reason:null,accessToken};
    }

    if(next.origin!==supabaseOrigin||next.protocol!=='https:'){
      return {ok:false,reason:'RECOVERY_REDIRECT_ORIGIN_UNEXPECTED'};
    }
    current=next;
  }
  return {ok:false,reason:'RECOVERY_REDIRECT_HOPS_EXCEEDED'};
}

function strongEphemeralPassword(){
  return `${randomBytes(36).toString('base64url')}Aa1!`;
}

async function completeRecovery({
  config,
  fetchImpl=fetch,
  passwordFactory=strongEphemeralPassword,
  now=new Date()
}){
  const redirect=validateRedirectTarget(config.expectedRedirect);
  const emailHash=fingerprint(config.email);
  const supabaseOrigin=normalizedOrigin(config.supabaseUrl);

  const resolved=await resolveRecoveryRedirect({
    rawRecoveryLink:config.rawRecoveryLink,
    supabaseOrigin,
    expectedRedirect:redirect.url,
    fetchImpl
  });
  if(!resolved.ok){
    return failedReport({
      candidateSha:config.candidateSha,
      phase:'COMPLETE',
      expectedRedirect:redirect.url,
      emailFingerprint:emailHash,
      reason:resolved.reason,
      now
    });
  }

  const recoveryToken=resolved.accessToken;
  let recoveryUser;
  try{
    const response=await fetchImpl(`${supabaseOrigin}/auth/v1/user`,{
      method:'GET',
      headers:authHeaders(config.publishableKey,recoveryToken),
      cache:'no-store'
    });
    if(!response?.ok){
      return failedReport({
        candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
        emailFingerprint:emailHash,reason:`RECOVERY_USER_HTTP_${Number(response?.status)||0}`,now
      });
    }
    recoveryUser=await jsonOrNull(response);
  }catch{
    return failedReport({
      candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
      emailFingerprint:emailHash,reason:'RECOVERY_USER_NETWORK_ERROR',now
    });
  }

  const recoveryUserId=String(recoveryUser?.id||'');
  if(!recoveryUserId){
    return failedReport({
      candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
      emailFingerprint:emailHash,reason:'RECOVERY_USER_ID_MISSING',now
    });
  }
  const recoveryUserEmail=String(recoveryUser?.email||'').trim().toLowerCase();
  if(!recoveryUserEmail||recoveryUserEmail!==config.email){
    return failedReport({
      candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
      emailFingerprint:emailHash,reason:'RECOVERY_ACCOUNT_MISMATCH',now
    });
  }

  const password=String(passwordFactory()||'');
  if(password.length<20){
    return failedReport({
      candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
      emailFingerprint:emailHash,reason:'EPHEMERAL_PASSWORD_GENERATION_FAILED',now
    });
  }

  let updateResponse;
  try{
    updateResponse=await fetchImpl(`${supabaseOrigin}/auth/v1/user`,{
      method:'PUT',
      headers:authHeaders(config.publishableKey,recoveryToken),
      cache:'no-store',
      body:JSON.stringify({password})
    });
  }catch{
    return failedReport({
      candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
      emailFingerprint:emailHash,reason:'PASSWORD_UPDATE_NETWORK_ERROR',now
    });
  }
  if(!updateResponse?.ok){
    return failedReport({
      candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
      emailFingerprint:emailHash,reason:`PASSWORD_UPDATE_HTTP_${Number(updateResponse?.status)||0}`,now
    });
  }

  let session;
  try{
    const response=await fetchImpl(`${supabaseOrigin}/auth/v1/token?grant_type=password`,{
      method:'POST',
      headers:authHeaders(config.publishableKey),
      cache:'no-store',
      body:JSON.stringify({email:config.email,password})
    });
    if(!response?.ok){
      return failedReport({
        candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
        emailFingerprint:emailHash,reason:`REAUTH_HTTP_${Number(response?.status)||0}`,now
      });
    }
    session=await jsonOrNull(response);
  }catch{
    return failedReport({
      candidateSha:config.candidateSha,phase:'COMPLETE',expectedRedirect:redirect.url,
      emailFingerprint:emailHash,reason:'REAUTH_NETWORK_ERROR',now
    });
  }

  const reauthToken=String(session?.access_token||'');
  const refreshToken=String(session?.refresh_token||'');
  const reauthUserId=String(session?.user?.id||'');
  const identityStable=Boolean(reauthUserId)&&reauthUserId===recoveryUserId;
  if(!reauthToken||!refreshToken||!identityStable){
    return classifyCompleteEvidence({
      candidateSha:config.candidateSha,
      redirectMatched:true,
      identityStable,
      profileLinked:false,
      accessLinked:false,
      workspaceLinked:false,
      sessionClosed:false,
      emailFingerprint:emailHash,
      userFingerprint:fingerprint(recoveryUserId),
      workspaceOwnerFingerprint:null,
      expectedRedirect:redirect.url,
      now
    });
  }

  const restHeaders=authHeaders(config.publishableKey,reauthToken);
  let profileRows=null;
  let accessRows=null;
  try{
    const [profileResponse,accessResponse]=await Promise.all([
      fetchImpl(
        `${supabaseOrigin}/rest/v1/hipico_profiles?owner_id=eq.${encodeURIComponent(recoveryUserId)}&select=owner_id`,
        {method:'GET',headers:restHeaders,cache:'no-store'}
      ),
      fetchImpl(
        `${supabaseOrigin}/rest/v1/hipico_users?user_id=eq.${encodeURIComponent(recoveryUserId)}&select=user_id,workspace_owner_id,status`,
        {method:'GET',headers:restHeaders,cache:'no-store'}
      )
    ]);
    if(profileResponse?.ok)profileRows=await jsonOrNull(profileResponse);
    if(accessResponse?.ok)accessRows=await jsonOrNull(accessResponse);
  }catch{
    profileRows=null;
    accessRows=null;
  }

  const profileLinked=Array.isArray(profileRows)&&profileRows.some((row)=>String(row?.owner_id||'')===recoveryUserId);
  const accessRow=Array.isArray(accessRows)
    ?accessRows.find((row)=>String(row?.user_id||'')===recoveryUserId)
    :null;
  const workspaceOwnerId=String(accessRow?.workspace_owner_id||'');
  const accessLinked=Boolean(accessRow&&workspaceOwnerId&&String(accessRow?.status||'').toLowerCase()==='active');

  let workspaceRows=null;
  if(accessLinked){
    try{
      const workspaceResponse=await fetchImpl(
        `${supabaseOrigin}/rest/v1/hipico_workspaces?owner_id=eq.${encodeURIComponent(workspaceOwnerId)}&select=id,owner_id&limit=1`,
        {method:'GET',headers:restHeaders,cache:'no-store'}
      );
      if(workspaceResponse?.ok)workspaceRows=await jsonOrNull(workspaceResponse);
    }catch{
      workspaceRows=null;
    }
  }
  const workspaceLinked=Array.isArray(workspaceRows)
    &&workspaceRows.some((row)=>String(row?.owner_id||'')===workspaceOwnerId&&Boolean(row?.id));

  let sessionClosed=false;
  try{
    const response=await fetchImpl(`${supabaseOrigin}/auth/v1/logout`,{
      method:'POST',
      headers:authHeaders(config.publishableKey,reauthToken),
      cache:'no-store'
    });
    sessionClosed=Boolean(response?.ok);
  }catch{
    sessionClosed=false;
  }

  return classifyCompleteEvidence({
    candidateSha:config.candidateSha,
    redirectMatched:true,
    identityStable,
    profileLinked,
    accessLinked,
    workspaceLinked,
    sessionClosed,
    emailFingerprint:emailHash,
    userFingerprint:fingerprint(recoveryUserId),
    workspaceOwnerFingerprint:workspaceOwnerId?fingerprint(workspaceOwnerId):null,
    expectedRedirect:redirect.url,
    now
  });
}

export async function runRecoveryGate({
  env=process.env,
  fetchImpl=fetch,
  passwordFactory=strongEphemeralPassword,
  now=new Date()
}={}){
  const config=normalizeConfig(env);
  const configReason=validateConfig(config);
  const redirect=validateRedirectTarget(config.expectedRedirect);
  const emailHash=/^\S+@\S+\.\S+$/.test(config.email)?fingerprint(config.email):'';
  if(configReason){
    return notExecutedReport({
      candidateSha:config.candidateSha,
      phase:config.phase,
      expectedRedirect:redirect.ok?redirect.url:null,
      emailFingerprint:emailHash,
      reason:configReason,
      now
    });
  }
  if(config.phase==='REQUEST')return requestRecovery({config,fetchImpl,now});
  return completeRecovery({config,fetchImpl,passwordFactory,now});
}

async function main(){
  const report=await runRecoveryGate();
  const configured=String(process.env.HIPICO_AUTH_RECOVERY_REPORT||'').trim();
  const output=configured||path.join(
    root,'artifacts','qa','hipico-auth-recovery',
    report.candidateSha||'unknown',
    `${String(report.phase||'unknown').toLowerCase()}.json`
  );
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await fs.writeFile(path.resolve(output),`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify(report));
  if(report.status==='FAIL')process.exitCode=2;
  else if(report.status==='NOT_EXECUTED')process.exitCode=3;
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain)await main();

export const __test__={
  normalizeSha,
  fingerprint,
  normalizeConfig,
  validateConfig,
  validatePublishableKey,
  resolveRecoveryRedirect,
  strongEphemeralPassword
};
