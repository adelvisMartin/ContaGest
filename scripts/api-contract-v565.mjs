#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(SCRIPT_DIR,'..');
const APP_FILE='backend/src/app.ts';
const MANIFEST_FILE='backend/src/modules/route-manifest.ts';
const POLICY_FILE='backend/src/contracts/api-contract-v1.json';
const OPENAPI_FILE='backend/src/contracts/openapi-v1.generated.json';
const CATALOG_FILE='backend/src/contracts/api-route-catalog-v1.generated.json';
const writeMode=process.argv.includes('--write');
const checkMode=process.argv.includes('--check')||!writeMode;

const read=(file)=>fs.readFileSync(path.join(ROOT,file),'utf8');
const policy=JSON.parse(read(POLICY_FILE));
const appSource=read(APP_FILE);
const manifestSource=read(MANIFEST_FILE);

function normalizePath(base,relative=''){
  const left=String(base||'').replace(/\/$/,'');
  const right=String(relative||'').trim();
  const joined=right==='/'?left||'/':`${left}/${right.replace(/^\//,'')}`;
  return (joined||'/').replace(/\/+/g,'/').replace(/:([A-Za-z0-9_]+)/g,'{$1}');
}

function sourceHash(file){
  return crypto.createHash('sha256').update(read(file)).digest('hex');
}

function routeMethods(source){
  const routes=[];
  const expression=/\brouter\.(get|post|put|patch|delete|options|head)\s*\(\s*(['"`])([^'"`]+)\2/g;
  for(const match of source.matchAll(expression)) routes.push({method:match[1].toUpperCase(),relativePath:match[3]});
  return routes;
}

function manifestMounts(){
  const imports=new Map();
  const importExpression=/import\s+(\w+)\s+from\s+['"]\.\/([^'"]+\.routes)\.js['"]/g;
  for(const match of manifestSource.matchAll(importExpression)) imports.set(match[1],`backend/src/modules/${match[2]}.ts`);
  const mounts=[];
  const entryExpression=/\{\s*id:\s*'([^']+)'\s*,\s*domain:\s*'([^']+)'\s*,\s*path:\s*'([^']+)'\s*,\s*router:\s*(\w+)\s*\}/g;
  for(const match of manifestSource.matchAll(entryExpression)){
    const [,id,domain,basePath,alias]=match;
    const source=imports.get(alias);
    if(!source)throw new Error(`API_CONTRACT_DRIFT: manifest router ${alias} (${id}) has no resolvable route import`);
    mounts.push({id,alias,source,basePath:`/api/v1${basePath}`,owner:domain,auth:'required',tenant:'required',origin:'route-manifest.ts'});
  }
  if(mounts.length<10)throw new Error(`API_CONTRACT_DRIFT: suspiciously small MODULE_ROUTE_MANIFEST (${mounts.length})`);
  return mounts;
}

function directMounts(){
  const imports=[...appSource.matchAll(/import\s+(\w+)\s+from\s+['"]\.\/([^'"]+\.routes)\.js['"]/g)]
    .map((match)=>({alias:match[1],source:`backend/src/${match[2]}.ts`}));
  const governed=new Map(policy.directMounts.map((mount)=>[mount.alias,mount]));
  const ignored=new Set(['apiRoutes']);
  for(const item of imports){
    if(ignored.has(item.alias))continue;
    const declared=governed.get(item.alias);
    if(!declared)throw new Error(`API_CONTRACT_DRIFT: app.ts directly imports ungoverned router ${item.alias} (${item.source})`);
    if(declared.source!==item.source)throw new Error(`API_CONTRACT_DRIFT: ${item.alias} source mismatch: ${item.source} != ${declared.source}`);
    if(!appSource.includes(declared.basePath))throw new Error(`API_CONTRACT_DRIFT: ${item.alias} base path ${declared.basePath} is not mounted in app.ts`);
  }
  for(const mount of policy.directMounts){
    if(!imports.some((item)=>item.alias===mount.alias))throw new Error(`API_CONTRACT_DRIFT: declared direct mount ${mount.alias} is not imported by app.ts`);
  }
  return policy.directMounts.map((mount)=>({...mount,id:mount.alias,origin:'app.ts'}));
}

function discover(){
  const mounts=[...manifestMounts(),...directMounts()];
  const endpoints=[];
  for(const mount of mounts){
    if(!fs.existsSync(path.join(ROOT,mount.source)))throw new Error(`API_CONTRACT_DRIFT: route source missing ${mount.source}`);
    const source=read(mount.source);
    for(const route of routeMethods(source)){
      endpoints.push({
        method:route.method,
        path:normalizePath(mount.basePath,route.relativePath),
        relativePath:route.relativePath,
        source:mount.source,
        sourceHash:sourceHash(mount.source),
        owner:mount.owner,
        auth:mount.auth,
        tenant:mount.tenant,
        origin:mount.origin
      });
    }
  }
  for(const endpoint of policy.specialEndpoints) endpoints.push({...endpoint,source:APP_FILE,sourceHash:sourceHash(APP_FILE),origin:'app.ts-special'});
  const unique=new Map();
  for(const endpoint of endpoints){
    const key=`${endpoint.method} ${endpoint.path}`;
    if(unique.has(key))throw new Error(`API_CONTRACT_DRIFT: duplicate endpoint ${key} from ${endpoint.source} and ${unique.get(key).source}`);
    unique.set(key,endpoint);
  }
  if(unique.size<25)throw new Error(`API_CONTRACT_DRIFT: discovered endpoint catalog unexpectedly small (${unique.size})`);
  return [...unique.values()].sort((a,b)=>`${a.path}:${a.method}`.localeCompare(`${b.path}:${b.method}`));
}

function operationId(endpoint){
  if(endpoint.operationId)return endpoint.operationId;
  const stem=endpoint.source.split('/').pop().replace(/\.routes\.ts$/,'').replace(/[^A-Za-z0-9]+(.)/g,(_,c)=>String(c||'').toUpperCase());
  const suffix=endpoint.path.replace(/\{([^}]+)\}/g,'By_$1').replace(/^\/api\/v1\/?/,'').replace(/[^A-Za-z0-9]+(.)/g,(_,c)=>String(c||'').toUpperCase()).replace(/[^A-Za-z0-9]/g,'');
  return `${stem}_${endpoint.method.toLowerCase()}_${suffix||'root'}`;
}

function toOpenApi(endpoints){
  const paths={};
  for(const endpoint of endpoints){
    const method=endpoint.method.toLowerCase();
    paths[endpoint.path]??={};
    paths[endpoint.path][method]={
      operationId:operationId(endpoint),
      tags:[String(endpoint.owner||'platform')],
      'x-contagest-owner':endpoint.owner,
      'x-contagest-auth':endpoint.auth,
      'x-contagest-tenant-scope':endpoint.tenant,
      'x-contagest-source':endpoint.source,
      responses:{
        '200':{description:'Successful response'},
        '4XX':{description:'Client error',content:{'application/json':{schema:{'$ref':'#/components/schemas/ErrorEnvelope'}}}},
        '5XX':{description:'Server error',content:{'application/json':{schema:{'$ref':'#/components/schemas/ErrorEnvelope'}}}}
      }
    };
  }
  return {
    openapi:'3.1.0',
    info:{title:policy.title,version:policy.apiVersion,description:'Generated from mounted ContaGest routers. Do not edit by hand.'},
    servers:[{url:'/'}],
    paths,
    components:{schemas:{
      ErrorEnvelope:{type:'object',required:policy.errorEnvelope.required,properties:{
        ok:{type:'boolean',const:false},code:{type:'string'},message:{type:'string'},details:{},requestId:{type:'string'},retryable:{type:'boolean'}
      }},
      DecimalString:{type:'string',pattern:'^-?\\d+(?:\\.\\d+)?$'},
      Rfc3339DateTime:{type:'string',format:'date-time'},
      OpaqueId:{type:'string',minLength:1}
    }},
    'x-contagest-generated-from':[APP_FILE,MANIFEST_FILE,POLICY_FILE],
    'x-contagest-contract-schema-version':policy.schemaVersion
  };
}

const endpoints=discover();
const openapi=toOpenApi(endpoints);
const catalog={schemaVersion:policy.schemaVersion,apiVersion:policy.apiVersion,generatedFrom:[APP_FILE,MANIFEST_FILE,POLICY_FILE],endpointCount:endpoints.length,endpoints};

if(checkMode){
  const operationIds=new Set();
  for(const endpoint of endpoints){
    const id=operationId(endpoint);
    if(operationIds.has(id))throw new Error(`API_CONTRACT_DRIFT: duplicate operationId ${id}`);
    operationIds.add(id);
    if(!endpoint.path.startsWith('/api/v1/')&&!['/health','/readiness'].includes(endpoint.path))throw new Error(`API_CONTRACT_DRIFT: unversioned endpoint ${endpoint.method} ${endpoint.path}`);
  }
  if(policy.hipico.canonicalPrefix!=='/api/v1/hipico')throw new Error('API_CONTRACT_DRIFT: canonical Hípico prefix changed without version policy');
  console.log(`[api-contract-v565] OpenAPI check passed: endpoints=${endpoints.length} mounts=${policy.directMounts.length} drift=none`);
}

if(writeMode){
  fs.writeFileSync(path.join(ROOT,OPENAPI_FILE),`${JSON.stringify(openapi,null,2)}\n`);
  fs.writeFileSync(path.join(ROOT,CATALOG_FILE),`${JSON.stringify(catalog,null,2)}\n`);
  console.log(`[api-contract-v565] wrote OpenAPI=${OPENAPI_FILE} catalog=${CATALOG_FILE} endpoints=${endpoints.length}`);
}
