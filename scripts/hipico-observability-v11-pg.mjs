import fs from 'node:fs/promises';
import pg from 'pg';
const {Client}=pg;
const url=String(process.env.HIPICO_E2E_DATABASE_URL||'').trim();
if(!url)throw new Error('HIPICO_E2E_DATABASE_URL is required');
const parsed=new URL(url); const db=parsed.pathname.replace(/^\//,'');
if(!['localhost','127.0.0.1','::1'].includes(parsed.hostname)||!/^hipico_e2e_[a-z0-9_]{8,63}$/.test(db))throw new Error('Refusing non-isolated PostgreSQL target');
const owner='11111111-1111-4111-8111-111111111111'; const other='22222222-2222-4222-8222-222222222222';
const sha=String(process.env.HIPICO_CANDIDATE_SHA||process.env.GITHUB_SHA||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('Exact candidate SHA required');
const client=new Client({connectionString:url}); await client.connect();
try{
  await client.query(await fs.readFile('supabase/sql/hipico_v25_observability.sql','utf8'));
  const insert=async(o,g,id,corr)=>client.query(`INSERT INTO public.hipico_observability_events(owner_id,group_key,group_id,request_id,correlation_id,candidate_sha,stage,outcome,reason_code,metadata) VALUES($1::uuid,$2,$3,'req_test',$4,$5,'INBOUND','SUCCESS','QA_PROBE',$6::jsonb) RETURNING id`,[o,g,id,corr,sha,JSON.stringify({status:'ok'})]);
  const a=await insert(owner,'lab:a','group-a','corr-a'); await insert(owner,'lab:b','group-b','corr-b'); await insert(other,'lab:a','group-a','corr-c');
  const scoped=await client.query(`SELECT count(*)::int n FROM public.hipico_observability_events WHERE owner_id=$1::uuid AND group_key=$2 AND group_id=$3`,[owner,'lab:a','group-a']);
  if(scoped.rows[0].n!==1)throw new Error('ownerId+groupKey+groupId isolation failed');
  const row=await client.query(`SELECT candidate_sha,metadata FROM public.hipico_observability_events WHERE id=$1`,[a.rows[0].id]);
  if(row.rows[0].candidate_sha!==sha||JSON.stringify(row.rows[0].metadata).includes('secret'))throw new Error('candidate/evidence contract failed');
  let immutable=false; try{await client.query(`UPDATE public.hipico_observability_events SET reason_code='MUTATED' WHERE id=$1`,[a.rows[0].id]);}catch(error){immutable=String(error?.code)==='55000';}
  if(!immutable)throw new Error('append-only trigger did not reject UPDATE');
  console.log(JSON.stringify({ok:true,sha,scopeIsolation:true,appendOnly:true}));
}finally{await client.end();}
