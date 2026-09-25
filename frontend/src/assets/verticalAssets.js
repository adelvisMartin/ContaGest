export const VERTICAL_ASSETS=Object.freeze({
  veterinary:'/vertical-assets/veterinary.svg',
  dentistry:'/vertical-assets/dentistry.svg',
  psychology:'/vertical-assets/psychology.svg',
  gym:'/vertical-assets/gym.svg',
  nutrition:'/vertical-assets/nutrition.svg',
  login:'/vertical-assets/login-security.svg'
});

export function verticalAsset(key=''){
  return VERTICAL_ASSETS[String(key||'').trim()]||'';
}
