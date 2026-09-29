import { currentRuntimeTenantId } from './runtime-tenant-context.js';

type TenantBinder=(transactionClient:any,tenantId:string)=>Promise<unknown>;

const TENANT_RAW_METHODS=new Set([
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
]);

function isDelegate(value:unknown){
  return Boolean(value&&typeof value==='object');
}

async function inTenantTransaction(
  base:any,
  tenantId:string,
  bindTenant:TenantBinder,
  operation:(transactionClient:any)=>unknown,
  options?:unknown,
){
  return base.$transaction(async(transactionClient:any)=>{
    await bindTenant(transactionClient,tenantId);
    return operation(transactionClient);
  },options);
}

export function createTenantScopedPrismaProxy<TClient extends object>(base:TClient,bindTenant:TenantBinder):TClient{
  const delegateCache=new Map<PropertyKey,unknown>();

  return new Proxy(base,{
    get(target,property,_receiver){
      const member=Reflect.get(target,property,target);

      if(property==='$transaction'&&typeof member==='function'){
        return (input:unknown,options?:unknown)=>{
          const tenantId=currentRuntimeTenantId();
          if(!tenantId)return Reflect.apply(member,target,[input,options]);
          if(typeof input!=='function')throw new Error('TENANT_TRANSACTION_CALLBACK_REQUIRED');
          return inTenantTransaction(target,tenantId,bindTenant,(transactionClient)=>input(transactionClient),options);
        };
      }

      if(typeof property==='string'&&TENANT_RAW_METHODS.has(property)&&typeof member==='function'){
        return (...args:unknown[])=>{
          const tenantId=currentRuntimeTenantId();
          if(!tenantId)return Reflect.apply(member,target,args);
          return inTenantTransaction(target,tenantId,bindTenant,(transactionClient)=>{
            const transactionMethod=Reflect.get(transactionClient,property,transactionClient);
            if(typeof transactionMethod!=='function')throw new Error(`TENANT_TRANSACTION_METHOD_MISSING:${property}`);
            return Reflect.apply(transactionMethod,transactionClient,args);
          });
        };
      }

      if(typeof property==='string'&&!property.startsWith('$')&&isDelegate(member)){
        if(delegateCache.has(property))return delegateCache.get(property);
        const delegateProxy=new Proxy(member as object,{
          get(delegateTarget,delegateProperty,_delegateReceiver){
            const delegateMember=Reflect.get(delegateTarget,delegateProperty,delegateTarget);
            if(typeof delegateMember!=='function')return delegateMember;
            return (...args:unknown[])=>{
              const tenantId=currentRuntimeTenantId();
              if(!tenantId)return Reflect.apply(delegateMember,delegateTarget,args);
              return inTenantTransaction(target,tenantId,bindTenant,(transactionClient)=>{
                const transactionDelegate=Reflect.get(transactionClient,property,transactionClient);
                const transactionMethod=Reflect.get(transactionDelegate,delegateProperty,transactionDelegate);
                if(typeof transactionMethod!=='function'){
                  throw new Error(`TENANT_MODEL_METHOD_MISSING:${property}.${String(delegateProperty)}`);
                }
                return Reflect.apply(transactionMethod,transactionDelegate,args);
              });
            };
          },
        });
        delegateCache.set(property,delegateProxy);
        return delegateProxy;
      }

      return typeof member==='function'?member.bind(target):member;
    },
  });
}
