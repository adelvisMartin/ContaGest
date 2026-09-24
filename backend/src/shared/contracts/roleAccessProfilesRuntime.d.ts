export type RoleAccessBackendProfile = {
  name:string;
  description:string;
  system:boolean;
};

export type RoleAccessProfile = {
  id:string;
  modules:readonly string[];
  capabilities:readonly string[];
  routePermissions:readonly string[];
  permissions:readonly string[];
  backend?:RoleAccessBackendProfile;
};

export function validateRoleAccessProfiles(input:unknown):readonly RoleAccessProfile[];
export const ROLE_ACCESS_PROFILES:readonly RoleAccessProfile[];
export function roleAccessProfile(id:string):RoleAccessProfile|null;
