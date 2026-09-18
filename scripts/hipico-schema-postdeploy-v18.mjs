import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { runDriftCheck } from './hipico-schema-drift-v15.mjs';

const { Client }=pg;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SHA40=/^[a-f0-9]{40}$/i;

const EXPECTED_SECURITY=Object.freeze({
  observabilityTablePresent:true,
  observabilityRls:true,
  observabilityAppendOnlyTrigger:true,
  outboxRls:true,
  outboxReceiptsTablePresent:true,
  outboxReceiptsRls:true,
  outboxReceiptsAppendOnlyTrigger:true,
  outboxSelectPolicyPresent:true,
  outboxReceiptsSelectPolicyPresent:true,
  outboxInsertPolicyPresent:false,
  outboxUpdatePolicyPresent:false,
  outboxReceiptsInsertPolicyPresent:false,
  outboxAnonInsert:false,
  outboxAnonUpdate:false,
  outboxAnonDelete:false,
  outboxAnonTruncate:false,
  outboxAuthenticatedInsert:false,
  outboxAuthenticatedUpdate:false,
  outboxAuthenticatedDelete:false,
  outboxAuthenticatedTruncate:false,
  outboxReceiptsAnonInsert:false,
  outboxReceiptsAnonUpdate:false,
  outboxReceiptsAnonDelete:false,
  outboxReceiptsAnonTruncate:false,
  outboxReceiptsAuthenticatedInsert:false,
  outboxReceiptsAuthenticatedUpdate:false,
  outboxReceiptsAuthenticatedDelete:false,
  outboxReceiptsAuthenticatedTruncate:false,
  auditIdempotencyIndex:true,
  auditSourceConstraint:true,
  auditAuthorityConstraint:true,
  auditProvenanceColumnsNotNull:true,
  auditRpcPresent:true,
  auditRpcSecurityDefiner:true,
  auditRpcAnonExecute:false,
  auditRpcAuthenticatedExecute:true,
  auditRpcServiceRoleExecute:true,
  auditSanitizerPresent:true,
  auditAnonDirectInsert:false,
  auditAnonDirectUpdate:false,
  auditAnonDirectDelete:false,
  auditAuthenticatedDirectInsert:false,
  auditAuthenticatedDirectUpdate:false,
  auditAuthenticatedDirectDelete:false,
  auditSanitizerPublicExecute:false,
  auditSanitizerAnonExecute:false,
  auditSanitizerAuthenticatedExecute:false
});

function normalizeSha(value){
  const sha=String(value||'').trim().toLowerCase();
  return SHA40.test(sha)?sha:null;
}

function baseReport({candidateSha,driftReport,securityChecks,now}){
  return {
    schema:'hipico-schema-postdeploy.v18',
    candidateSha:normalizeSha(candidateSha),
    checkedAt:now.toISOString(),
    status:'NOT_EXECUTED',
    reason:null,
    autoRepair:false,
    target:{
      database:String(driftReport?.target?.database||'')||null,
      remote:driftReport?.target?.remote===true
    },
    driftStatus:String(driftReport?.status||'NOT_EXECUTED'),
    missingCapabilities:Array.isArray(driftReport?.missing)?[...driftReport.missing]:[],
    securityChecks:securityChecks&&typeof securityChecks==='object'?{...securityChecks}:null,
    failedChecks:[]
  };
}

export function classifyPostdeploy({
  candidateSha,
  driftReport,
  securityChecks,
  securityReason=null,
  now=new Date()
}={}){
  const report=baseReport({candidateSha,driftReport,securityChecks,now});
  const sha=normalizeSha(candidateSha);
  if(!sha){
    report.reason='CANDIDATE_SHA_REQUIRED';
    return report;
  }
  if(!driftReport||typeof driftReport!=='object'){
    report.reason='DRIFT_EVIDENCE_REQUIRED';
    return report;
  }
  if(driftReport.status==='NOT_EXECUTED'){
    report.reason=String(driftReport.reason||'DRIFT_NOT_EXECUTED');
    return report;
  }
  if(normalizeSha(driftReport.candidateSha)!==sha){
    report.status='FAIL';
    report.reason='DRIFT_SHA_MISMATCH';
    return report;
  }
  if(driftReport.status==='DRIFT'){
    report.status='FAIL';
    report.reason='SCHEMA_DRIFT';
    return report;
  }
  if(driftReport.status!=='MATCH'){
    report.status='FAIL';
    report.reason='DRIFT_STATUS_INVALID';
    return report;
  }
  if(!securityChecks||typeof securityChecks!=='object'){
    report.reason=String(securityReason||'SECURITY_CHECKS_NOT_EXECUTED');
    return report;
  }

  const failed=[];
  for(const [name,expected] of Object.entries(EXPECTED_SECURITY)){
    if(securityChecks[name]!==expected)failed.push(name);
  }
  report.failedChecks=failed;
  if(failed.length){
    report.status='FAIL';
    report.reason='SECURITY_BOUNDARY_MISMATCH';
    return report;
  }

  report.status='PASS';
  report.reason=null;
  return report;
}

function mapSecurityRow(row={}){
  return {
    observabilityTablePresent:row.observability_table_present===true,
    observabilityRls:row.observability_rls===true,
    observabilityAppendOnlyTrigger:row.observability_append_only_trigger===true,
    outboxRls:row.outbox_rls===true,
    outboxReceiptsTablePresent:row.outbox_receipts_table_present===true,
    outboxReceiptsRls:row.outbox_receipts_rls===true,
    outboxReceiptsAppendOnlyTrigger:row.outbox_receipts_append_only_trigger===true,
    outboxSelectPolicyPresent:row.outbox_select_policy_present===true,
    outboxReceiptsSelectPolicyPresent:row.outbox_receipts_select_policy_present===true,
    outboxInsertPolicyPresent:row.outbox_insert_policy_present===true,
    outboxUpdatePolicyPresent:row.outbox_update_policy_present===true,
    outboxReceiptsInsertPolicyPresent:row.outbox_receipts_insert_policy_present===true,
    outboxAnonInsert:row.outbox_anon_insert===true,
    outboxAnonUpdate:row.outbox_anon_update===true,
    outboxAnonDelete:row.outbox_anon_delete===true,
    outboxAnonTruncate:row.outbox_anon_truncate===true,
    outboxAuthenticatedInsert:row.outbox_authenticated_insert===true,
    outboxAuthenticatedUpdate:row.outbox_authenticated_update===true,
    outboxAuthenticatedDelete:row.outbox_authenticated_delete===true,
    outboxAuthenticatedTruncate:row.outbox_authenticated_truncate===true,
    outboxReceiptsAnonInsert:row.outbox_receipts_anon_insert===true,
    outboxReceiptsAnonUpdate:row.outbox_receipts_anon_update===true,
    outboxReceiptsAnonDelete:row.outbox_receipts_anon_delete===true,
    outboxReceiptsAnonTruncate:row.outbox_receipts_anon_truncate===true,
    outboxReceiptsAuthenticatedInsert:row.outbox_receipts_authenticated_insert===true,
    outboxReceiptsAuthenticatedUpdate:row.outbox_receipts_authenticated_update===true,
    outboxReceiptsAuthenticatedDelete:row.outbox_receipts_authenticated_delete===true,
    outboxReceiptsAuthenticatedTruncate:row.outbox_receipts_authenticated_truncate===true,
    auditIdempotencyIndex:row.audit_idempotency_index===true,
    auditSourceConstraint:row.audit_source_constraint===true,
    auditAuthorityConstraint:row.audit_authority_constraint===true,
    auditProvenanceColumnsNotNull:row.audit_provenance_columns_not_null===true,
    auditRpcPresent:row.audit_rpc_present===true,
    auditRpcSecurityDefiner:row.audit_rpc_security_definer===true,
    auditRpcAnonExecute:row.audit_rpc_anon_execute===true,
    auditRpcAuthenticatedExecute:row.audit_rpc_authenticated_execute===true,
    auditRpcServiceRoleExecute:row.audit_rpc_service_role_execute===true,
    auditSanitizerPresent:row.audit_sanitizer_present===true,
    auditAnonDirectInsert:row.audit_anon_direct_insert===true,
    auditAnonDirectUpdate:row.audit_anon_direct_update===true,
    auditAnonDirectDelete:row.audit_anon_direct_delete===true,
    auditAuthenticatedDirectInsert:row.audit_authenticated_direct_insert===true,
    auditAuthenticatedDirectUpdate:row.audit_authenticated_direct_update===true,
    auditAuthenticatedDirectDelete:row.audit_authenticated_direct_delete===true,
    auditSanitizerPublicExecute:row.audit_sanitizer_public_execute===true,
    auditSanitizerAnonExecute:row.audit_sanitizer_anon_execute===true,
    auditSanitizerAuthenticatedExecute:row.audit_sanitizer_authenticated_execute===true
  };
}

export async function runSecurityChecks({
  env=process.env,
  connect=(config)=>new Client(config)
}={}){
  const urlText=String(env.HIPICO_SCHEMA_DRIFT_DATABASE_URL||'').trim();
  if(!urlText)return {executed:false,reason:'DATABASE_URL_REQUIRED',checks:null};

  const client=connect({connectionString:urlText,application_name:'hipico-schema-postdeploy-v18'});
  await client.connect();
  try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const result=await client.query(`
      select
        (to_regclass('public.hipico_observability_events') is not null) as observability_table_present,
        coalesce((
          select c.relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='hipico_observability_events'
          limit 1
        ),false) as observability_rls,
        exists(
          select 1 from pg_trigger
          where not tgisinternal and tgname='hipico_observability_no_mutation'
        ) as observability_append_only_trigger,
        coalesce((
          select c.relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='hipico_outbox'
          limit 1
        ),false) as outbox_rls,
        (to_regclass('public.hipico_outbox_receipts') is not null) as outbox_receipts_table_present,
        coalesce((
          select c.relrowsecurity
          from pg_class c
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname='hipico_outbox_receipts'
          limit 1
        ),false) as outbox_receipts_rls,
        exists(
          select 1 from pg_trigger
          where not tgisinternal and tgname='hipico_outbox_receipts_immutable'
        ) as outbox_receipts_append_only_trigger,
        exists(
          select 1 from pg_policies
          where schemaname='public' and tablename='hipico_outbox' and policyname='hipico_outbox_select_own'
        ) as outbox_select_policy_present,
        exists(
          select 1 from pg_policies
          where schemaname='public' and tablename='hipico_outbox_receipts' and policyname='hipico_outbox_receipts_select_own'
        ) as outbox_receipts_select_policy_present,
        exists(
          select 1 from pg_policies
          where schemaname='public' and tablename='hipico_outbox' and policyname='hipico_outbox_insert_own'
        ) as outbox_insert_policy_present,
        exists(
          select 1 from pg_policies
          where schemaname='public' and tablename='hipico_outbox' and policyname='hipico_outbox_update_own'
        ) as outbox_update_policy_present,
        exists(
          select 1 from pg_policies
          where schemaname='public' and tablename='hipico_outbox_receipts' and policyname='hipico_outbox_receipts_insert_own'
        ) as outbox_receipts_insert_policy_present,
        coalesce(has_table_privilege('anon','public.hipico_outbox','INSERT'),false) as outbox_anon_insert,
        coalesce(has_table_privilege('anon','public.hipico_outbox','UPDATE'),false) as outbox_anon_update,
        coalesce(has_table_privilege('anon','public.hipico_outbox','DELETE'),false) as outbox_anon_delete,
        coalesce(has_table_privilege('anon','public.hipico_outbox','TRUNCATE'),false) as outbox_anon_truncate,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox','INSERT'),false) as outbox_authenticated_insert,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox','UPDATE'),false) as outbox_authenticated_update,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox','DELETE'),false) as outbox_authenticated_delete,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox','TRUNCATE'),false) as outbox_authenticated_truncate,
        coalesce(has_table_privilege('anon','public.hipico_outbox_receipts','INSERT'),false) as outbox_receipts_anon_insert,
        coalesce(has_table_privilege('anon','public.hipico_outbox_receipts','UPDATE'),false) as outbox_receipts_anon_update,
        coalesce(has_table_privilege('anon','public.hipico_outbox_receipts','DELETE'),false) as outbox_receipts_anon_delete,
        coalesce(has_table_privilege('anon','public.hipico_outbox_receipts','TRUNCATE'),false) as outbox_receipts_anon_truncate,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox_receipts','INSERT'),false) as outbox_receipts_authenticated_insert,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox_receipts','UPDATE'),false) as outbox_receipts_authenticated_update,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox_receipts','DELETE'),false) as outbox_receipts_authenticated_delete,
        coalesce(has_table_privilege('authenticated','public.hipico_outbox_receipts','TRUNCATE'),false) as outbox_receipts_authenticated_truncate,
        exists(
          select 1 from pg_indexes
          where schemaname='public'
            and tablename='hipico_audit_events'
            and indexname='hipico_audit_owner_idempotency_unique'
        ) as audit_idempotency_index,
        exists(
          select 1 from pg_constraint
          where conrelid=to_regclass('public.hipico_audit_events')
            and conname='hipico_audit_events_source_check'
        ) as audit_source_constraint,
        exists(
          select 1 from pg_constraint
          where conrelid=to_regclass('public.hipico_audit_events')
            and conname='hipico_audit_events_authority_check'
        ) as audit_authority_constraint,
        (
          select count(*)=2 and bool_and(is_nullable='NO')
          from information_schema.columns
          where table_schema='public'
            and table_name='hipico_audit_events'
            and column_name in ('source','authority')
        ) as audit_provenance_columns_not_null,
        (to_regprocedure('public.hipico_append_audit(uuid,text,text,text,jsonb)') is not null) as audit_rpc_present,
        coalesce((
          select p.prosecdef
          from pg_proc p
          where p.oid=to_regprocedure('public.hipico_append_audit(uuid,text,text,text,jsonb)')
        ),false) as audit_rpc_security_definer,
        coalesce(has_function_privilege('anon',to_regprocedure('public.hipico_append_audit(uuid,text,text,text,jsonb)'),'EXECUTE'),false) as audit_rpc_anon_execute,
        coalesce(has_function_privilege('authenticated',to_regprocedure('public.hipico_append_audit(uuid,text,text,text,jsonb)'),'EXECUTE'),false) as audit_rpc_authenticated_execute,
        coalesce(has_function_privilege('service_role',to_regprocedure('public.hipico_append_audit(uuid,text,text,text,jsonb)'),'EXECUTE'),false) as audit_rpc_service_role_execute,
        (to_regprocedure('public.hipico_audit_strip_reserved(jsonb)') is not null) as audit_sanitizer_present,
        coalesce(has_table_privilege('anon','public.hipico_audit_events','INSERT'),false) as audit_anon_direct_insert,
        coalesce(has_table_privilege('anon','public.hipico_audit_events','UPDATE'),false) as audit_anon_direct_update,
        coalesce(has_table_privilege('anon','public.hipico_audit_events','DELETE'),false) as audit_anon_direct_delete,
        coalesce(has_table_privilege('authenticated','public.hipico_audit_events','INSERT'),false) as audit_authenticated_direct_insert,
        coalesce(has_table_privilege('authenticated','public.hipico_audit_events','UPDATE'),false) as audit_authenticated_direct_update,
        coalesce(has_table_privilege('authenticated','public.hipico_audit_events','DELETE'),false) as audit_authenticated_direct_delete,
        exists(
          select 1
          from pg_proc p
          cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          where p.oid=to_regprocedure('public.hipico_audit_strip_reserved(jsonb)')
            and acl.grantee=0
            and acl.privilege_type='EXECUTE'
        ) as audit_sanitizer_public_execute,
        coalesce(has_function_privilege('anon',to_regprocedure('public.hipico_audit_strip_reserved(jsonb)'),'EXECUTE'),false) as audit_sanitizer_anon_execute,
        coalesce(has_function_privilege('authenticated',to_regprocedure('public.hipico_audit_strip_reserved(jsonb)'),'EXECUTE'),false) as audit_sanitizer_authenticated_execute
    `);
    return {executed:true,reason:null,checks:mapSecurityRow(result.rows[0]||{})};
  }finally{
    try{await client.query('ROLLBACK');}catch{}
    await client.end();
  }
}

export async function runPostdeploy({env=process.env,now=new Date()}={}){
  const candidateSha=String(env.HIPICO_CANDIDATE_SHA||env.GITHUB_SHA||'').trim();
  if(!normalizeSha(candidateSha)){
    return classifyPostdeploy({candidateSha,driftReport:null,securityChecks:null,now});
  }

  let driftReport;
  try{
    driftReport=await runDriftCheck({env});
  }catch(error){
    driftReport={
      schema:'hipico-schema-drift-report.v15',
      candidateSha:normalizeSha(candidateSha),
      status:'NOT_EXECUTED',
      reason:String(error?.code||'SCHEMA_DRIFT_CHECK_FAILED').slice(0,120),
      target:{database:null,remote:false},
      missing:[],
      observed:[]
    };
  }

  if(driftReport.status!=='MATCH'){
    return classifyPostdeploy({candidateSha,driftReport,securityChecks:null,now});
  }

  let security={executed:false,reason:'SECURITY_CHECKS_NOT_EXECUTED',checks:null};
  try{
    security=await runSecurityChecks({env});
  }catch(error){
    security={
      executed:false,
      reason:String(error?.code||'SECURITY_CHECKS_FAILED').slice(0,120),
      checks:null
    };
  }

  return classifyPostdeploy({
    candidateSha,
    driftReport,
    securityChecks:security.checks,
    securityReason:security.reason,
    now
  });
}

async function main(){
  const report=await runPostdeploy();
  const output=String(process.env.HIPICO_SCHEMA_POSTDEPLOY_REPORT||'').trim()
    ||path.join(root,'artifacts','qa','hipico-schema-postdeploy',`${report.candidateSha||'unknown'}.json`);
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await fs.writeFile(path.resolve(output),`${JSON.stringify(report,null,2)}\n`,'utf8');
  console.log(JSON.stringify(report));
  if(report.status==='FAIL')process.exitCode=2;
  else if(report.status==='NOT_EXECUTED')process.exitCode=3;
}

const isMain=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(isMain)await main();

export const __test__={normalizeSha,mapSecurityRow,EXPECTED_SECURITY};
