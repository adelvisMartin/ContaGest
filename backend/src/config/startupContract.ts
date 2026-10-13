// ContaGest backend startup invariants (#665). Pure and safe to call
// before importing routes or opening a listening socket. Never return or
// log env values: error identifiers alone are enough for operations.
export type BackendStartupInput = Readonly<Record<string,string|undefined>>;

const NODE_ENVS=new Set(['development','test','production']);
const VERCEL_ENVS=new Set(['development','preview','production']);
const STARTUP_ERROR='BACKEND_STARTUP_CONFIG_INVALID';

// Share one production predicate across startup and runtime security gates.
// A hosting preview label must never downgrade NODE_ENV=production.
export function isProductionBackendRuntime(config: BackendStartupInput): boolean {
  return config.NODE_ENV === 'production' || config.VERCEL_ENV === 'production';
}

export function checkBackendStartupConfig(config: BackendStartupInput) {
  const failures: string[]=[];
  const nodeEnv=config.NODE_ENV || 'development';
  const vercelEnv=config.VERCEL_ENV || '';
  if(!NODE_ENVS.has(nodeEnv))failures.push('NODE_ENV_UNRECOGNIZED');
  if(vercelEnv&&!VERCEL_ENVS.has(vercelEnv))failures.push('VERCEL_ENV_UNRECOGNIZED');
  // Either runtime declaring production must keep hard fail-closed boundaries.
  // A preview/development Vercel label cannot downgrade NODE_ENV=production.
  const production=isProductionBackendRuntime(config);
  if(config.PORT!==undefined){
    // Coercing with Number alone allows empty strings and fractional ports.
    const candidate=String(config.PORT).trim();
    const port=Number(candidate);
    // Node port 0 is useful for ephemeral test/dev listeners, but it is
    // not a stable production endpoint and must not silently auto-bind.
    if(!/^[0-9]{1,5}$/.test(candidate)||!Number.isInteger(port)||port>65535||
       (port===0&&production))
      failures.push('PORT_OUT_OF_RANGE');
  }
  if(production){
    if(config.API_MODE==='mock')failures.push('PRODUCTION_MOCK_API_FORBIDDEN');
    if(config.ALLOW_DEV_TENANT_HEADER==='true')failures.push('PRODUCTION_DEV_TENANT_HEADER_FORBIDDEN');
  }
  return {ok:failures.length===0,failures};
}

export function assertBackendStartupConfig(config: BackendStartupInput): void {
  const result=checkBackendStartupConfig(config);
  if(!result.ok)throw new Error(STARTUP_ERROR+':'+result.failures.join(','));
}
