import manifestJson from './access-manifest.json' with { type:'json' };

export type AccessManifestModule = {
  route:string;
  name:string;
  area:string;
  tier:'core'|'advanced'|'demo';
  modes:string[];
  permission:string;
  accessGroup:string;
  licenseModule:string;
  adminOnly?:boolean;
  coreAccess?:boolean;
};

type AccessManifest = {
  schemaVersion:number;
  areas:string[];
  businessModes:Record<string,{label:string;description:string}>;
  landingByMode:Record<string,string>;
  modules:AccessManifestModule[];
};

export const ACCESS_MANIFEST = manifestJson as AccessManifest;

export const ROUTE_PERMISSION_MAP: Record<string,string> = Object.fromEntries(
  ACCESS_MANIFEST.modules.map((item)=>[item.route,item.permission])
);

export const PERMISSION_MODULES: Record<string,string[]> = ACCESS_MANIFEST.modules.reduce<Record<string,string[]>>((result,item)=>{
  if(!result[item.permission])result[item.permission]=[];
  if(!result[item.permission].includes(item.licenseModule))result[item.permission].push(item.licenseModule);
  return result;
},{});

export function permissionForRoute(route:string){
  return ROUTE_PERMISSION_MAP[String(route||'')] || null;
}

export function landingForMode(mode:string){
  return ACCESS_MANIFEST.landingByMode[String(mode||'')] || ACCESS_MANIFEST.landingByMode.admin || 'dashboard';
}
