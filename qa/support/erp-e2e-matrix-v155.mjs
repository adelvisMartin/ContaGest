import { MODULE_VISUAL_CATALOG } from './module-visual-catalog.mjs';

export const ERP_E2E_STATES_V155=Object.freeze([
  'baseline','loading','empty','error','offline','role-denied','boundary'
]);
export const ERP_E2E_ROLES_V155=Object.freeze(['admin','operator','read-only']);
export const ERP_E2E_VIEWPORTS_V155=Object.freeze([
  {name:'mobile-390',width:390,height:844},
  {name:'tablet-768',width:768,height:1024},
  {name:'desktop-1440',width:1440,height:900}
]);
export const ERP_E2E_ROUTES_V155=Object.freeze(MODULE_VISUAL_CATALOG.map(({route,family,priority,label})=>({route,family,priority,label})));

/**
 * Canonical evidence dimension for #155.
 * A case is only complete when route, state, role AND viewport are explicit.
 * Keeping viewport outside the case allowed a route/state/role tuple to appear
 * covered even if it had only been rendered at one geometry.
 */
export function buildErpE2EMatrixV155(){
  return ERP_E2E_ROUTES_V155.flatMap((route)=>
    ERP_E2E_STATES_V155.flatMap((state)=>
      ERP_E2E_ROLES_V155.flatMap((role)=>
        ERP_E2E_VIEWPORTS_V155.map((viewport)=>({
          route:route.route,
          family:route.family,
          priority:route.priority,
          state,
          role,
          viewport:viewport.name,
          width:viewport.width,
          height:viewport.height
        }))
      )
    )
  );
}

export const ERP_E2E_REQUIRED_ASSERTIONS_V155=Object.freeze([
  'route-rendered',
  'no-uncaught-error',
  'no-document-horizontal-overflow',
  'no-hidden-mutation',
  'role-boundary-enforced',
  'critical-action-observable',
  'offline-state-explicit',
  'loading-state-terminates',
  'empty-state-actionable',
  'error-state-recoverable'
]);
