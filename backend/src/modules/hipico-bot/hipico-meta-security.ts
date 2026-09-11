import crypto from 'node:crypto';
import { hipicoNumericProviderIdConfigured, hipicoRuntimeSecretConfigured, MIN_HIPICO_RUNTIME_SECRET_BYTES } from './hipico-secret-security.js';

export const MIN_META_SECRET_LENGTH=MIN_HIPICO_RUNTIME_SECRET_BYTES;

type RuntimeEnv=NodeJS.ProcessEnv|Record<string,string|undefined>;

function configuredSecret(name:'WHATSAPP_VERIFY_TOKEN'|'WHATSAPP_APP_SECRET',env:RuntimeEnv=process.env){
  return String(env[name]||'').trim();
}

function configuredPhoneNumberId(env:RuntimeEnv=process.env){
  return String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
}

export function metaWebhookSecretsConfigured(env:RuntimeEnv=process.env){
  return hipicoRuntimeSecretConfigured(configuredSecret('WHATSAPP_VERIFY_TOKEN',env),MIN_META_SECRET_LENGTH)
    && hipicoRuntimeSecretConfigured(configuredSecret('WHATSAPP_APP_SECRET',env),MIN_META_SECRET_LENGTH);
}

export function metaWebhookRuntimeConfigured(env:RuntimeEnv=process.env){
  return metaWebhookSecretsConfigured(env)&&hipicoNumericProviderIdConfigured(configuredPhoneNumberId(env));
}

function safeEqual(left:string,right:string){
  const a=Buffer.from(left);
  const b=Buffer.from(right);
  return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);
}

export function metaVerifyTokenValid(value:unknown,env:RuntimeEnv=process.env){
  const expected=configuredSecret('WHATSAPP_VERIFY_TOKEN',env);
  if(!hipicoRuntimeSecretConfigured(expected,MIN_META_SECRET_LENGTH))return false;
  return safeEqual(String(value||''),expected);
}

export function metaSignatureValid(raw:Buffer|undefined,signature:string|undefined,env:RuntimeEnv=process.env){
  const secret=configuredSecret('WHATSAPP_APP_SECRET',env);
  if(!hipicoRuntimeSecretConfigured(secret,MIN_META_SECRET_LENGTH)||!raw||!signature?.startsWith('sha256='))return false;
  const expected=`sha256=${crypto.createHmac('sha256',secret).update(raw).digest('hex')}`;
  return safeEqual(signature,expected);
}

export const __test__={configuredPhoneNumberId,safeEqual};
