import crypto from 'node:crypto';
import { hipicoNumericProviderIdConfigured, hipicoRuntimeSecretConfigured, MIN_HIPICO_RUNTIME_SECRET_BYTES } from './hipico-secret-security.js';

export const MIN_WEBHOOK_SECRET_LENGTH=MIN_HIPICO_RUNTIME_SECRET_BYTES;
type RuntimeEnv=Record<string,string|undefined>;

function configured(name:'WHATSAPP_VERIFY_TOKEN'|'WHATSAPP_APP_SECRET',env:RuntimeEnv=process.env){
  return String(env[name]||'').trim();
}

function configuredPhoneNumberId(env:RuntimeEnv=process.env){
  return String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
}

function safeEqual(left:string,right:string){
  const a=Buffer.from(String(left||''));
  const b=Buffer.from(String(right||''));
  return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);
}

export function webhookSecretsReady(env:RuntimeEnv=process.env){
  return hipicoRuntimeSecretConfigured(configured('WHATSAPP_VERIFY_TOKEN',env),MIN_WEBHOOK_SECRET_LENGTH)
    && hipicoRuntimeSecretConfigured(configured('WHATSAPP_APP_SECRET',env),MIN_WEBHOOK_SECRET_LENGTH);
}

export function webhookSecurityReady(env:RuntimeEnv=process.env){
  return webhookSecretsReady(env)&&hipicoNumericProviderIdConfigured(configuredPhoneNumberId(env));
}

export function webhookVerifyTokenValid(value:unknown,env:RuntimeEnv=process.env){
  const expected=configured('WHATSAPP_VERIFY_TOKEN',env);
  if(!hipicoRuntimeSecretConfigured(expected,MIN_WEBHOOK_SECRET_LENGTH))return false;
  return safeEqual(String(value||''),expected);
}

export function webhookSignatureValid(raw:Buffer|undefined,signature:unknown,env:RuntimeEnv=process.env){
  const secret=configured('WHATSAPP_APP_SECRET',env);
  const supplied=String(signature||'');
  if(!hipicoRuntimeSecretConfigured(secret,MIN_WEBHOOK_SECRET_LENGTH)||!raw||!supplied.startsWith('sha256='))return false;
  const expected=`sha256=${crypto.createHmac('sha256',secret).update(raw).digest('hex')}`;
  return safeEqual(supplied,expected);
}

export const __test__={configured,configuredPhoneNumberId,safeEqual};
