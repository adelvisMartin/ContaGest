export const MIN_HIPICO_RUNTIME_SECRET_BYTES=32;

const PUBLIC_PLACEHOLDER_PATTERN=/(?:REEMPLAZA|REPLACE|CHANGE[_-]?ME|CHANGEME|PLACEHOLDER|YOUR[_-]?(?:SECRET|TOKEN|KEY)|TU[_-]?(?:SECRETO|TOKEN|CLAVE)|EXAMPLE[_-]?(?:SECRET|TOKEN|KEY))/i;

export function hipicoRuntimeSecretConfigured(value:unknown,minBytes=MIN_HIPICO_RUNTIME_SECRET_BYTES){
  const minimum=Number.isInteger(minBytes)&&Number(minBytes)>0?Number(minBytes):MIN_HIPICO_RUNTIME_SECRET_BYTES;
  const secret=String(value||'').trim();
  if(Buffer.byteLength(secret,'utf8')<minimum)return false;
  if(PUBLIC_PLACEHOLDER_PATTERN.test(secret))return false;
  return true;
}

export function hipicoNumericProviderIdConfigured(value:unknown){
  return /^\d{5,30}$/.test(String(value||'').trim());
}

export const __test__={PUBLIC_PLACEHOLDER_PATTERN};
