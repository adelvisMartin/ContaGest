import {
  Button as LegacyButton,
  Badge as LegacyBadge,
  PageHeader as LegacyPageHeader,
  Section as LegacySection,
  Field as LegacyField,
  Textarea as LegacyTextarea,
  EmptyState as LegacyEmptyState,
  money as legacyMoney,
} from '../ui/kit.js';

export const LEGACY_BRIDGE_STATUS='DEPRECATED';
export const LEGACY_BRIDGE_OWNER='frontend/src/components/vnext/index.js';

export const legacyComponentBridge=Object.freeze({
  Button:LegacyButton,
  Badge:LegacyBadge,
  PageHeader:LegacyPageHeader,
  Section:LegacySection,
  Field:LegacyField,
  Textarea:LegacyTextarea,
  EmptyState:LegacyEmptyState,
  money:legacyMoney,
});

export function legacyOwnerFor(componentName=''){
  return ({Button:'CgButton',Badge:'CgBadge',PageHeader:'CgPageHeader',Section:'CgSection',Field:'CgTextField',Textarea:'CgTextarea',EmptyState:'CgEmptyState',money:'CgMoney'})[componentName]||null;
}
