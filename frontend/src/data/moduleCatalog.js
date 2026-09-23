import accessManifest from 'contagest-ve-backend/access-manifest.json' with { type:'json' };

export const MODULE_TIERS = {
  core: { label:'Operativo', tone:'success', description:'Funciones esenciales para la operación diaria.' },
  advanced: { label:'Especializado', tone:'brand', description:'Herramientas especializadas según el área.' },
  demo: { label:'Opcional', tone:'warning', description:'Extensiones disponibles según el plan y la configuración.' }
};

const manifestModules=Array.isArray(accessManifest?.modules)?accessManifest.modules:[];

export const MODULE_AREAS = Object.freeze([...(accessManifest?.areas||[])]);
export const MODULE_CATALOG = Object.freeze(manifestModules.map(({route,name,area,tier,modes})=>Object.freeze({
  route:String(route),
  name:String(name),
  area:String(area),
  tier:String(tier),
  modes:Object.freeze([...(Array.isArray(modes)?modes:[])].map(String))
})));

export const BUSINESS_MODES = Object.freeze(Object.fromEntries(
  Object.entries(accessManifest?.businessModes||{}).map(([key,value])=>[key,Object.freeze({...value})])
));

export const LANDING_BY_MODE = Object.freeze({...accessManifest?.landingByMode});

export function modulesForMode(mode='admin') {
  if (mode==='admin') return MODULE_CATALOG;
  return MODULE_CATALOG.filter((module)=>module.modes.includes(mode));
}

export function modulesByArea(mode='admin',{includeAll=false}={}) {
  const source=includeAll?MODULE_CATALOG:modulesForMode(mode);
  return MODULE_AREAS.reduce((result,area)=>{
    const items=source.filter((module)=>module.area===area);
    if(items.length)result[area]=items;
    return result;
  },{});
}

export function landingForMode(mode='admin'){
  return LANDING_BY_MODE[mode]||LANDING_BY_MODE.admin||'dashboard';
}
