export type AccessManifestModule = {
  route:string;
  name:string;
  area:string;
  tier:'core'|'advanced'|'demo';
  modes:readonly string[];
  permission:string;
  accessGroup:string;
  licenseModule:string;
  adminOnly?:boolean;
  coreAccess?:boolean;
};

export type AccessManifest = {
  schemaVersion:1;
  areas:readonly string[];
  businessModes:Readonly<Record<string,Readonly<{label:string;description:string}>>>;
  landingByMode:Readonly<Record<string,string>>;
  modules:readonly AccessManifestModule[];
};

export function validateAccessManifest(input:unknown):AccessManifest;
export const ACCESS_MANIFEST:AccessManifest;
export const ROUTE_PERMISSION_MAP:Readonly<Record<string,string>>;
export const PERMISSION_MODULES:Readonly<Record<string,string[]>>;
export function permissionForRoute(route:string):string|null;
export function landingForMode(mode:string):string;
