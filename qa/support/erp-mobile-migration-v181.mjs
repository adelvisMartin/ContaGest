import { MODULE_VISUAL_CATALOG } from './module-visual-catalog.mjs';

const FIRST_WAVE=new Set(['gimnasio','rutinas','nutricion','inventario']);
export const ERP_MOBILE_MIGRATION_V181=Object.freeze(MODULE_VISUAL_CATALOG.map((item)=>({
  route:item.route,
  family:item.family,
  priority:item.priority,
  mobileOwner:'cg.visual.responsive/shared-runtime-adapter',
  foundation:'#180',
  wave:FIRST_WAVE.has(item.route)?'device-capture-hotfix':'shared-normalization',
  requiredViewports:[360,390,430],
  behaviorContract:'unchanged'
})));
