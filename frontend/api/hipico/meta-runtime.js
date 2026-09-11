import { strongSecretConfigured } from './_shared.js';

const PUBLIC_PLACEHOLDER_PATTERN=/(?:REEMPLAZA|REPLACE|CHANGE[_-]?ME|CHANGEME|PLACEHOLDER|YOUR[_-]?(?:SECRET|TOKEN|KEY)|TU[_-]?(?:SECRETO|TOKEN|CLAVE)|EXAMPLE[_-]?(?:SECRET|TOKEN|KEY))/i;

export function strongMetaSecretConfigured(value){
  const secret=String(value||'').trim();
  return strongSecretConfigured(secret)&&!PUBLIC_PLACEHOLDER_PATTERN.test(secret);
}

export function isMetaPhoneNumberId(value){
  return /^\d{5,30}$/.test(String(value||'').trim());
}

export function metaSenderConfig(source=process.env){
  const accessToken=String(source.HIPICO_META_ACCESS_TOKEN||'').trim();
  const phoneNumberId=String(source.HIPICO_META_PHONE_NUMBER_ID||'').trim();
  const accessTokenStrong=strongMetaSecretConfigured(accessToken);
  const phoneNumberIdValid=isMetaPhoneNumberId(phoneNumberId);
  return{accessToken,phoneNumberId,accessTokenStrong,phoneNumberIdValid,ready:accessTokenStrong&&phoneNumberIdValid};
}

export function metaWebhookConfig(source=process.env){
  const verifyToken=String(source.HIPICO_META_VERIFY_TOKEN||'').trim();
  const appSecret=String(source.HIPICO_META_APP_SECRET||'').trim();
  const phoneNumberId=String(source.HIPICO_META_PHONE_NUMBER_ID||'').trim();
  const verifyTokenStrong=strongMetaSecretConfigured(verifyToken);
  const appSecretStrong=strongMetaSecretConfigured(appSecret);
  const phoneNumberIdValid=isMetaPhoneNumberId(phoneNumberId);
  return{
    verifyToken,
    appSecret,
    phoneNumberId,
    verifyTokenStrong,
    appSecretStrong,
    phoneNumberIdValid,
    ready:verifyTokenStrong&&appSecretStrong&&phoneNumberIdValid
  };
}

export const __test__={PUBLIC_PLACEHOLDER_PATTERN};
