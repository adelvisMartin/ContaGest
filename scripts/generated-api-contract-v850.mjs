#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const METHODS = ['get','post','put','patch','delete','options','head'];
const METHOD_WORD = { get:'get', post:'create', put:'replace', patch:'update', delete:'delete', options:'options', head:'head' };
const CLIENT_SLICE_PREFIXES = ['/api/v1/clients'];
const GENERATED_CLIENT_PATH = 'frontend/src/generated/api-client-v850.ts';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key, stable(item)]));
  return value;
}
export function stableJson(value) { return `${JSON.stringify(stable(value), null, 2)}\n`; }

function words(value) {
  return String(value).replace(/:([A-Za-z0-9_]+)/g, ' by $1 ')
    .replace(/\{([A-Za-z0-9_]+)\}/g, ' by $1 ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim().split(/\s+/).filter(Boolean);
}
function pascal(value) { return words(value).map((part) => part[0].toUpperCase() + part.slice(1)).join(''); }
export function operationIdFor(route) {
  const method = String(route.method || '').toLowerCase();
  return `${METHOD_WORD[method] || method}${pascal(route.path)}`;
}
function openApiPath(value) { return String(value).replace(/:([A-Za-z0-9_]+)/g, '{$1}'); }
function routeAudience(route) {
  const permissions = route.auth?.permissions || [];
  const platform = /\/platform(?:\/|$)/i.test(route.path) || permissions.some((permission) => /^platform[.:_-]/i.test(permission));
  if (platform) return 'platform';
  if (route.auth?.tenantRequired || permissions.length) return 'tenant';
  return 'public';
}
function audienceAllows(route, audience) {
  const actual = routeAudience(route);
  if (audience === 'all') return true;
  if (audience === 'public') return actual === 'public';
  if (audience === 'tenant') return actual === 'public' || actual === 'tenant';
  if (audience === 'platform') return true;
  throw new Error(`OPENAPI_AUDIENCE_UNKNOWN:${audience}`);
}
function schemaForQuery(meta = {}) {
  const type = ['integer','number','boolean','string','array'].includes(meta.type) ? meta.type : 'string';
  const schema = { type };
  if (meta.default !== undefined) schema.default = meta.default;
  if (meta.max !== undefined && ['integer','number'].includes(type)) schema.maximum = meta.max;
  return schema;
}
function parametersFor(route) {
  const parameters = [];
  for (const match of String(route.path).matchAll(/:([A-Za-z0-9_]+)/g)) {
    parameters.push({ name:match[1], in:'path', required:true, schema:{type:'string'} });
  }
  for (const [name, meta] of Object.entries(route.request?.query || {}).sort(([a],[b]) => a.localeCompare(b))) {
    parameters.push({ name, in:'query', required:false, schema:schemaForQuery(meta) });
  }
  if (route.auth?.tenantRequired) {
    parameters.push({ name:'x-tenant-id', in:'header', required:false, schema:{type:'string'}, description:'Tenant context when required by the runtime guard; session-derived context remains authoritative.' });
  }
  return parameters;
}
function requestBodyFor(route) {
  const fingerprint = route.request?.bodySchema;
  if (!fingerprint) return undefined;
  return {
    required:true,
    content:{
      'application/json':{
        schema:{ type:'object', additionalProperties:true, 'x-contagest-runtime-schema':fingerprint }
      }
    }
  };
}
function canonicalResponses(route) {
  const responses = {};
  for (const status of route.responses?.success || [200]) {
    responses[String(status)] = {
      description:'Successful response derived from #652 runtime status metadata.',
      content:{'application/json':{schema: route.envelope === 'canonical' ? {$ref:'#/components/schemas/SuccessEnvelope'} : {}}}
    };
  }
  for (const status of route.responses?.errors || []) {
    responses[String(status)] = {
      description:'Canonical operational error.',
      content:{'application/json':{schema:{$ref:'#/components/schemas/ProblemDetails'}}}
    };
  }
  return responses;
}
function problemSchema() {
  return {
    type:'object',
    additionalProperties:false,
    required:['ok','type','title','status','detail','code','message','correlationId'],
    properties:{
      ok:{const:false},
      type:{type:'string',format:'uri-reference'},
      title:{type:'string'},
      status:{type:'integer',minimum:400,maximum:599},
      detail:{type:'string'},
      instance:{type:'string'},
      code:{type:'string'},
      message:{type:'string',description:'Backward-compatible alias of detail.'},
      correlationId:{type:'string'},
      requestId:{type:'string'},
      details:{}
    }
  };
}
export function buildProjection(contract, { audience = 'all' } = {}) {
  if (Number(contract?.schemaVersion) !== 652) throw new Error('OPENAPI_SOURCE_NOT_652');
  if ((contract.conflicts || []).length) throw new Error(`OPENAPI_SOURCE_ROUTE_CONFLICT:${contract.conflicts[0].key}`);
  const paths = {};
  for (const route of [...(contract.routes || [])].filter((item) => audienceAllows(item, audience)).sort((a,b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`))) {
    const method = String(route.method).toLowerCase();
    if (!METHODS.includes(method)) continue;
    const pathname = openApiPath(route.path);
    const requestBody = requestBodyFor(route);
    paths[pathname] ||= {};
    paths[pathname][method] = {
      operationId:operationIdFor(route),
      deprecated:Boolean(route.deprecated),
      parameters:parametersFor(route),
      ...(requestBody ? { requestBody } : {}),
      responses:canonicalResponses(route),
      'x-contagest-source':route.source,
      'x-contagest-audience':routeAudience(route),
      'x-contagest-auth':{
        tenantRequired:Boolean(route.auth?.tenantRequired),
        permissions:[...(route.auth?.permissions || [])].sort()
      },
      'x-contagest-request-schema':route.request?.bodySchema || null
    };
  }
  const document = {
    openapi:'3.1.0',
    info:{title:'ContaGest API',version:String(contract.apiVersion || '1.0.0'),description:'Generated projection of canonical runtime contract #652. DO NOT EDIT.'},
    jsonSchemaDialect:'https://json-schema.org/draft/2020-12/schema',
    paths,
    components:{schemas:{
      SuccessEnvelope:{type:'object',required:['ok','data'],properties:{ok:{const:true},data:{},meta:{type:'object',additionalProperties:true}}},
      ProblemDetails:problemSchema()
    }},
    'x-contagest-generated-from':652,
    'x-contagest-audience':audience,
    'x-contagest-correlation-header':contract.conventions?.correlationHeader || 'x-correlation-id',
    'x-contagest-pagination':contract.conventions?.pagination || null
  };
  assertOperationIds(document);
  assertAudienceIsolation(document);
  return stable(document);
}

export function assertOperationIds(document) {
  const seen = new Map();
  for (const [pathname, pathItem] of Object.entries(document.paths || {})) {
    for (const method of METHODS) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      if (!operation.operationId) throw new Error(`OPENAPI_OPERATION_ID_MISSING:${method.toUpperCase()} ${pathname}`);
      const previous = seen.get(operation.operationId);
      if (previous) throw new Error(`OPENAPI_OPERATION_ID_DUPLICATE:${operation.operationId}:${previous}:${method.toUpperCase()} ${pathname}`);
      seen.set(operation.operationId, `${method.toUpperCase()} ${pathname}`);
    }
  }
  return true;
}
export function assertAudienceIsolation(document) {
  if (document['x-contagest-audience'] !== 'public') return true;
  for (const pathItem of Object.values(document.paths || {})) for (const method of METHODS) {
    const operation = pathItem?.[method];
    if (operation && (operation['x-contagest-auth']?.tenantRequired || operation['x-contagest-auth']?.permissions?.length)) {
      throw new Error(`OPENAPI_PUBLIC_PRIVILEGE_LEAK:${operation.operationId}`);
    }
  }
  return true;
}
function operationMap(document) {
  const map = new Map();
  for (const [pathname,pathItem] of Object.entries(document.paths || {})) for (const method of METHODS) {
    const operation = pathItem?.[method];
    if (operation) map.set(`${method.toUpperCase()} ${pathname}`, operation);
  }
  return map;
}
export function classifyCompatibility(base, current) {
  const breaking = [], behaviorSensitive = [], additive = [];
  const before = operationMap(base), after = operationMap(current);
  for (const [key, oldOp] of before) {
    const nextOp = after.get(key);
    if (!nextOp) { breaking.push(`OPERATION_REMOVED:${key}`); continue; }
    if (oldOp.operationId !== nextOp.operationId) breaking.push(`OPERATION_ID_CHANGED:${key}:${oldOp.operationId}:${nextOp.operationId}`);
    const oldAuth = oldOp['x-contagest-auth'] || {};
    const nextAuth = nextOp['x-contagest-auth'] || {};
    if (!oldAuth.tenantRequired && nextAuth.tenantRequired) breaking.push(`AUTH_TIGHTENED:${key}`);
    const oldPermissions = new Set(oldAuth.permissions || []);
    const addedPermissions = (nextAuth.permissions || []).filter((item) => !oldPermissions.has(item));
    if (addedPermissions.length) breaking.push(`RBAC_TIGHTENED:${key}:${addedPermissions.join(',')}`);
    if ((oldOp['x-contagest-request-schema'] || null) !== (nextOp['x-contagest-request-schema'] || null)) behaviorSensitive.push(`REQUEST_SCHEMA_CHANGED:${key}`);
    if (stableJson(oldOp.parameters || []) !== stableJson(nextOp.parameters || [])) behaviorSensitive.push(`PARAMETERS_CHANGED:${key}`);
  }
  for (const key of after.keys()) if (!before.has(key)) additive.push(`OPERATION_ADDED:${key}`);
  const classification = breaking.length ? 'breaking' : behaviorSensitive.length ? 'behavior-sensitive' : additive.length ? 'additive' : 'none';
  return { classification, breaking, behaviorSensitive, additive, compatible:breaking.length === 0 };
}

function clientOperationEntries(document, pathPrefixes = []) {
  const entries = [];
  for (const [pathname,pathItem] of Object.entries(document.paths || {})) {
    if (pathPrefixes.length && !pathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) continue;
    for (const method of METHODS) {
      const operation = pathItem?.[method];
      if (operation) entries.push({pathname,method,operation});
    }
  }
  return entries.sort((a,b) => a.operation.operationId.localeCompare(b.operation.operationId));
}
export function renderTypedClient(document, { pathPrefixes = [] } = {}) {
  assertOperationIds(document);
  const operations = clientOperationEntries(document, pathPrefixes);
  if (!operations.length) throw new Error('API_CLIENT_SLICE_EMPTY');
  const methods = operations.map(({pathname,method,operation}) => {
    const pathNames = (operation.parameters || []).filter((item) => item.in === 'path').map((item) => item.name);
    const queryNames = (operation.parameters || []).filter((item) => item.in === 'query').map((item) => item.name);
    const hasBody = Boolean(operation.requestBody);
    let body = `let path = ${JSON.stringify(pathname)};\n`;
    for (const name of pathNames) body += `      if (params[${JSON.stringify(name)}] == null) throw new Error(${JSON.stringify(`API_CLIENT_PATH_REQUIRED:${operation.operationId}:${name}`)});\n      path = path.replace(${JSON.stringify(`{${name}}`)}, encodeURIComponent(String(params[${JSON.stringify(name)}])));\n`;
    if (queryNames.length) {
      body += '      const query = new URLSearchParams();\n';
      for (const name of queryNames) body += `      if (params[${JSON.stringify(name)}] != null) query.set(${JSON.stringify(name)}, String(params[${JSON.stringify(name)}]));\n`;
      body += '      if (query.size) path += `?${query.toString()}`;\n';
    }
    if (hasBody) body += '      const body = params.body;\n';
    const optionParts = [`method:${JSON.stringify(method.toUpperCase())}`];
    if (hasBody) optionParts.push('body');
    body += `      return transport.request<unknown>(path, { ${optionParts.join(', ')} });`;
    return `    async ${operation.operationId}(params: Record<string, unknown> = {}) {\n      ${body}\n    }`;
  }).join(',\n');
  return `/* AUTO-GENERATED FROM #652 BY #850. DO NOT EDIT. */\nexport type GeneratedRequestOptions = { method: string; body?: unknown; headers?: Record<string, string> };\nexport type GeneratedTransport = { request<T>(path: string, options?: GeneratedRequestOptions): Promise<T> };\nexport type ProblemDetails = { ok: false; type: string; title: string; status: number; detail: string; instance?: string; code: string; message: string; correlationId: string; requestId?: string; details?: unknown };\n\nexport function createGeneratedApiClient(transport: GeneratedTransport) {\n  return {\n${methods}\n  };\n}\n`;
}

async function contractModule() { return import('./api-contract-authority-v652.mjs'); }
async function canonicalContract() { return (await contractModule()).buildApiContract(); }
async function canonicalContractForRef(ref) {
  const module = await contractModule();
  if (typeof module.buildApiContractForRef !== 'function') throw new Error('API_CONTRACT_REF_READER_MISSING');
  return module.buildApiContractForRef(ref);
}
function generatedClientFor(contract) {
  return renderTypedClient(buildProjection(contract,{audience:'tenant'}), {pathPrefixes:CLIENT_SLICE_PREFIXES});
}
function writeClient(content) {
  const target=path.join(ROOT,GENERATED_CLIENT_PATH); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,content);
}
function checkClient(content) {
  const target=path.join(ROOT,GENERATED_CLIENT_PATH);
  if (!fs.existsSync(target) || fs.readFileSync(target,'utf8') !== content) throw new Error(`OPENAPI_GENERATED_DRIFT:${GENERATED_CLIENT_PATH}`);
}
function parseArgs(argv) {
  const out={write:false,check:false,base:'main',out:'',audience:'all'};
  for(let i=0;i<argv.length;i+=1){const arg=argv[i];if(arg==='--write')out.write=true;else if(arg==='--check')out.check=true;else if(arg==='--base')out.base=argv[++i]||'main';else if(arg.startsWith('--base='))out.base=arg.slice(7);else if(arg==='--out')out.out=argv[++i]||'';else if(arg.startsWith('--out='))out.out=arg.slice(6);else if(arg==='--audience')out.audience=argv[++i]||'all';else if(arg.startsWith('--audience='))out.audience=arg.slice(11);else throw new Error(`OPENAPI_ARGUMENT_UNKNOWN:${arg}`);}return out;
}
async function cli() {
  const args=parseArgs(process.argv.slice(2));
  const contract=await canonicalContract();
  const first=buildProjection(contract,{audience:args.audience});
  const second=buildProjection(contract,{audience:args.audience});
  if(stableJson(first)!==stableJson(second))throw new Error('OPENAPI_NON_DETERMINISTIC');
  const client=generatedClientFor(contract);
  if(args.write)writeClient(client);
  if(args.check)checkClient(client);
  if(args.out){const target=path.resolve(ROOT,args.out);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,stableJson(first));}
  let compatibility={classification:'not-compared',breaking:[],behaviorSensitive:[],additive:[],compatible:true};
  let baseSha=null;
  if(args.check){
    baseSha=execFileSync('git',['merge-base',args.base,'HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
    const baseContract=await canonicalContractForRef(baseSha);
    compatibility=classifyCompatibility(buildProjection(baseContract,{audience:'all'}),buildProjection(contract,{audience:'all'}));
    if(compatibility.breaking.length)throw new Error(`OPENAPI_BREAKING_CHANGE:${compatibility.breaking.join('|')}`);
  }
  if(!args.out)process.stdout.write(`${JSON.stringify({ticket:850,source:652,audience:args.audience,baseSha,compatibility,operationCount:operationMap(first).size,generatedClient:GENERATED_CLIENT_PATH},null,2)}\n`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))cli().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
