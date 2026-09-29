#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'config/agent-skill-contracts-v3.json'),'utf8'));
const scripts=new Set(Object.keys(pkg.scripts||{}));
const contracts=new Map(registry.skills.map((skill)=>[skill.id,skill]));
const owned=fs.readdirSync(path.join(ROOT,'.agents/skills'),{withFileTypes:true}).filter((entry)=>entry.isDirectory()&&entry.name.startsWith('contagest-')).map((entry)=>entry.name).sort();
const findings=[];
const add=(type,severity,skill,evidence)=>findings.push({type,severity,skill,evidence});

for(const id of owned){
  const file=path.join(ROOT,'.agents/skills',id,'SKILL.md');
  if(!fs.existsSync(file)){add('STALE_PATH','P1',id,'SKILL.md missing');continue;}
  const source=fs.readFileSync(file,'utf8');
  if(!contracts.has(id))add('MISSING_V3_CONTRACT','P1',id,'No registry entry');
  if(source.length>12000)add('CONTEXT_COST','P2',id,`${source.length} chars; review progressive disclosure`);
  const commands=[...source.matchAll(/npm\s+run\s+([\w:.-]+)/g)].map((match)=>match[1]);
  for(const command of new Set(commands))if(!scripts.has(command))add('STALE_COMMAND','P1',id,`npm run ${command} does not exist`);
}

const purposeOwners=new Map();
for(const skill of registry.skills){
  const key=String(skill.purpose||'').trim().toLowerCase();
  if(!key)continue;
  const list=purposeOwners.get(key)||[];list.push(skill.id);purposeOwners.set(key,list);
}
for(const owners of purposeOwners.values())if(owners.length>1)add('DUPLICATE_PURPOSE','P2',owners.join(','),'Exact duplicate purpose text');

const graph=new Map(registry.skills.map((skill)=>[skill.id,(skill.dependencies||[]).filter((id)=>contracts.has(id))]));
const visiting=new Set(),visited=new Set(),cycles=new Set();
function visit(node,trail=[]){
  if(visiting.has(node)){const i=trail.indexOf(node);cycles.add([...trail.slice(i),node].join(' -> '));return;}
  if(visited.has(node))return;
  visiting.add(node);for(const next of graph.get(node)||[])visit(next,[...trail,node]);visiting.delete(node);visited.add(node);
}
for(const id of graph.keys())visit(id,[]);
for(const cycle of cycles)add('CIRCULAR_DEPENDENCY','P2',cycle.split(' -> ')[0],cycle);

findings.sort((a,b)=>a.severity.localeCompare(b.severity)||a.type.localeCompare(b.type)||a.skill.localeCompare(b.skill));
const blocking=findings.filter((finding)=>finding.severity==='P0'||finding.severity==='P1');
console.log(JSON.stringify({schemaVersion:3,status:blocking.length?'FAIL':'PASS',skills:owned.length,findings},null,2));
if(blocking.length)process.exitCode=1;
