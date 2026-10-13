// ContaGest backend startup invariants (#665). Pure and safe to call
// before importing routes or opening a listening socket. Never return or
// log env values: error identifiers alone are enough for operations.
export type BackendStartupInput = Readonly<Record<string,string|undefined>>;

const NODE_ENVS=new Set(['development','test','production']);
const VERCEL_ENVS=new Set(['development','preview','production']);
const STARTUP_ERROR='BACKEND_STARTUP_CONFIG_INVALID';

export function checkBackendStartupConfig(config: BackendStartupInput) {
  const failures: string[]=[];
  const nodeEnv=config.NODE_ENV || 'development';
  const vercelEnv=config.VERCEL_ENV || '';
  if(!NODE_ENVS.has(nodeEnv))failures.push('NODE_ENV_UNRECOGNIZED');
  if(vercelEnv&&!VERCEL_ENVS.has(vercelEnv))failures.push('VERCEL_ENV_UNRECOGNIZED');
  if(config.PORT!==undefined){
    // Coercing with Number alone allows empty strings and fractional ports.
    const candidate=String(config.PORT).trim();
    const port=Number(candidate);
    if(!/^[0-9]{1,5}$/.test(candidate)||!Number.isInteger(port)||port<1||port>65535)
      failures.push('PORT_OUT_OF_RANGE');
  }
  const production=vercelEnv==='production'||(!vercelEnv&&nodeEnv==='production');
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
