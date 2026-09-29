#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const FAILURE_CODES=Object.freeze({
  DUPLICATE_EFFECT:'DUPLICATE_EFFECT',
  UNBALANCED_ENTRY:'UNBALANCED_ENTRY',
  ORPHAN_SOURCE:'ORPHAN_SOURCE',
  POSTED_MUTATION:'POSTED_MUTATION',
  DATASET_INVALID:'DATASET_INVALID',
});

export function validateGoldenDataset(dataset){
  if(!dataset||dataset.schemaVersion!==1||dataset.issue!==643||dataset.synthetic!==true)throw new Error(FAILURE_CODES.DATASET_INVALID);
  if(typeof dataset.datasetVersion!=='string'||!dataset.datasetVersion.startsWith('accounting-characterization-v643.'))throw new Error(FAILURE_CODES.DATASET_INVALID);
  if(!Array.isArray(dataset.scenarios)||dataset.scenarios.length<8)throw new Error(FAILURE_CODES.DATASET_INVALID);
  if(!Array.isArray(dataset.invariants)||dataset.invariants.length<6)throw new Error(FAILURE_CODES.DATASET_INVALID);
  if(!Array.isArray(dataset.goldenEffects)||!dataset.goldenEffects.length)throw new Error(FAILURE_CODES.DATASET_INVALID);
  return true;
}

export function reconcileEffects(effects){
  const findings=[];
  const seen=new Map();
  let debitMinor=0n;
  let creditMinor=0n;
  for(const effect of effects||[]){
    const key=String(effect?.effectKey||'');
    const debit=BigInt(effect?.debitMinor??0);
    const credit=BigInt(effect?.creditMinor??0);
    debitMinor+=debit;creditMinor+=credit;
    if(!key)findings.push({code:FAILURE_CODES.DATASET_INVALID,source:String(effect?.source||'')});
    else if(seen.has(key))findings.push({code:FAILURE_CODES.DUPLICATE_EFFECT,effectKey:key,firstSource:seen.get(key),source:String(effect?.source||'')});
    else seen.set(key,String(effect?.source||''));
    if(debit!==credit)findings.push({code:FAILURE_CODES.UNBALANCED_ENTRY,effectKey:key,debitMinor:debit.toString(),creditMinor:credit.toString()});
    if(effect?.sourceExists!==true)findings.push({code:FAILURE_CODES.ORPHAN_SOURCE,effectKey:key,source:String(effect?.source||'')});
    if(effect?.posted===true&&effect?.mutatedAfterPosting===true)findings.push({code:FAILURE_CODES.POSTED_MUTATION,effectKey:key});
  }
  if(debitMinor!==creditMinor)findings.push({code:FAILURE_CODES.UNBALANCED_ENTRY,effectKey:'__TOTAL__',debitMinor:debitMinor.toString(),creditMinor:creditMinor.toString()});
  return Object.freeze({status:findings.length?'FAIL':'PASS',debitMinor:debitMinor.toString(),creditMinor:creditMinor.toString(),logicalEffects:seen.size,findings});
}

export function characterizeDataset(dataset){
  validateGoldenDataset(dataset);
  const reconciliation=reconcileEffects(dataset.goldenEffects);
  return Object.freeze({
    datasetVersion:dataset.datasetVersion,
    scenarios:[...dataset.scenarios],
    invariants:[...dataset.invariants],
    sourceFixture:dataset.sourceFixture,
    realPostgresAdapter:dataset.realPostgresAdapter,
    reconciliation,
  });
}

export function injectFailure(dataset,type){
  validateGoldenDataset(dataset);
  const clone=structuredClone(dataset);
  const first=clone.goldenEffects[0];
  if(type==='duplicate-effect')clone.goldenEffects.push({...first,source:`${first.source}-duplicate`});
  else if(type==='unbalanced-entry')clone.goldenEffects[0]={...first,creditMinor:Number(first.creditMinor)-1};
  else if(type==='orphan-source')clone.goldenEffects[0]={...first,sourceExists:false};
  else if(type==='posted-mutation')clone.goldenEffects[0]={...first,posted:true,mutatedAfterPosting:true};
  else throw new Error(`UNKNOWN_FAILURE_FIXTURE:${type}`);
  return clone;
}

export { FAILURE_CODES };

function cli(){
  const file=process.argv[2]||'qa/fixtures/accounting-characterization-v643.json';
  const dataset=JSON.parse(fs.readFileSync(file,'utf8'));
  const result=characterizeDataset(dataset);
  console.log(JSON.stringify(result,null,2));
  if(result.reconciliation.status!=='PASS')process.exitCode=1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{cli();}catch(error){console.error(`[accounting-reconciliation-v643] ${error instanceof Error?error.message:String(error)}`);process.exitCode=1;}
}
