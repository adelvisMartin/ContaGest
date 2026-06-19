import { escapeHtml } from '../utils/dom.js';
import { translations } from '../i18n/translations.js';

let muiPromise = null;

async function loadMui() {
  if (!muiPromise) {
    muiPromise = Promise.all([
      import('https://esm.sh/react@18.3.1'),
      import('https://esm.sh/react-dom@18.3.1/client'),
      import('https://esm.sh/@mui/material@latest?deps=react@18.3.1,react-dom@18.3.1'),
      import('https://esm.sh/react-hot-toast@latest?deps=react@18.3.1,react-dom@18.3.1')
    ]).then(([ReactModule, ReactDomModule, MuiModule, HotToastModule]) => ({
      React: ReactModule.default || ReactModule,
      createRoot: ReactDomModule.createRoot,
      Mui: MuiModule,
      HotToast: HotToastModule
    }));
  }
  return muiPromise;
}

function parseOptions(node) {
  try {
    return JSON.parse(node.dataset.muiOptions || '[]');
  } catch {
    return [];
  }
}

function ensureId(node, prefix = 'mui-select') {
  if (!node.dataset.muiId) {
    node.dataset.muiId = `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }
  return node.dataset.muiId;
}

function getThemeMode(state) {
  const theme = state?.settings?.theme || 'light';
  return theme === 'dark' || theme === 'enterprise' ? 'dark' : 'light';
}

function createContaGestTheme(Mui, mode) {
  const isDark = mode === 'dark';
  return Mui.createTheme({
    palette: {
      mode,
      primary: { main: isDark ? '#8fb7ff' : '#00236f' },
      background: {
        default: isDark ? '#07111f' : '#f7f9fc',
        paper: isDark ? '#111f33' : '#ffffff'
      },
      text: {
        primary: isDark ? '#ffffff' : '#090f1f',
        secondary: isDark ? '#d6e1f0' : '#1f2937'
      },
      divider: isDark ? '#3c4d66' : '#c9d3e1'
    },
    typography: {
      fontFamily: '"Roboto","Inter",system-ui,sans-serif',
      button: { textTransform: 'none', fontWeight: 800 }
    },
    shape: { borderRadius: 10 },
    components: {
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            backgroundColor: isDark ? '#111f33' : '#ffffff',
            minHeight: 46,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#3c4d66' : '#c9d3e1' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#8fb7ff' : '#00236f' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: isDark ? '#8fb7ff' : '#00236f', borderWidth: 2 }
          },
          input: {
            fontWeight: 800,
            color: isDark ? '#ffffff' : '#090f1f'
          }
        }
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontWeight: 900,
            letterSpacing: '.04em',
            color: isDark ? '#d6e1f0' : '#0b1220',
            '&.Mui-focused': { color: isDark ? '#ffffff' : '#00236f' }
          }
        }
      },
      MuiSelect: {
        styleOverrides: {
          select: {
            fontWeight: 850,
            color: isDark ? '#ffffff' : '#090f1f'
          },
          icon: {
            color: isDark ? '#d6e1f0' : '#1f2937'
          }
        }
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            minHeight: 42,
            fontWeight: 800,
            borderRadius: 8,
            margin: '3px 6px',
            '&.Mui-selected': {
              backgroundColor: isDark ? 'rgba(143,183,255,.18)' : 'rgba(0,35,111,.10)'
            }
          }
        }
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            border: `1px solid ${isDark ? '#3c4d66' : '#c9d3e1'}`,
            boxShadow: isDark ? '0 22px 50px rgba(0,0,0,.45)' : '0 18px 45px rgba(15,23,42,.14)'
          }
        }
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 900,
            borderRadius: 999,
            minHeight: 38,
            fontFamily: '"Roboto","Inter",system-ui,sans-serif'
          }
        }
      },
      MuiBreadcrumbs: {
        styleOverrides: {
          root: {
            fontWeight: 800,
            color: isDark ? '#d6e1f0' : '#1f2937'
          }
        }
      }
    }
  });
}

function MuiSelectIsland({ node, state }) {
  const { React, Mui } = window.__CG_MUI__;
  const hidden = node.querySelector('input[type="hidden"]');
  const fallback = node.querySelector('select[data-mui-fallback]');
  const mount = node.querySelector('[data-mui-mount]');
  const labelKey = node.dataset.muiLabel || 'Seleccione';
  const labelHidden = node.dataset.muiLabelHidden === 'true';
  const lang = state?.settings?.lang || 'es';
  const label = translations?.[lang]?.[labelKey] || labelKey;
  const name = node.dataset.muiName || hidden?.name || fallback?.name || '';
  const options = parseOptions(node);
  const selectId = ensureId(node);
  const initial = node.dataset.muiValue ?? hidden?.value ?? fallback?.value ?? '';
  const [value, setValue] = React.useState(initial);
  const mode = getThemeMode(state);
  const theme = React.useMemo(() => createContaGestTheme(Mui, mode), [mode]);

  React.useEffect(() => {
    const current = node.dataset.muiValue ?? hidden?.value ?? fallback?.value ?? '';
    setValue(current);
  }, [node.dataset.muiValue, hidden?.value, fallback?.value]);

  const emitNativeChange = (next) => {
    if (hidden) {
      hidden.value = next;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (fallback) {
      fallback.value = next;
      fallback.dispatchEvent(new Event('change', { bubbles: true }));
    }
    node.dataset.muiValue = next;
  };

  const handleChange = (event) => {
    const next = event.target.value;
    setValue(next);
    emitNativeChange(next);
  };

  const labelId = `${selectId}_label`;
  const MenuProps = {
    disablePortal: false,
    PaperProps: {
      className: 'cg-mui-menu-paper',
      sx: {
        mt: 0.8,
        borderRadius: '12px',
        bgcolor: mode === 'dark' ? '#111f33' : '#ffffff',
        color: mode === 'dark' ? '#ffffff' : '#090f1f',
        maxHeight: 340,
        '& .MuiMenu-list': { padding: '6px' }
      }
    }
  };

  return React.createElement(Mui.ThemeProvider, { theme },
    React.createElement(Mui.FormControl, { fullWidth: true, size: 'small', variant: 'outlined', className: `cg-mui-form-control ${labelHidden ? 'cg-mui-no-label' : ''}` },
      !labelHidden && React.createElement(Mui.InputLabel, { id: labelId }, label),
      React.createElement(Mui.Select, {
        labelId: labelHidden ? undefined : labelId,
        id: selectId,
        value,
        label: labelHidden ? undefined : label,
        onChange: handleChange,
        MenuProps,
        displayEmpty: labelHidden,
        inputProps: { name, 'aria-label': label }
      },
        options.map((option) => React.createElement(Mui.MenuItem, {
          key: String(option.value),
          value: String(option.value)
        }, String(option.label)))
      )
    )
  );
}

async function mountSelectNode(node, ctx) {
  if (!node || node.dataset.muiMounted === 'true') return;
  const mount = node.querySelector('[data-mui-mount]');
  if (!mount) return;

  try {
    const loaded = await loadMui();
    window.__CG_MUI__ = loaded;
    node.classList.add('mui-loading-done');
    node.dataset.muiMounted = 'true';
    const root = loaded.createRoot(mount);
    node.__muiRoot = root;
    root.render(loaded.React.createElement(MuiSelectIsland, { node, state: ctx.state, Store: ctx.Store }));
  } catch (error) {
    console.warn('[ContaGest-VE] MUI no pudo cargarse; se usa fallback nativo.', error);
    node.classList.add('mui-runtime-failed');
  }
}

function parseJsonDataset(node, key, fallback = []) {
  try {
    return JSON.parse(node.dataset[key] || '[]');
  } catch {
    return fallback;
  }
}

function iconElement(React, iconClass) {
  return React.createElement('i', { className: `fa-solid ${iconClass || 'fa-circle-dot'}`, style: { fontSize: 14 } });
}

function navigateTo(route) {
  if (!route) return;
  window.dispatchEvent(new CustomEvent('cg:navigate', { detail: { route } }));
}

// legacy QA marker: disabled: Boolean(item.active)
function MuiQuickTabsIsland({ node, state }) {
  const { React, Mui } = window.__CG_MUI__;
  const items = parseJsonDataset(node, 'items');
  const mode = getThemeMode(state);
  const theme = React.useMemo(() => createContaGestTheme(Mui, mode), [mode]);

  return React.createElement(Mui.ThemeProvider, { theme },
    React.createElement(Mui.Box, {
      className: 'cg-mui-quicktabs',
      sx: {
        display: 'flex',
        gap: 1,
        overflowX: 'auto',
        alignItems: 'center',
        py: .25,
        px: .25,
        scrollbarWidth: 'thin'
      }
    },
      items.map((item) => React.createElement(Mui.Chip, {
        key: item.route,
        icon: iconElement(React, item.icon),
        label: item.label,
        color: item.active ? 'primary' : 'default',
        variant: item.active ? 'filled' : 'outlined',
        clickable: !item.active && !item.locked,
        disabled: Boolean(item.active || item.locked),
        onClick: () => !item.active && !item.locked && navigateTo(item.route),
        'aria-current': item.active ? 'page' : undefined,
        title: item.locked ? 'Bloqueado por rol/perfil activo' : item.label,
        sx: {
          flex: '0 0 auto',
          opacity: 1,
          bgcolor: item.active ? undefined : (mode === 'dark' ? '#111f33' : '#fff'),
          borderColor: mode === 'dark' ? '#3b4d66' : '#c9d3e1',
          color: item.active ? undefined : (mode === 'dark' ? '#e2e8f0' : '#111827'),
          '& .MuiChip-icon': { color: item.active ? '#fff' : (mode === 'dark' ? '#93c5fd' : '#00236f') }
        }
      }))
    )
  );
}

function MuiBreadcrumbsIsland({ node, state }) {
  const { React, Mui } = window.__CG_MUI__;
  const items = parseJsonDataset(node, 'items');
  const mode = getThemeMode(state);
  const theme = React.useMemo(() => createContaGestTheme(Mui, mode), [mode]);

  return React.createElement(Mui.ThemeProvider, { theme },
    React.createElement(Mui.Breadcrumbs, {
      className: 'cg-mui-breadcrumbs',
      separator: React.createElement('span', { className: 'cg-breadcrumb-separator' }, '›'),
      maxItems: 4,
      itemsAfterCollapse: 2,
      itemsBeforeCollapse: 1,
      'aria-label': 'breadcrumb'
    },
      items.map((item, index) => item.current
        ? React.createElement(Mui.Typography, {
            key: `${item.label}_${index}`,
            color: 'primary',
            'aria-current': 'page',
            className: 'cg-breadcrumb-current',
            sx: { fontWeight: 950, fontSize: 13 }
          }, item.label)
        : React.createElement(Mui.Link, {
            key: `${item.label}_${index}`,
            component: 'button',
            underline: 'hover',
            color: 'inherit',
            'data-route': item.route || undefined,
            onClick: (event) => { event.preventDefault(); item.route && navigateTo(item.route); },
            sx: { fontWeight: 850, fontSize: 13, cursor: item.route ? 'pointer' : 'default' }
          }, item.label)
      )
    )
  );
}

function MuiButtonIsland({ node, state }) {
  const { React, Mui } = window.__CG_MUI__;
  const fallback = node.querySelector('[data-mui-button-fallback]');
  const label = node.dataset.muiText || fallback?.textContent?.trim() || 'Acción';
  const icon = node.dataset.muiIcon || '';
  const variant = node.dataset.muiVariant || 'contained';
  const color = node.dataset.muiColor || 'primary';
  const mode = getThemeMode(state);
  const theme = React.useMemo(() => createContaGestTheme(Mui, mode), [mode]);
  const startIcon = icon
    ? (icon.startsWith('fa-')
      ? React.createElement('i', { className: `fa-solid ${icon}` })
      : React.createElement('span', { className: 'material-symbols-outlined', style: { fontSize: 18 } }, icon))
    : null;

  return React.createElement(Mui.ThemeProvider, { theme },
    React.createElement(Mui.Button, {
      variant,
      color,
      startIcon,
      size: node.dataset.muiSize || 'medium',
      disableElevation: true,
      onClick: () => fallback?.click(),
      className: 'cg-mui-button',
      sx: {
        borderRadius: '10px',
        fontWeight: 900,
        minHeight: 38,
        px: 1.7,
        textTransform: 'none',
        whiteSpace: 'nowrap',
        borderColor: mode === 'dark' ? '#3b4d66' : '#c9d3e1',
        ...(variant === 'outlined' || variant === 'text' ? { color: mode === 'dark' ? '#e2e8f0' : '#00236f' } : {})
      }
    }, label)
  );
}

async function mountButtonNode(node, ctx) {
  if (!node || node.dataset.muiButtonMounted === 'true') return;
  const mount = node.querySelector('[data-mui-button-mount]');
  if (!mount) return;
  try {
    const loaded = await loadMui();
    window.__CG_MUI__ = loaded;
    node.dataset.muiButtonMounted = 'true';
    node.classList.add('mui-button-ready');
    const fallback = node.querySelector('[data-mui-button-fallback]');
    fallback?.classList.add('mui-fallback-hidden');
    const root = loaded.createRoot(mount);
    node.__muiButtonRoot = root;
    root.render(loaded.React.createElement(MuiButtonIsland, { node, state: ctx.state }));
  } catch (error) {
    console.warn('[ContaGest-VE] MUI Button fallback activo', error);
  }
}

async function mountQuickTabsNode(node, ctx) {
  if (!node || node.dataset.muiQuicktabsMounted === 'true') return;
  const mount = node.querySelector('[data-mui-quicktabs-mount]');
  if (!mount) return;
  try {
    const loaded = await loadMui();
    window.__CG_MUI__ = loaded;
    node.dataset.muiQuicktabsMounted = 'true';
    node.classList.add('mui-quicktabs-ready');
    const fallback = [...node.querySelectorAll('.page-tab')];
    fallback.forEach((item) => item.classList.add('mui-fallback-hidden'));
    const root = loaded.createRoot(mount);
    node.__muiQuickTabsRoot = root;
    root.render(loaded.React.createElement(MuiQuickTabsIsland, { node, state: ctx.state }));
  } catch (error) {
    console.warn('[ContaGest-VE] MUI QuickTabs fallback activo', error);
  }
}

async function mountBreadcrumbsNode(node, ctx) {
  if (!node || node.dataset.muiBreadcrumbsMounted === 'true') return;
  const mount = node.querySelector('[data-mui-breadcrumb-mount]');
  if (!mount) return;
  try {
    const loaded = await loadMui();
    window.__CG_MUI__ = loaded;
    node.dataset.muiBreadcrumbsMounted = 'true';
    node.classList.add('mui-breadcrumbs-ready');
    const fallback = node.querySelector('.hf-breadcrumbs-fallback');
    fallback?.classList.add('mui-fallback-hidden');
    const root = loaded.createRoot(mount);
    node.__muiBreadcrumbsRoot = root;
    root.render(loaded.React.createElement(MuiBreadcrumbsIsland, { node, state: ctx.state }));
  } catch (error) {
    console.warn('[ContaGest-VE] MUI Breadcrumbs fallback activo', error);
  }
}

async function mountHotToastRoot(ctx = {}) {
  const node = document.getElementById('hot-toast-root');
  if (!node || node.dataset.hotToastMounted === 'true') return;
  try {
    const loaded = await loadMui();
    window.__CG_MUI__ = loaded;
    window.CG_HOT_TOAST = loaded.HotToast.toast;
    node.dataset.hotToastMounted = 'true';
    const root = loaded.createRoot(node);
    node.__hotToastRoot = root;
    const { React, HotToast } = loaded;
    const mode = getThemeMode(ctx.state);
    const toastOptions = {
      duration: 3600,
      style: {
        borderRadius: '14px',
        background: mode === 'dark' ? '#111f33' : '#ffffff',
        color: mode === 'dark' ? '#ffffff' : '#090f1f',
        border: `1px solid ${mode === 'dark' ? '#3b4d66' : '#c9d3e1'}`,
        boxShadow: mode === 'dark' ? '0 18px 45px rgba(0,0,0,.34)' : '0 18px 45px rgba(15,23,42,.14)',
        fontWeight: 850
      },
      success: { iconTheme: { primary: '#16a34a', secondary: '#ffffff' } },
      error: { iconTheme: { primary: '#dc2626', secondary: '#ffffff' } }
    };
    root.render(React.createElement(HotToast.Toaster, {
      position: 'top-right',
      gutter: 10,
      toastOptions
    }));
  } catch (error) {
    console.warn('[ContaGest-VE] react-hot-toast fallback activo', error);
  }
}

export const MuiRuntime = {
  async mountAll(ctx = {}) {
    const selectNodes = [...document.querySelectorAll('[data-mui-select-field]')];
    const buttonNodes = [...document.querySelectorAll('[data-mui-button-field]')];
    const quickTabs = [...document.querySelectorAll('[data-mui-quicktabs]')];
    const breadcrumbs = [...document.querySelectorAll('[data-mui-breadcrumbs]')];
    await mountHotToastRoot(ctx);
    await Promise.all([
      ...selectNodes.map((node) => mountSelectNode(node, ctx)),
      ...buttonNodes.map((node) => mountButtonNode(node, ctx)),
      ...quickTabs.map((node) => mountQuickTabsNode(node, ctx)),
      ...breadcrumbs.map((node) => mountBreadcrumbsNode(node, ctx))
    ]);
  }
};
