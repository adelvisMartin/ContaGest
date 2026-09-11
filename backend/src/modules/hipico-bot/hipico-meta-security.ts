import { hipicoNumericProviderIdConfigured } from './hipico-secret-security.js';
import { MIN_WEBHOOK_SECRET_LENGTH, webhookSecretsReady, webhookSecurityReady, webhookSignatureValid, webhookVerifyTokenValid, __test__ as webhookSecurityTest } from './hipico-webhook-security.js';

export const MIN_META_SECRET_LENGTH=MIN_WEBHOOK_SECRET_LENGTH;
type RuntimeEnv=NodeJS.ProcessEnv|Record<string,string|undefined>;

function configuredPhoneNumberId(env:RuntimeEnv=process.env){
  return String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
}

export function metaWebhookSecretsConfigured(env:RuntimeEnv=process.env){
  return webhookSecretsReady(env as Record<string,string|undefined>);
}

export function metaWebhookRuntimeConfigured(env:RuntimeEnv=process.env){
  return webhookSecurityReady(env as Record<string,string|undefined>);
}

export function metaVerifyTokenValid(value:unknown,env:RuntimeEnv=process.env){
  return webhookVerifyTokenValid(value,env as Record<string,string|undefined>);
}

export function metaSignatureValid(raw:Buffer|undefined,signature:string|undefined,env:RuntimeEnv=process.env){
  return webhookSignatureValid(raw,signature,env as Record<string,string|undefined>);
}

export const __test__={
  configuredPhoneNumberId,
  safeEqual:webhookSecurityTest.safeEqual,
  phoneNumberIdConfigured:(env:RuntimeEnv=process.env)=>hipicoNumericProviderIdConfigured(configuredPhoneNumberId(env))
};
