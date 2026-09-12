import crypto from 'node:crypto';

export const MIN_OPERATOR_TOKEN_LENGTH = 32;

export function configuredOperatorToken(env: NodeJS.ProcessEnv = process.env) {
  const primary = String(env.HIPICO_OPERATOR_CONTROL_TOKEN || '').trim();
  if (primary) return primary;
  return String(env.HIPICO_BOT_OPERATOR_TOKEN || '').trim();
}

export function operatorTokenConfigured(env: NodeJS.ProcessEnv = process.env) {
  return configuredOperatorToken(env).length >= MIN_OPERATOR_TOKEN_LENGTH;
}

function safeTokenEqual(expected:string,value:string|undefined){
  if(expected.length<MIN_OPERATOR_TOKEN_LENGTH||!value)return false;
  const provided=String(value);
  if(Buffer.byteLength(expected)!==Buffer.byteLength(provided))return false;
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided));
}

export function operatorTokenValid(value: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  return safeTokenEqual(configuredOperatorToken(env),value);
}

export function configuredOwnerApprovalToken(env:NodeJS.ProcessEnv=process.env){
  return String(env.HIPICO_OWNER_APPROVAL_TOKEN||'').trim();
}

export function ownerApprovalTokenValid(value:string|undefined,env:NodeJS.ProcessEnv=process.env){
  const expected=configuredOwnerApprovalToken(env);
  const operator=configuredOperatorToken(env);
  if(expected.length<MIN_OPERATOR_TOKEN_LENGTH||expected===operator)return false;
  return safeTokenEqual(expected,value);
}
