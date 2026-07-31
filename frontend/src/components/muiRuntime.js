import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Mui from '@mui/material';
import { Toaster, toast } from 'react-hot-toast';
import { translations } from '../i18n/translations.js';

const runtime = { React, createRoot, Mui, HotToast: { Toaster, toast } };

function parseJson(value, fallback = []) {
  try { return JSON.parse(value || '[]'); } catch { return fallback; }
}

function ensureId(node, prefix = 'mui') {
  if (!node.dataset.muiId) node.dataset.muiId = `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  return node.dataset.muiId;
}

function modeFor(state) {
  return ['dark', 'enterprise'].includes(state?.settings?.theme) ? 'dark' : 'light';
}

function createContaGestTheme(mode = 'light') {
  const dark = mode === 'dark';
  return Mui.createTheme({
    palette: {
      mode,
      primary: { main: dark ? '#6dc0f1' : '#057dcd', dark: '#1e3d58' },
      background: { default: dark ? '#071523' : '#f5f8fb', paper: dark ? '#0d2031' : '#ffffff' },
      text: { primary: dark ? '#f5f9fc' : '#102a43', secondary: dark ? '#b9c9d8' : '#52677c' },
      divider: dark ? '#29445c' : '#d9e3ec'
    },
    typography: {
      fontFamily: 'Inter, Roboto, system-ui, sans-serif',
      fontSize: 12,
      button: { textTransform: 'none', fontWeight: 850, fontSize: '.72rem' },
      body1: { fontSize: '.76rem' },
      body2: { fontSize: '.72rem' }
    },
    shape: { borderRadius: 10 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true, size: 'small' },
        styleOverrides: { root: { minHeight: 36, borderRadius: 9, paddingInline: 12 } }
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            minHeight: 38,
            borderRadius: 9,
            backgroundColor: dark ? '#0d2031' : '#fff',
            '& .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#29445c' : '#d1dde7' },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#6dc0f1' : '#057dcd' },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: dark ? '#6dc0f1' : '#057dcd', borderWidth: 1.5 }
          },
          input: { padding: '9px 10px', fontSize: '.74rem', fontWeight: 750 }
        }
      },
      MuiInputLabel: { styleOverrides: { root: { fontSize: '.72rem', fontWeight: 800 } } },
      MuiSelect: { styleOverrides: { select: { paddingBlock: '8px', fontSize: '.73rem', fontWeight: 800 } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 36, margin: '2px 5px', borderRadius: 8, fontSize: '.72rem', fontWeight: 750 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiChip: { styleOverrides: { root: { height: 30, fontSize: '.66rem', fontWeight: 850, borderRadius: 9 } } },
      MuiBreadcrumbs: { styleOverrides: { root: { fontSize: '.69rem', fontWeight: 800 } } }
    }
  });
}

function Theme({ state, children }) {
  const mode = modeFor(state);
  const theme = React.useMemo(() => createContaGestTheme(mode), [mode]);
  return React.createElement(Mui.ThemeProvider, { theme }, children);
}

function SelectIsland({ node, state }) {
  const hidden = node.querySelector('input[type="hidden"]');
  const fallback = node.querySelector('select[data-mui-fallback]');
  const options = parseJson(node.dataset.muiOptions, []);
  const lang = state?.settings?.lang || 'es';
  const labelKey = node.dataset.muiLabel || 'Seleccione';
  const label = translations?.[lang]?.[labelKey] || labelKey;
  const labelHidden = node.dataset.muiLabelHidden === 'true';
  const id = ensureId(node, 'mui-select');
  const [value, setValue] = React.useState(String(node.dataset.muiValue ?? hidden?.value ?? fallback?.value ?? ''));

  React.useEffect(() => {
    const next = String(node.dataset.muiValue ?? hidden?.value ?? fallback?.value ?? '');
    setValue(next);
  }, [node.dataset.muiValue]);

  const emit = (next) => {
    setValue(next);
    node.dataset.muiValue = next;
    if (hidden) {
      hidden.value = next;
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (fallback) {
      fallback.value = next;
      fallback.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  return React.createElement(Theme, { state },
    React.createElement(Mui.FormControl, { fullWidth: true, size: 'small' },
      !labelHidden && React.createElement(Mui.InputLabel, { id: `${id}-label` }, label),
      React.createElement(Mui.Select, {
        id,
        labelId: labelHidden ? undefined : `${id}-label`,
        label: labelHidden ? undefined : label,
        value,
        displayEmpty: labelHidden,
        onChange: (event) => emit(String(event.target.value)),
        inputProps: { 'aria-label': label, name: node.dataset.muiName || hidden?.name || fallback?.name || '' },
        MenuProps: { PaperProps: { sx: { mt: .6, maxHeight: 340, borderRadius: 2, '& .MuiMenu-list': { p: .5 } } } }
      }, options.map((option) => React.createElement(Mui.MenuItem, { key: String(option.value), value: String(option.value) }, String(option.label))))
    )
  );
}

function icon(name) {
  return React.createElement('i', { className: `fa-solid ${name || 'fa-circle-dot'}`, style: { fontSize: 12 } });
}

function navigate(route) {
  if (route) window.dispatchEvent(new CustomEvent('cg:navigate', { detail: { route } }));
}

function QuickTabsIsland({ node, state }) {
  const items = parseJson(node.dataset.items, []);
  return React.createElement(Theme, { state },
    React.createElement(Mui.Box, { sx: { display: 'flex', alignItems: 'center', gap: .65, overflowX: 'auto', py: .2, px: .2, scrollbarWidth: 'none' } },
      items.map((item) => React.createElement(Mui.Chip, {
        key: item.route,
        icon: icon(item.locked ? 'fa-lock' : item.icon),
        label: item.label,
        color: item.active ? 'primary' : 'default',
        variant: item.active ? 'filled' : 'outlined',
        clickable: !item.active && !item.locked,
        disabled: Boolean(item.locked),
        'aria-current': item.active ? 'page' : undefined,
        title: item.locked ? 'Bloqueado por rol/perfil activo' : item.label,
        onClick: () => !item.active && !item.locked && navigate(item.route),
        sx: { flex: '0 0 auto', opacity: 1, '& .MuiChip-icon': { color: item.active ? '#fff' : 'primary.main' } }
      }))
    )
  );
}

function BreadcrumbsIsland({ node, state }) {
  const items = parseJson(node.dataset.items, []);
  return React.createElement(Theme, { state },
    React.createElement(Mui.Breadcrumbs, { separator: '›', maxItems: 4, 'aria-label': 'breadcrumb' },
      items.map((item, index) => item.current
        ? React.createElement(Mui.Typography, { key: `${item.label}-${index}`, color: 'primary', sx: { fontSize: '.69rem', fontWeight: 900 }, 'aria-current': 'page' }, item.label)
        : React.createElement(Mui.Link, {
            key: `${item.label}-${index}`,
            component: 'button',
            type: 'button',
            underline: item.route ? 'hover' : 'none',
            color: 'inherit',
            onClick: () => item.route && navigate(item.route),
            sx: { border: 0, bgcolor: 'transparent', p: 0, fontSize: '.69rem', fontWeight: 800, cursor: item.route ? 'pointer' : 'default' }
          }, item.label))
    )
  );
}

function ButtonIsland({ node, state }) {
  const fallback = node.querySelector('[data-mui-button-fallback]');
  const label = node.dataset.muiText || fallback?.textContent?.trim() || 'Acción';
  const iconName = node.dataset.muiIcon || '';
  const variant = node.dataset.muiVariant || 'contained';
  const color = node.dataset.muiColor || 'primary';
  return React.createElement(Theme, { state },
    React.createElement(Mui.Button, {
      variant,
      color,
      startIcon: iconName ? icon(iconName) : undefined,
      onClick: () => fallback?.click(),
      sx: { whiteSpace: 'nowrap' }
    }, label)
  );
}

function mount(node, marker, mountSelector, element) {
  if (!node || node.dataset[marker] === 'true') return;
  const target = node.querySelector(mountSelector);
  if (!target) return;
  node.dataset[marker] = 'true';
  const root = createRoot(target);
  root.render(element);
  return root;
}

function mountSelect(node, ctx) {
  const root = mount(node, 'muiMounted', '[data-mui-mount]', React.createElement(SelectIsland, { node, state: ctx.state }));
  if (root) node.classList.add('mui-loading-done');
}

function mountQuickTabs(node, ctx) {
  const root = mount(node, 'muiQuicktabsMounted', '[data-mui-quicktabs-mount]', React.createElement(QuickTabsIsland, { node, state: ctx.state }));
  if (root) {
    node.querySelectorAll('.page-tab').forEach((item) => item.classList.add('mui-fallback-hidden'));
    node.classList.add('mui-quicktabs-ready');
  }
}

function mountBreadcrumbs(node, ctx) {
  const root = mount(node, 'muiBreadcrumbsMounted', '[data-mui-breadcrumb-mount]', React.createElement(BreadcrumbsIsland, { node, state: ctx.state }));
  if (root) {
    node.querySelector('.hf-breadcrumbs-fallback')?.classList.add('mui-fallback-hidden');
    node.classList.add('mui-breadcrumbs-ready');
  }
}

function mountButton(node, ctx) {
  const root = mount(node, 'muiButtonMounted', '[data-mui-button-mount]', React.createElement(ButtonIsland, { node, state: ctx.state }));
  if (root) {
    node.querySelector('[data-mui-button-fallback]')?.classList.add('mui-fallback-hidden');
    node.classList.add('mui-button-ready');
  }
}

function mountToast(ctx) {
  const node = document.getElementById('hot-toast-root');
  if (!node || node.dataset.hotToastMounted === 'true') return;
  node.dataset.hotToastMounted = 'true';
  window.CG_HOT_TOAST = toast;
  const dark = modeFor(ctx.state) === 'dark';
  createRoot(node).render(React.createElement(Toaster, {
    position: 'top-right',
    gutter: 8,
    toastOptions: {
      duration: 3600,
      style: {
        borderRadius: '11px',
        background: dark ? '#0d2031' : '#fff',
        color: dark ? '#f5f9fc' : '#102a43',
        border: `1px solid ${dark ? '#29445c' : '#d9e3ec'}`,
        boxShadow: '0 12px 32px rgba(30,61,88,.14)',
        fontSize: 12,
        fontWeight: 800
      }
    }
  }));
}

export const MuiRuntime = {
  mountAll(ctx = {}) {
    window.__CG_MUI__ = runtime;
    mountToast(ctx);
    document.querySelectorAll('[data-mui-select-field]').forEach((node) => mountSelect(node, ctx));
    document.querySelectorAll('[data-mui-button-field]').forEach((node) => mountButton(node, ctx));
    document.querySelectorAll('[data-mui-quicktabs]').forEach((node) => mountQuickTabs(node, ctx));
    document.querySelectorAll('[data-mui-breadcrumbs]').forEach((node) => mountBreadcrumbs(node, ctx));
  }
};
