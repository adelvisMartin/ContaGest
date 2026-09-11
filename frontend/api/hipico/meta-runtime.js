import { strongSecretConfigured } from './_shared.js';

export function isMetaPhoneNumberId(value){
  return /^\d{5,30}$/.test(String(value||'').trim());
}

export function metaSenderConfig(source=process.env){
  const accessToken=String(source.HIPICO_META_ACCESS_TOKEN||'').trim();
  const phoneNumberId=String(source.HIPICO_META_PHONE_NUMBER_ID||'').trim();
  const accessTokenStrong=strongSecretConfigured(accessToken);
  const phoneNumberIdValid=isMetaPhoneNumberId(phoneNumberId);
  return{accessToken,phoneNumberId,accessTokenStrong,phoneNumberIdValid,ready:accessTokenStrong&&phoneNumberIdValid};
}

export function metaWebhookConfig(source=process.env){
  const verifyToken=String(source.HIPICO_META_VERIFY_TOKEN||'').trim();
  const appSecret=String(source.HIPICO_META_APP_SECRET||'').trim();
  const phoneNumberId=String(source.HIPICO_META_PHONE_NUMBER_ID||'').trim();
  const verifyTokenStrong=strongSecretConfigured(verifyToken);
  const appSecretStrong=strongSecretConfigured(appSecret);
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
