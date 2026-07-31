import { AuthSession } from './authSession.js';
import { BackendApi } from './backendApi.js';
import { LicenseService } from './licenseService.js';

const DEMO_USER={id:'demo-admin',name:'Administrador Local',fullName:'Administrador Local',email:'admin@erp.local',role:'sysadmin',permissions:['*']};
const demoModeEnabled=()=>import.meta?.env?.DEV===true&&import.meta?.env?.VITE_ENABLE_DEMO_MODE==='true';

function normalizeSession(payload){
  const tenantId=payload?.tenantId||payload?.tenant?.id;
  if(!payload?.token||!tenantId)throw new Error('El backend no devolvió una sesión firmada completa.');
  return AuthSession.set({token:payload.token,tenantId,tenant:payload.tenant||null,user:payload.user||null,license:payload.license||null,expiresAt:payload.expiresAt||Date.now()+1000*60*60*8,mode:'api'});
}

export const AuthService={
  getSession(){return AuthSession.get();},
  isAuthenticated(){return AuthSession.isAuthenticated();},
  isDemoEnabled(){return demoModeEnabled();},
  captcha(){return BackendApi.request('/auth/captcha',{noAuth:true});},

  async login({email,password,tenantRif='00000000',captchaToken='',captchaAnswer='',licenseKey='',deviceId='',deviceLabel='',mode='api'}){
    if(mode==='demo'){
      if(!demoModeEnabled())throw new Error('El modo demo local está deshabilitado en esta compilación.');
      if(!email||!password)throw new Error('Ingresa email y contraseña.');
      return AuthSession.set({token:`demo.${Date.now()}`,user:{...DEMO_USER,email},tenantId:'demo-tenant',tenant:{id:'demo-tenant',name:'Demo local',rif:'00000000',plan:'development'},expiresAt:Date.now()+1000*60*60*8,mode:'demo'});
    }
    const payload=await BackendApi.request('/auth/login',{method:'POST',noAuth:true,body:{email,password,tenantRif,captchaToken,captchaAnswer,...(licenseKey?{licenseKey,deviceId:deviceId||LicenseService.deviceId(),deviceLabel:deviceLabel||LicenseService.deviceLabel()}:{})}});
    if(payload?.mfaRequired)return payload;
    return normalizeSession(payload);
  },

  async completeCoordinateLogin(challengeId,answers){
    const payload=await BackendApi.request('/auth/login/coordinates',{method:'POST',noAuth:true,body:{challengeId,answers}});
    return normalizeSession(payload);
  },

  async coordinateStatus(){return BackendApi.get('/auth/coordinates/status');},
  async enrollCoordinateCard(){return BackendApi.post('/api/v1/auth/coordinates/enroll',{});},
  async revokeCoordinateCard(){return BackendApi.post('/api/v1/auth/coordinates/revoke',{});},

  async register({tenantRif,tenantName,legalName,fullName,email,password,captchaToken='',captchaAnswer=''}){
    return normalizeSession(await BackendApi.request('/auth/register',{method:'POST',noAuth:true,body:{tenantRif,tenantName,legalName,fullName,email,password,captchaToken,captchaAnswer}}));
  },
  me(){return BackendApi.request('/auth/me');},
  async refresh(){return normalizeSession(await BackendApi.request('/auth/refresh',{method:'POST'}));},
  logout(){AuthSession.clear();},
  authHeaders(){return AuthSession.authHeaders();}
};
