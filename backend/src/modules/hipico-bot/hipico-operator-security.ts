import crypto from 'node:crypto';
import { hipicoRuntimeSecretConfigured, MIN_HIPICO_RUNTIME_SECRET_BYTES } from './hipico-secret-security.js';

export const MIN_OPERATOR_TOKEN_LENGTH = MIN_HIPICO_RUNTIME_SECRET_BYTES;

export function configuredOperatorToken(env: NodeJS.ProcessEnv = process.env) {
  const primary = String(env.HIPICO_OPERATOR_CONTROL_TOKEN || '').trim();
  if (primary) return primary;
  return String(env.HIPICO_BOT_OPERATOR_TOKEN || '').trim();
}

export function operatorTokenConfigured(env: NodeJS.ProcessEnv = process.env) {
  return hipicoRuntimeSecretConfigured(configuredOperatorToken(env), MIN_OPERATOR_TOKEN_LENGTH);
}

export function operatorTokenValid(value: string | undefined, env: NodeJS.ProcessEnv = process.env) {
  const expected = configuredOperatorToken(env);
  if (!hipicoRuntimeSecretConfigured(expected, MIN_OPERATOR_TOKEN_LENGTH) || !value) return false;
  const provided = String(value);
  if (Buffer.byteLength(expected) !== Buffer.byteLength(provided)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
