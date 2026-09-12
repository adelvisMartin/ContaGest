import { PUBLIC_SECRET_PLACEHOLDER_PATTERN, runtimeValue, strongSecretConfigured } from './_shared.js';

export const PUBLIC_PLACEHOLDER_PATTERN=PUBLIC_SECRET_PLACEHOLDER_PATTERN;
export const DEFAULT_META_GRAPH_VERSION='v23.0';
const META_GRAPH_VERSION=/^v\d{1,3}\.\d{1,3}$/;

export function strongMetaSecretConfigured(value){
  return strongSecretConfigured(value);
}

export function isMetaPhoneNumberId(value){
  return /^\d{5,30}$/.test(String(value||'').trim());
}

export function metaGraphVersionConfig(source=process.env){
  const configured=runtimeValue(source,'WHATSAPP_GRAPH_API_VERSION','WHATSAPP_GRAPH_VERSION','HIPICO_META_GRAPH_VERSION');
  if(!configured){
    return{graphVersion:DEFAULT_META_GRAPH_VERSION,graphVersionValid:true,graphVersionDefaulted:true};
  }
  return{
    graphVersion:configured,
    graphVersionValid:META_GRAPH_VERSION.test(configured),
    graphVersionDefaulted:false
  };
}

export function metaSenderConfig(source=process.env){
  const accessToken=runtimeValue(source,'WHATSAPP_CLOUD_TOKEN','HIPICO_META_ACCESS_TOKEN');
  const phoneNumberId=runtimeValue(source,'WHATSAPP_PHONE_NUMBER_ID','HIPICO_META_PHONE_NUMBER_ID');
  const accessTokenStrong=strongMetaSecretConfigured(accessToken);
  const phoneNumberIdValid=isMetaPhoneNumberId(phoneNumberId);
  const graph=metaGraphVersionConfig(source);
  return{
    accessToken,
    phoneNumberId,
    accessTokenStrong,
    phoneNumberIdValid,
    ...graph,
    ready:accessTokenStrong&&phoneNumberIdValid&&graph.graphVersionValid
  };
}

export function metaWebhookConfig(source=process.env){
  const verifyToken=runtimeValue(source,'WHATSAPP_VERIFY_TOKEN','HIPICO_META_VERIFY_TOKEN');
  const appSecret=runtimeValue(source,'WHATSAPP_APP_SECRET','HIPICO_META_APP_SECRET');
  const phoneNumberId=runtimeValue(source,'WHATSAPP_PHONE_NUMBER_ID','HIPICO_META_PHONE_NUMBER_ID');
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
