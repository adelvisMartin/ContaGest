import profilesJson from './role-access-profiles.json' with { type:'json' };
import { ACCESS_MANIFEST, ROUTE_PERMISSION_MAP } from './accessManifestRuntime.js';

const canonicalRoutes=new Set(ACCESS_MANIFEST.modules.map((item)=>item.route));
const canonicalRoutePermissions=new Set(ACCESS_MANIFEST.modules.map((item)=>item.permission));
const fail=(message)=>{throw new Error(`[role-access-profiles] ${message}`);};
const nonEmpty=(value,label)=>{
  if(typeof value!=='string'||!value.trim())fail(`${label} must be a non-empty string`);
  return value.trim();
};
const stringList=(value,label,{allowEmpty=false}={})=>{
  if(!Array.isArray(value)||(!allowEmpty&&!value.length))fail(`${label} must be ${allowEmpty?'an':'a non-empty'} array`);
  const result=value.map((item,index)=>nonEmpty(item,`${label}[${index}]`));
  if(new Set(result).size!==result.length)fail(`${label} contains duplicates`);
  return result;
};

export function validateRoleAccessProfiles(input){
  if(!input||typeof input!=='object'||Array.isArray(input))fail('contract must be an object');
  if(input.schemaVersion!==1)fail('schemaVersion must be 1');
  if(!Array.isArray(input.profiles)||!input.profiles.length)fail('profiles must be a non-empty array');

  const seen=new Set();
  const resolved=input.profiles.map((raw,index)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))fail(`profiles[${index}] must be an object`);
    const id=nonEmpty(raw.id,`profiles[${index}].id`);
    if(seen.has(id))fail(`duplicate profile id: ${id}`);
    seen.add(id);

    const modules=raw.modules==='*'
      ? ACCESS_MANIFEST.modules.map((item)=>item.route)
      : stringList(raw.modules,`${id}.modules`);
    for(const route of modules){
      if(!canonicalRoutes.has(route))fail(`${id}: unknown route ${route}`);
    }

    const capabilities=stringList(raw.capabilities??[],`${id}.capabilities`,{allowEmpty:true});
    for(const capability of capabilities){
      if(canonicalRoutePermissions.has(capability))fail(`${id}: capability duplicates canonical route permission ${capability}`);
    }

    let backend=null;
    if(raw.backend!==undefined){
      if(!raw.backend||typeof raw.backend!=='object'||Array.isArray(raw.backend))fail(`${id}.backend must be an object`);
      if(typeof raw.backend.system!=='boolean')fail(`${id}.backend.system must be boolean`);
      backend=Object.freeze({
        name:nonEmpty(raw.backend.name,`${id}.backend.name`),
        description:nonEmpty(raw.backend.description,`${id}.backend.description`),
        system:raw.backend.system
      });
    }

    const routePermissions=[...new Set(modules.map((route)=>ROUTE_PERMISSION_MAP[route]).filter(Boolean))];
    return Object.freeze({
      id,
      modules:Object.freeze([...modules]),
      capabilities:Object.freeze([...capabilities]),
      routePermissions:Object.freeze(routePermissions),
      permissions:Object.freeze([...new Set([...capabilities,...routePermissions])]),
      ...(backend?{backend}:{})
    });
  });

  const backendNames=new Set();
  for(const profile of resolved){
    if(!profile.backend)continue;
    if(backendNames.has(profile.backend.name))fail(`duplicate backend role name: ${profile.backend.name}`);
    backendNames.add(profile.backend.name);
  }
  return Object.freeze(resolved);
}

export const ROLE_ACCESS_PROFILES=validateRoleAccessProfiles(profilesJson);
const ROLE_PROFILE_BY_ID=new Map(ROLE_ACCESS_PROFILES.map((profile)=>[profile.id,profile]));

export function roleAccessProfile(id){
  return ROLE_PROFILE_BY_ID.get(String(id||''))||null;
}
