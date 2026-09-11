import crypto from 'node:crypto';
import { hipicoRuntimeSecretConfigured, MIN_HIPICO_RUNTIME_SECRET_BYTES } from './hipico-secret-security.js';

export const MIN_BRIDGE_TOKEN_LENGTH=MIN_HIPICO_RUNTIME_SECRET_BYTES;

export function configuredBridgeToken(env:NodeJS.ProcessEnv=process.env){
  return String(env.HIPICO_GROUP_BRIDGE_TOKEN||env.HIPICO_BRIDGE_TOKEN||'').trim();
}

export function bridgeTokenConfigured(env:NodeJS.ProcessEnv=process.env){
  return hipicoRuntimeSecretConfigured(configuredBridgeToken(env),MIN_BRIDGE_TOKEN_LENGTH);
}

export function bridgeTokenValid(value:string|undefined,env:NodeJS.ProcessEnv=process.env){
  const expected=configuredBridgeToken(env);
  if(!hipicoRuntimeSecretConfigured(expected,MIN_BRIDGE_TOKEN_LENGTH)||!value)return false;
  const provided=String(value);
  if(Buffer.byteLength(expected)!==Buffer.byteLength(provided))return false;
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided));
}
