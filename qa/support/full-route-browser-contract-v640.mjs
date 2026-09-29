import { UX_CONTRACT_V1 } from '../../frontend/src/design-system/uxContract.v1.js';
import { MODULE_VISUAL_CATALOG } from './module-visual-catalog.mjs';

const VIEWPORTS=Object.freeze([
  {name:'phone-360',width:360,height:800,class:'phone'},
  {name:'phone-390',width:390,height:844,class:'phone'},
  {name:'phone-430',width:430,height:932,class:'phone'},
  {name:'tablet-768',width:768,height:1024,class:'tablet'},
  {name:'laptop-1024',width:1024,height:768,class:'desktop'},
  {name:'desktop-1366',width:1366,height:768,class:'desktop'},
  {name:'desktop-1440',width:1440,height:900,class:'desktop'},
  {name:'wide-1920',width:1920,height:1080,class:'wide'},
]);

export const FULL_ROUTE_BROWSER_CONTRACT=Object.freeze({
  schemaVersion:640,
  uxContractVersion:UX_CONTRACT_V1.version,
  uxContractAuthority:UX_CONTRACT_V1.authority,
  sourceCatalog:'qa/support/module-visual-catalog.mjs',
  routes:Object.freeze(MODULE_VISUAL_CATALOG.map((item)=>item.route)),
  routeClasses:Object.freeze(Object.fromEntries(MODULE_VISUAL_CATALOG.map((item)=>[
    item.route,Object.freeze({family:item.family,priority:item.priority,standalone:Boolean(item.standalone),framework:item.framework||'legacy'})
  ]))),
  viewports:VIEWPORTS,
  themes:UX_CONTRACT_V1.theme.preferences,
  motion:UX_CONTRACT_V1.accessibility.motionModes,
  zoom:UX_CONTRACT_V1.accessibility.zoomLevels,
  states:UX_CONTRACT_V1.states.catalog,
  invariants:Object.freeze({
    keyboard:UX_CONTRACT_V1.accessibility.keyboardOnly,
    visibleFocus:UX_CONTRACT_V1.accessibility.visibleFocus,
    deepLink:true,
    refresh:true,
    noHorizontalOverflow:true,
    noOverlap:true,
    noClipping:true,
    noOcclusion:true,
    consoleErrors:false,
    pageErrors:false,
    longTextUnicode:true,
    deterministicFixtures:true,
    artifactsOnFailure:true,
    noSleeps:true,
    noForce:true,
    noSkippedGreen:true,
  }),
  browserPolicy:Object.freeze({
    gate:'chromium',
    advisory:Object.freeze(['firefox','webkit']),
  }),
});

if(FULL_ROUTE_BROWSER_CONTRACT.routes.length!==58){
  throw new Error(`FULL_ROUTE_BROWSER_CATALOG_DRIFT:${FULL_ROUTE_BROWSER_CONTRACT.routes.length}`);
}
