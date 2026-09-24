import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ThemeProvider,
  Typography,
} from '@mui/material';
import { createContaGestMuiTheme, muiModeFor } from '../../muiRuntime.js';
import { formatMoneyExact } from './moneyFormat.js';

export function CgProvider({ state, children }) {
  const mode = muiModeFor(state);
  const theme = React.useMemo(() => createContaGestMuiTheme(mode), [mode]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

export function CgButton({ children, variant = 'contained', ...props }) {
  return <Button variant={variant} {...props}>{children}</Button>;
}

export function CgIconButton({ label, children, ...props }) {
  if (!String(label || '').trim()) throw new Error('CgIconButton requires an accessible label.');
  return <IconButton aria-label={label} title={label} {...props}>{children}</IconButton>;
}

function mergeSlotProp(slotProp, legacyProp) {
  if (!legacyProp) return slotProp;
  if (typeof slotProp === 'function') {
    return (ownerState) => ({ ...(slotProp(ownerState) || {}), ...legacyProp });
  }
  return { ...(slotProp || {}), ...legacyProp };
}

function normalizeTextFieldSlots(slotProps, legacy) {
  const next = { ...(slotProps || {}) };
  next.htmlInput = mergeSlotProp(next.htmlInput, legacy.inputProps);
  next.input = mergeSlotProp(next.input, legacy.InputProps);
  next.inputLabel = mergeSlotProp(next.inputLabel, legacy.InputLabelProps);
  next.formHelperText = mergeSlotProp(next.formHelperText, legacy.FormHelperTextProps);
  next.select = mergeSlotProp(next.select, legacy.SelectProps);
  return Object.values(legacy).some(Boolean) ? next : slotProps;
}

export function CgTextField({
  label,
  helperText,
  errorText,
  inputProps,
  InputProps,
  InputLabelProps,
  FormHelperTextProps,
  SelectProps,
  slotProps,
  ...props
}) {
  if (!String(label || '').trim()) throw new Error('CgTextField requires a persistent label.');
  const error = Boolean(errorText || props.error);
  const normalizedSlotProps = normalizeTextFieldSlots(slotProps, {
    inputProps,
    InputProps,
    InputLabelProps,
    FormHelperTextProps,
    SelectProps,
  });
  return <TextField label={label} error={error} helperText={errorText || helperText} slotProps={normalizedSlotProps} {...props} />;
}

export function CgSelect({ label, value, options = [], onChange, id, ...props }) {
  const generatedId = React.useId().replace(/:/g, '');
  if (!String(label || '').trim()) throw new Error('CgSelect requires a persistent label.');
  const selectId = id || `cg-select-${generatedId}`;
  const labelId = `${selectId}-label`;
  return (
    <FormControl fullWidth size="small">
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select id={selectId} labelId={labelId} label={label} value={value} onChange={onChange} {...props}>
        {options.map((option) => <MenuItem key={String(option.value)} value={option.value}>{option.label}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

export function CgStatusChip({ label, tone = 'default', ...props }) {
  const color = ['success', 'warning', 'error', 'info', 'primary', 'secondary'].includes(tone) ? tone : 'default';
  return <Chip label={label} color={color} variant={color === 'default' ? 'outlined' : 'filled'} {...props} />;
}

export function CgPageHeader({ eyebrow = 'ContaGest', title, description, actions = null }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 2, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" component="p" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, mb: .5 }}>{eyebrow}</Typography>
        <Typography variant="h4" component="h1">{title}</Typography>
        {description ? <Typography variant="body2" color="text.secondary" sx={{ mt: .75, maxWidth: 760 }}>{description}</Typography> : null}
      </Box>
      {actions ? <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>{actions}</Stack> : null}
    </Stack>
  );
}

export function CgEmptyState({ title, description, action = null }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, textAlign: 'center' }}>
      <Typography variant="subtitle1" component="h3">{title}</Typography>
      {description ? <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{description}</Typography> : null}
      {action ? <Box sx={{ mt: 1.5 }}>{action}</Box> : null}
    </Paper>
  );
}

export function CgState({ severity = 'info', title, children }) {
  return <Alert severity={severity}><strong>{title}</strong>{children ? <> — {children}</> : null}</Alert>;
}

export function CgDialog({ open, title, children, onClose, confirmLabel = 'Confirmar', onConfirm, destructive = false }) {
  const generatedId = React.useId().replace(/:/g, '');
  if (!String(title || '').trim()) throw new Error('CgDialog requires an accessible title.');
  const titleId = `cg-dialog-title-${generatedId}`;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby={titleId}>
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>{children}</DialogContent>
      <DialogActions>
        <CgButton variant="text" onClick={onClose}>Cancelar</CgButton>
        <CgButton color={destructive ? 'error' : 'primary'} onClick={onConfirm}>{confirmLabel}</CgButton>
      </DialogActions>
    </Dialog>
  );
}

export function CgMoney({ value, currency = 'USD', locale = 'es-VE' }) {
  const output = formatMoneyExact(value, { currency, locale });
  return <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{output}</Box>;
}

export function CgDataTable({ columns = [], rows = [], getRowId = (row, index) => row.id ?? index, empty = 'Sin datos' }) {
  if (!rows.length) return <CgEmptyState title={empty} description="No hay registros representativos para esta vista." />;
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead><TableRow>{columns.map((column) => <TableCell key={column.key} scope="col" align={column.align || 'left'}>{column.label}</TableCell>)}</TableRow></TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={getRowId(row, index)} hover>
              {columns.map((column) => <TableCell key={column.key} align={column.align || 'left'}>{column.render ? column.render(row) : row[column.key]}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function FontAwesomeIcon({ name }) {
  return <i className={`fa-solid ${name}`} aria-hidden="true" />;
}

function FoundationPilot({ variant = 'brand' }) {
  const [status, setStatus] = React.useState('ready');
  const [query, setQuery] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const rows = [
    { id: 'theme', component: 'Theme', state: 'Canónico', owner: 'MUI 9 + tokens ContaGest' },
    { id: 'button', component: 'CgButton', state: 'Piloto', owner: 'MUI Button' },
    { id: 'field', component: 'CgTextField', state: 'Piloto', owner: 'MUI TextField' },
  ];
  if (variant === 'help') {
    return (
      <Stack sx={{ gap: 1.5 }} data-cg-pilot="help">
        <CgState severity="info" title="Design System foundation">Esta superficie usa componentes Cg* sobre el mismo theme MUI canónico.</CgState>
        <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1 }}>
          <CgTextField label="Buscar ayuda" value={query} onChange={(event) => setQuery(event.target.value)} />
          <CgButton startIcon={<FontAwesomeIcon name="fa-magnifying-glass" />} onClick={() => setStatus(query ? 'filtered' : 'ready')}>Buscar</CgButton>
        </Stack>
        <CgStatusChip label={status === 'filtered' ? 'Filtro aplicado' : 'Listo'} tone="success" />
      </Stack>
    );
  }
  return (
    <Stack sx={{ gap: 2 }} data-cg-pilot="brand">
      <CgPageHeader
        eyebrow="Foundation #100"
        title="Primitives canónicos Cg*"
        description="Piloto de bajo riesgo: los wrappers conservan la identidad ContaGest y delegan estados, foco y semántica base a Material UI 9."
        actions={<><CgButton variant="outlined" onClick={() => setDialogOpen(true)}>Probar diálogo</CgButton><CgIconButton label="Ayuda del piloto"><FontAwesomeIcon name="fa-circle-question" /></CgIconButton></>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1.5 }}>
        <CgTextField label="Campo de ejemplo" value={query} onChange={(event) => setQuery(event.target.value)} helperText="38 px desktop / 44 px touch por theme canónico." />
        <CgSelect label="Estado" value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: 'ready', label: 'Listo' }, { value: 'review', label: 'En revisión' }]} />
      </Stack>
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <CgStatusChip label={status === 'ready' ? 'READY' : 'REVIEW'} tone={status === 'ready' ? 'success' : 'warning'} />
        <Typography variant="body2">Importe de presentación: <CgMoney value="1234.50" currency="USD" /></Typography>
      </Stack>
      <CgDataTable columns={[{ key: 'component', label: 'Componente' }, { key: 'state', label: 'Estado' }, { key: 'owner', label: 'Owner' }]} rows={rows} />
      <CgDialog open={dialogOpen} title="Contrato de diálogo" onClose={() => setDialogOpen(false)} onConfirm={() => setDialogOpen(false)}>
        <Typography variant="body2">Escape/cierre y restauración de foco quedan bajo el primitive MUI; #99 mantiene el gate de accesibilidad.</Typography>
      </CgDialog>
    </Stack>
  );
}

export function mountCgFoundationPilot(node, state, variant = 'brand') {
  if (!node || node.dataset.cgMuiMounted === 'true') return null;
  node.dataset.cgMuiMounted = 'true';
  const root = createRoot(node);
  root.render(<CgProvider state={state}><FoundationPilot variant={variant} /></CgProvider>);
  return () => {
    root.unmount();
    delete node.dataset.cgMuiMounted;
  };
}
