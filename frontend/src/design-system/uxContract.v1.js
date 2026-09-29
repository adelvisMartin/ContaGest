export const SYSTEM_THEME_QUERY='(prefers-color-scheme: dark)';

const THEME_PREFERENCES=Object.freeze(['light','dark','system']);
const UI_STATES=Object.freeze([
  'idle','loading','empty','no-results','success','warning','error','disabled','readOnly',
  'permission-denied','offline-stale','saving-submitting','retry-recovery'
]);
const FAILURE_CODES=Object.freeze([
  'THEME_AUTHORITY_DUPLICATE','MISSING_UI_STATE','FOCUS_NOT_VISIBLE','FOCUS_TRAP_BROKEN',
  'KEYBOARD_PATH_BLOCKED','ACCESSIBLE_NAME_MISSING','CONTRAST_BELOW_CONTRACT','ZOOM_REFLOW_FAILURE',
  'REDUCED_MOTION_IGNORED','ERROR_NOT_ASSOCIATED','TOUCH_TARGET_BELOW_CONTRACT','STATE_ONLY_BY_COLOR'
]);

const APPLICABILITY=Object.freeze({
  'async-surface':Object.freeze(['idle','loading','empty','no-results','success','warning','error','permission-denied','offline-stale','retry-recovery']),
  form:Object.freeze(['idle','success','warning','error','disabled','readOnly','permission-denied','offline-stale','saving-submitting','retry-recovery']),
  overlay:Object.freeze(['idle','disabled','saving-submitting','error']),
  data:Object.freeze(['idle','loading','empty','no-results','error','permission-denied','offline-stale','retry-recovery']),
  action:Object.freeze(['idle','disabled','saving-submitting','success','warning','error'])
});

export const UX_CONTRACT_V1=Object.freeze({
  version:1,
  authority:'frontend/src/design-system/uxContract.v1.js',
  theme:Object.freeze({
    preferences:THEME_PREFERENCES,
    defaultPreference:'light',
    systemQuery:SYSTEM_THEME_QUERY,
    semanticTokenAuthority:'frontend/src/design-system/semanticTokens.v1.js',
    persistenceScope:'tenant-user'
  }),
  states:Object.freeze({catalog:UI_STATES,applicability:APPLICABILITY}),
  notApplicable:Object.freeze({requiresReason:true,status:'NOT_APPLICABLE'}),
  accessibility:Object.freeze({
    standard:'WCAG 2.2 AA',
    keyboardOnly:true,
    visibleFocus:true,
    overlayFocusTrap:true,
    overlayFocusRestore:true,
    escapeClose:true,
    zoomPercent:200,
    reducedMotion:true,
    colorAloneForbidden:true,
    errorAssociationRequired:true,
    iconOnlyAccessibleNameRequired:true,
    minimumTouchTargetPx:44
  }),
  failureCodes:FAILURE_CODES
});

export function normalizeThemePreference(value='light'){
  const normalized=String(value||'light').trim().toLowerCase();
  return THEME_PREFERENCES.includes(normalized)?normalized:UX_CONTRACT_V1.theme.defaultPreference;
}

export function resolveThemeMode(preference='light',systemDark=false){
  const normalized=normalizeThemePreference(preference);
  return normalized==='system'?(systemDark?'dark':'light'):normalized;
}

export function requiredUiStates(kind){
  return [...(APPLICABILITY[String(kind||'')]||[])];
}
