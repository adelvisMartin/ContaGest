import manifestJson from './access-manifest.json' with { type:'json' };

const VALID_TIERS=new Set(['core','advanced','demo']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const fail=(message)=>{throw new Error(`[access-manifest] ${message}`);};
const object=(value,label)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))fail(`${label} must be an object`);
  return value;
};
const string=(value,label)=>{
  if(typeof value!=='string'||!value.trim())fail(`${label} must be a non-empty string`);
  return value.trim();
};
const stringList=(value,label)=>{
  if(!Array.isArray(value)||!value.length)fail(`${label} must be a non-empty array`);
  const result=value.map((item,index)=>string(item,`${label}[${index}]`));
  if(new Set(result).size!==result.length)fail(`${label} contains duplicates`);
  return result;
};

export function validateAccessManifest(input){
  const source=object(input,'manifest');
  if(source.schemaVersion!==1)fail('schemaVersion must be 1');

  const areas=stringList(source.areas,'areas');
  const areaSet=new Set(areas);
  const rawModes=object(source.businessModes,'businessModes');
  const businessModes={};
  for(const [mode,value] of Object.entries(rawModes)){
    const item=object(value,`businessModes.${mode}`);
    businessModes[string(mode,'business mode key')]=Object.freeze({
      label:string(item.label,`businessModes.${mode}.label`),
      description:string(item.description,`businessModes.${mode}.description`)
    });
  }
  const modeKeys=Object.keys(businessModes);
  if(!modeKeys.length)fail('businessModes must not be empty');
  const modeSet=new Set(modeKeys);

  if(!Array.isArray(source.modules)||!source.modules.length)fail('modules must be a non-empty array');
  const routeSet=new Set();
  const modules=source.modules.map((raw,index)=>{
    const item=object(raw,`modules[${index}]`);
    const route=string(item.route,`modules[${index}].route`);
    if(routeSet.has(route))fail(`duplicate route: ${route}`);
    routeSet.add(route);
    const area=string(item.area,`${route}.area`);
    if(!areaSet.has(area))fail(`unknown area for ${route}: ${area}`);
    const tier=string(item.tier,`${route}.tier`);
    if(!VALID_TIERS.has(tier))fail(`invalid tier for ${route}: ${tier}`);
    const modes=stringList(item.modes,`${route}.modes`);
    for(const mode of modes)if(!modeSet.has(mode))fail(`unknown mode for ${route}: ${mode}`);
    for(const key of ['adminOnly','coreAccess']){
      if(own(item,key)&&typeof item[key]!=='boolean')fail(`${route}.${key} must be boolean`);
    }
    return Object.freeze({
      route,
      name:string(item.name,`${route}.name`),
      area,
      tier,
      modes:Object.freeze(modes),
      permission:string(item.permission,`${route}.permission`),
      accessGroup:string(item.accessGroup,`${route}.accessGroup`),
      licenseModule:string(item.licenseModule,`${route}.licenseModule`),
      ...(own(item,'adminOnly')?{adminOnly:item.adminOnly}:{}),
      ...(own(item,'coreAccess')?{coreAccess:item.coreAccess}:{})
    });
  });

  const rawLandings=object(source.landingByMode,'landingByMode');
  const landingByMode={};
  for(const mode of modeKeys){
    if(!own(rawLandings,mode))fail(`landing missing for mode ${mode}`);
    const route=string(rawLandings[mode],`landingByMode.${mode}`);
    const module=modules.find((item)=>item.route===route);
    if(!module)fail(`landing for ${mode} references unknown route ${route}`);
    if(!module.modes.includes(mode))fail(`landing for ${mode} is not enabled for mode: ${route}`);
    landingByMode[mode]=route;
  }
  for(const mode of Object.keys(rawLandings)){
    if(!modeSet.has(mode))fail(`landing declared for unknown mode ${mode}`);
  }

  return Object.freeze({
    schemaVersion:1,
    areas:Object.freeze(areas),
    businessModes:Object.freeze(businessModes),
    landingByMode:Object.freeze(landingByMode),
    modules:Object.freeze(modules)
  });
}

export const ACCESS_MANIFEST=validateAccessManifest(manifestJson);

export const ROUTE_PERMISSION_MAP=Object.freeze(Object.fromEntries(
  ACCESS_MANIFEST.modules.map((item)=>[item.route,item.permission])
));

const permissionModules=ACCESS_MANIFEST.modules.reduce((result,item)=>{
  if(!result[item.permission])result[item.permission]=[];
  if(!result[item.permission].includes(item.licenseModule))result[item.permission].push(item.licenseModule);
  return result;
},{});
export const PERMISSION_MODULES=Object.freeze(Object.fromEntries(
  Object.entries(permissionModules).map(([permission,modules])=>[permission,Object.freeze([...modules])])
));

export function permissionForRoute(route){
  return ROUTE_PERMISSION_MAP[String(route||'')]||null;
}

export function landingForMode(mode){
  return ACCESS_MANIFEST.landingByMode[String(mode||'')]||ACCESS_MANIFEST.landingByMode.admin||'dashboard';
}
