import crypto from 'node:crypto';
import { hipicoRuntimeSecretConfigured, MIN_HIPICO_RUNTIME_SECRET_BYTES } from './hipico-secret-security.js';

export const MIN_OPERATOR_TOKEN_LENGTH=MIN_HIPICO_RUNTIME_SECRET_BYTES;
export const MIN_OWNER_APPROVAL_TOKEN_LENGTH=MIN_HIPICO_RUNTIME_SECRET_BYTES;

function safeTokenEqual(left:string,right:string){
  if(Buffer.byteLength(left)!==Buffer.byteLength(right))return false;
  return crypto.timingSafeEqual(Buffer.from(left),Buffer.from(right));
}

export function configuredOperatorToken(env:NodeJS.ProcessEnv=process.env){
  return String(env.HIPICO_OPERATOR_CONTROL_TOKEN||env.HIPICO_BOT_OPERATOR_TOKEN||'').trim();
}

export function configuredOwnerApprovalToken(env:NodeJS.ProcessEnv=process.env){
  return String(env.HIPICO_OWNER_APPROVAL_TOKEN||'').trim();
}

export function operatorTokenConfigured(env:NodeJS.ProcessEnv=process.env){
  return hipicoRuntimeSecretConfigured(configuredOperatorToken(env),MIN_OPERATOR_TOKEN_LENGTH);
}

export function ownerApprovalTokenConfigured(env:NodeJS.ProcessEnv=process.env){
  const owner=configuredOwnerApprovalToken(env);
  const operator=configuredOperatorToken(env);
  return hipicoRuntimeSecretConfigured(owner,MIN_OWNER_APPROVAL_TOKEN_LENGTH)
    &&hipicoRuntimeSecretConfigured(operator,MIN_OPERATOR_TOKEN_LENGTH)
    &&owner!==operator;
}

export function operatorTokenValid(value:string|undefined,env:NodeJS.ProcessEnv=process.env){
  const expected=configuredOperatorToken(env);
  if(!hipicoRuntimeSecretConfigured(expected,MIN_OPERATOR_TOKEN_LENGTH)||!value)return false;
  return safeTokenEqual(expected,String(value));
}

export function ownerApprovalTokenValid(value:string|undefined,env:NodeJS.ProcessEnv=process.env){
  const expected=configuredOwnerApprovalToken(env);
  const operator=configuredOperatorToken(env);
  if(!hipicoRuntimeSecretConfigured(expected,MIN_OWNER_APPROVAL_TOKEN_LENGTH)||!value)return false;
  if(!hipicoRuntimeSecretConfigured(operator,MIN_OPERATOR_TOKEN_LENGTH)||expected===operator)return false;
  return safeTokenEqual(expected,String(value));
}

export function operatorActorRef(value:string|undefined){
  const token=String(value||'');
  return token?`operator:${crypto.createHash('sha256').update(token).digest('hex').slice(0,12)}`:'operator:unknown';
}

export const __test__={safeTokenEqual};
