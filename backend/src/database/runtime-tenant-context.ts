import { AsyncLocalStorage } from 'node:async_hooks';

const RUNTIME_TENANT_UUID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUNTIME_TENANT_LEGACY_PATTERN=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

type RuntimeTenantContext=Readonly<{tenantId:string}>;

const storage=new AsyncLocalStorage<RuntimeTenantContext>();

export function normalizeRuntimeTenantId(value:unknown){
  const tenantId=String(value??'').trim();
  if(RUNTIME_TENANT_UUID_PATTERN.test(tenantId))return tenantId.toLowerCase();
  if(RUNTIME_TENANT_LEGACY_PATTERN.test(tenantId))return tenantId;
  throw new Error('RUNTIME_TENANT_ID_INVALID');
}

export function currentRuntimeTenantId(){
  return storage.getStore()?.tenantId??null;
}

export function requireRuntimeTenantId(){
  const tenantId=currentRuntimeTenantId();
  if(!tenantId)throw new Error('RUNTIME_TENANT_CONTEXT_REQUIRED');
  return tenantId;
}

export function runWithRuntimeTenant<T>(tenantId:unknown,operation:()=>T){
  const normalized=normalizeRuntimeTenantId(tenantId);
  return storage.run(Object.freeze({tenantId:normalized}),operation);
}
