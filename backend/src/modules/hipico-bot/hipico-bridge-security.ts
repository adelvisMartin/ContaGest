import crypto from 'node:crypto';

export const MIN_BRIDGE_TOKEN_LENGTH=32;

export function configuredBridgeToken(env:NodeJS.ProcessEnv=process.env){
  return String(env.HIPICO_GROUP_BRIDGE_TOKEN||env.HIPICO_BRIDGE_TOKEN||'').trim();
}

export function bridgeTokenConfigured(env:NodeJS.ProcessEnv=process.env){
  return configuredBridgeToken(env).length>=MIN_BRIDGE_TOKEN_LENGTH;
}

export function bridgeTokenValid(value:string|undefined,env:NodeJS.ProcessEnv=process.env){
  const expected=configuredBridgeToken(env);
  if(expected.length<MIN_BRIDGE_TOKEN_LENGTH||!value)return false;
  const provided=String(value);
  if(Buffer.byteLength(expected)!==Buffer.byteLength(provided))return false;
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided));
}
