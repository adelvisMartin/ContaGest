import { createTheme } from '@mui/material/styles';
import { getContaGestThemeTokens } from '../design-system/semanticTokens.v1.js';

const pxNumber = (value) => Number.parseFloat(String(value || '0')) || 0;

export function createContaGestMuiTheme(mode = 'light') {
  const tokens = getContaGestThemeTokens(mode);
  const { color, typography, radius, controls, elevation, zIndex, layout } = tokens;
  const mobileQuery = `@media (max-width:${layout.breakpoints.mobile}px)`;
  const onBrand = color.textInverse;

  return createTheme({
    palette: {
      mode: tokens.mode,
      primary: { main: color.brand, contrastText: onBrand },
      secondary: { main: color.textSecondary },
      success: { main: color.success },
      warning: { main: color.warning },
      error: { main: color.danger },
      info: { main: color.info },
      background: { default: color.background, paper: color.surface },
      text: { primary: color.textPrimary, secondary: color.textSecondary },
      divider: color.divider,
      action: {
        hover: color.interactiveHover,
        selected: color.interactiveSelected,
        disabledBackground: color.interactiveDisabled
      }
    },
    typography: {
      fontFamily: typography.family.sans,
      fontSize: pxNumber(typography.roles.dense),
      h4: { fontWeight: typography.weight.bold, fontSize: typography.roles.page, lineHeight: typography.lineHeight.tight, letterSpacing: '-.032em' },
      h5: { fontWeight: typography.weight.bold, fontSize: typography.roles.section, lineHeight: 1.22, letterSpacing: '-.02em' },
      h6: { fontWeight: typography.weight.strong, fontSize: typography.roles.headingSmall, lineHeight: 1.25 },
      subtitle1: { fontWeight: typography.weight.semibold, fontSize: typography.roles.body },
      subtitle2: { fontWeight: typography.weight.semibold, fontSize: typography.roles.dense },
      body1: { fontSize: typography.roles.body, lineHeight: typography.lineHeight.body },
      body2: { fontSize: typography.roles.dense, lineHeight: 1.45 },
      caption: { fontSize: typography.roles.metadata, lineHeight: 1.35 },
      button: { fontWeight: typography.weight.semibold, fontSize: typography.roles.label, textTransform: 'none', letterSpacing: 0 }
    },
    shape: { borderRadius: pxNumber(radius.md) },
    zIndex: {
      mobileStepper: zIndex.sticky,
      fab: zIndex.dropdown,
      speedDial: zIndex.dropdown,
      appBar: zIndex.sticky,
      drawer: zIndex.overlay,
      modal: zIndex.modal,
      snackbar: zIndex.toast,
      tooltip: zIndex.toast + 10
    },
    components: {
      MuiCssBaseline: { styleOverrides: { body: { backgroundImage: 'none', backgroundColor: color.background, color: color.textPrimary } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', borderColor: color.border } } },
      MuiCard: { styleOverrides: { root: { backgroundImage: 'none', border: `1px solid ${color.border}`, borderRadius: pxNumber(radius.lg), boxShadow: elevation.low } } },
      MuiButton: {
        defaultProps: { disableElevation: true, size: 'small' },
        styleOverrides: {
          root: { minHeight: pxNumber(controls.default), borderRadius: pxNumber(radius.control), paddingInline: pxNumber(controls.horizontalPadding), whiteSpace: 'nowrap', boxShadow: 'none', fontSize: pxNumber(typography.roles.label), [mobileQuery]: { minHeight: pxNumber(controls.touch) } },
          containedPrimary: { color: onBrand, '&:hover': { backgroundColor: color.brandHover, color: onBrand } }
        }
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: pxNumber(radius.control), [mobileQuery]: { minWidth: pxNumber(controls.touch), minHeight: pxNumber(controls.touch) } } } },
      MuiTextField: { defaultProps: { size: 'small', fullWidth: true, variant: 'outlined', slotProps: { inputLabel: { shrink: true } } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            minHeight: pxNumber(controls.default), borderRadius: pxNumber(radius.control), backgroundColor: color.surface, alignItems: 'center',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: color.borderStrong },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: color.textMuted },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: color.focus, borderWidth: 1.5 },
            [mobileQuery]: { minHeight: pxNumber(controls.touch) }
          },
          input: { padding: '9px 10px', fontSize: pxNumber(typography.roles.dense), fontWeight: typography.weight.regular },
          inputMultiline: { padding: 0 }
        }
      },
      MuiInputBase: { styleOverrides: { inputMultiline: { padding: 0, lineHeight: typography.lineHeight.body } } },
      MuiInputLabel: { styleOverrides: { root: { fontSize: pxNumber(typography.roles.metadata), fontWeight: typography.weight.semibold, color: color.textSecondary } } },
      MuiSelect: { styleOverrides: { select: { paddingBlock: '8px', fontSize: pxNumber(typography.roles.dense), fontWeight: typography.weight.medium } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: pxNumber(controls.dense), margin: '2px 5px', borderRadius: pxNumber(radius.sm), fontSize: pxNumber(typography.roles.dense), fontWeight: typography.weight.medium, [mobileQuery]: { minHeight: pxNumber(controls.touch) } } } },
      MuiTab: { styleOverrides: { root: { minHeight: pxNumber(controls.tabs), minWidth: 0, padding: '7px 10px', fontSize: pxNumber(typography.roles.label), fontWeight: typography.weight.semibold, textTransform: 'none', [mobileQuery]: { minHeight: pxNumber(controls.touch) } } } },
      MuiTabs: { styleOverrides: { root: { minHeight: pxNumber(controls.tabs) }, indicator: { height: 2, borderRadius: 4 } } },
      MuiTableContainer: { styleOverrides: { root: { border: `1px solid ${color.border}`, borderRadius: pxNumber(radius.md), boxShadow: 'none' } } },
      MuiTableCell: { styleOverrides: { root: { padding: '9px 10px', fontSize: pxNumber(typography.roles.label), borderColor: color.border }, head: { fontSize: 9, fontWeight: typography.weight.strong, textTransform: 'uppercase', letterSpacing: '.045em', color: color.textMuted, backgroundColor: color.surfaceSubtle } } },
      MuiChip: { defaultProps: { size: 'small' }, styleOverrides: { root: { height: pxNumber(controls.chip), fontSize: 9, fontWeight: typography.weight.strong, borderRadius: pxNumber(radius.pill) } } },
      MuiDialog: { styleOverrides: { paper: { borderRadius: pxNumber(radius.lg), backgroundImage: 'none', border: `1px solid ${color.border}`, boxShadow: elevation.high } } },
      MuiBreadcrumbs: { styleOverrides: { root: { fontSize: pxNumber(typography.roles.metadata), fontWeight: typography.weight.medium, color: color.textMuted } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: pxNumber(typography.roles.metadata), borderRadius: pxNumber(radius.sm) } } }
    }
  });
}
