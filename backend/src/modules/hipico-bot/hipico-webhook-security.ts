import crypto from 'node:crypto';

export const MIN_WEBHOOK_SECRET_LENGTH=32;
type RuntimeEnv=Record<string,string|undefined>;

function configured(name:string,env:RuntimeEnv=process.env){
  return String(env[name]||'').trim();
}

function strong(value:string){
  return Buffer.byteLength(value,'utf8')>=MIN_WEBHOOK_SECRET_LENGTH;
}

function safeEqual(left:string,right:string){
  const a=Buffer.from(String(left||''));
  const b=Buffer.from(String(right||''));
  return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);
}

export function webhookSecurityReady(env:RuntimeEnv=process.env){
  const verifyToken=configured('WHATSAPP_VERIFY_TOKEN',env);
  const appSecret=configured('WHATSAPP_APP_SECRET',env);
  return strong(verifyToken)&&strong(appSecret);
}

export function webhookVerifyTokenValid(value:unknown,env:RuntimeEnv=process.env){
  const expected=configured('WHATSAPP_VERIFY_TOKEN',env);
  if(!strong(expected))return false;
  return safeEqual(String(value||''),expected);
}

export function webhookSignatureValid(raw:Buffer|undefined,signature:unknown,env:RuntimeEnv=process.env){
  const secret=configured('WHATSAPP_APP_SECRET',env);
  const supplied=String(signature||'');
  if(!strong(secret)||!raw||!supplied.startsWith('sha256='))return false;
  const expected=`sha256=${crypto.createHmac('sha256',secret).update(raw).digest('hex')}`;
  return safeEqual(supplied,expected);
}

export const __test__={configured,strong,safeEqual};
