import crypto from 'node:crypto';

export const MIN_META_SECRET_LENGTH=32;

type RuntimeEnv=NodeJS.ProcessEnv|Record<string,string|undefined>;

function configuredSecret(name:'WHATSAPP_VERIFY_TOKEN'|'WHATSAPP_APP_SECRET',env:RuntimeEnv=process.env){
  return String(env[name]||'').trim();
}

function configuredPhoneNumberId(env:RuntimeEnv=process.env){
  return String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
}

export function metaWebhookSecretsConfigured(env:RuntimeEnv=process.env){
  return configuredSecret('WHATSAPP_VERIFY_TOKEN',env).length>=MIN_META_SECRET_LENGTH
    && configuredSecret('WHATSAPP_APP_SECRET',env).length>=MIN_META_SECRET_LENGTH;
}

export function metaWebhookRuntimeConfigured(env:RuntimeEnv=process.env){
  return metaWebhookSecretsConfigured(env)&&configuredPhoneNumberId(env).length>0;
}

function safeEqual(left:string,right:string){
  const a=Buffer.from(left);
  const b=Buffer.from(right);
  return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);
}

export function metaVerifyTokenValid(value:unknown,env:RuntimeEnv=process.env){
  const expected=configuredSecret('WHATSAPP_VERIFY_TOKEN',env);
  if(expected.length<MIN_META_SECRET_LENGTH)return false;
  return safeEqual(String(value||''),expected);
}

export function metaSignatureValid(raw:Buffer|undefined,signature:string|undefined,env:RuntimeEnv=process.env){
  const secret=configuredSecret('WHATSAPP_APP_SECRET',env);
  if(secret.length<MIN_META_SECRET_LENGTH||!raw||!signature?.startsWith('sha256='))return false;
  const expected=`sha256=${crypto.createHmac('sha256',secret).update(raw).digest('hex')}`;
  return safeEqual(signature,expected);
}

export const __test__={configuredPhoneNumberId,safeEqual};
