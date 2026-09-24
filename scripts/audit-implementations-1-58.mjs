#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const manifestPath=path.join(root,'config/implementation-roadmap-1-58.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const errors=[];
const rows=Array.isArray(manifest?.implementations)?manifest.implementations:[];

const ids=rows.map((row)=>Number(row.id));
const expected=Array.from({length:58},(_,index)=>index+1);
if(JSON.stringify(ids)!==JSON.stringify(expected)){
  errors.push(`implementation ids must be exactly 1..58; got ${ids.join(',')}`);
}

for(const row of rows){
  if(!Array.isArray(row.prs)||row.prs.length===0) errors.push(`${row.id}: missing authoritative PR`);
  if(!Array.isArray(row.ownerPaths)||row.ownerPaths.length===0) errors.push(`${row.id}: missing owner paths`);
  if(!Array.isArray(row.regressionPaths)||row.regressionPaths.length===0) errors.push(`${row.id}: missing regression paths`);
  for(const relative of [...(row.ownerPaths||[]),...(row.regressionPaths||[])]){
    if(!fs.existsSync(path.join(root,relative))) errors.push(`${row.id}: missing path ${relative}`);
  }
  const expectedRoadmap=row.id<=51?'51':'75';
  if(String(row.roadmap)!==expectedRoadmap) errors.push(`${row.id}: expected roadmap denominator ${expectedRoadmap}`);
}

const superseded=new Set(manifest?.rules?.supersededDoNotRestore||[]);
for(const row of rows){
  for(const pr of row.prs||[]){
    if(superseded.has(Number(pr))) errors.push(`${row.id}: superseded PR ${pr} cannot be authoritative`);
  }
}

if(errors.length){
  console.error('Implementation roadmap audit: FAIL');
  for(const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const byArea=Object.fromEntries(
  [...new Set(rows.map((row)=>row.area))].sort().map((area)=>[area,rows.filter((row)=>row.area===area).length])
);
console.log('Implementation roadmap audit: PASS');
console.log(JSON.stringify({count:rows.length,byArea,cleanCodeReviewed:rows.filter((row)=>row.reviewStatus==='CLEAN_CODE_BATCH_1').map((row)=>row.id)},null,2));
