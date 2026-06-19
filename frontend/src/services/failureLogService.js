import { MODULE_CATALOG } from '../data/moduleCatalog.js';

const now = () => new Date().toISOString();
const uid = (prefix = 'fl') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const FAILURE_SEVERITIES = {
  critical: { label: 'Crítica', tone: 'danger' },
  high: { label: 'Alta', tone: 'danger' },
  medium: { label: 'Media', tone: 'warning' },
  low: { label: 'Baja', tone: 'slate' },
  resolved: { label: 'Resuelta', tone: 'success' }
};

export const FAILURE_STATUSES = ['abierta', 'en_revision', 'bloqueada', 'resuelta'];

const MODULE_BY_ROUTE = Object.fromEntries(MODULE_CATALOG.map((module) => [module.route, module]));

function defaultEntries() {
  return [
    {
      id: uid('qa'),
      at: now(),
      module: 'reportes',
      area: 'Analítica',
      severity: 'medium',
      status: 'en_revision',
      title: 'Alinear reportes PDF con membrete empresarial',
      detail: 'Se creó configuración de empresa y membrete; mantener validación visual antes de producción.',
      owner: 'Admin / QA',
      resolution: 'Plantilla PDF v10.2 aplicada y pendiente de prueba real con datos de Supabase.'
    },
    {
      id: uid('qa'),
      at: now(),
      module: 'admin',
      area: 'Administración',
      severity: 'low',
      status: 'resuelta',
      title: 'Control de demos desde administrador',
      detail: 'Alta, edición, vencimiento, límite de módulos y simulación de usuario demo preparados.',
      owner: 'Admin',
      resolution: 'RBAC local + endpoints backend listos para sincronizar.'
    },
    {
      id: uid('qa'),
      at: now(),
      module: 'backend',
      area: 'Administración',
      severity: 'medium',
      status: 'abierta',
      title: 'Validar variables de entorno en Vercel/hosting backend',
      detail: 'Antes de producción hay que confirmar VITE_API_BASE_URL, DATABASE_URL, JWT_SECRET y CORS.',
      owner: 'DevOps',
      resolution: 'Usar .env.example y no subir secretos al repositorio.'
    }
  ];
}

export const FailureLogService = {
  defaultState() {
    return {
      entries: defaultEntries(),
      slaHours: { critical: 4, high: 12, medium: 48, low: 96 },
      lastReviewedAt: now()
    };
  },
  ensure(log) {
    const base = this.defaultState();
    return {
      ...base,
      ...(log || {}),
      entries: Array.isArray(log?.entries) && log.entries.length ? log.entries : base.entries
    };
  },
  summary(logInput) {
    const log = this.ensure(logInput);
    const open = log.entries.filter((entry) => entry.status !== 'resuelta');
    const critical = open.filter((entry) => ['critical', 'high'].includes(entry.severity));
    const resolved = log.entries.filter((entry) => entry.status === 'resuelta');
    const byModule = open.reduce((acc, entry) => {
      acc[entry.module] = (acc[entry.module] || 0) + 1;
      return acc;
    }, {});
    return {
      total: log.entries.length,
      open: open.length,
      critical: critical.length,
      resolved: resolved.length,
      byModule,
      healthScore: Math.max(0, Math.min(100, 96 - critical.length * 12 - open.length * 4 + Math.min(10, resolved.length)))
    };
  },
  create(logInput, data = {}) {
    const log = this.ensure(logInput);
    const module = MODULE_BY_ROUTE[data.module] || MODULE_CATALOG.find((item) => item.name === data.module) || MODULE_BY_ROUTE.dashboard;
    const entry = {
      id: uid('fl'),
      at: now(),
      module: data.module || module?.route || 'dashboard',
      area: module?.area || data.area || 'General',
      severity: data.severity || 'medium',
      status: data.status || 'abierta',
      title: String(data.title || 'Falla sin título').trim(),
      detail: String(data.detail || 'Pendiente de documentar').trim(),
      owner: String(data.owner || 'QA interno').trim(),
      resolution: String(data.resolution || '').trim()
    };
    return { ...log, lastReviewedAt: now(), entries: [entry, ...log.entries].slice(0, 250) };
  },
  resolve(logInput, id, resolution = 'Cerrado desde bitácora interna.') {
    const log = this.ensure(logInput);
    return {
      ...log,
      lastReviewedAt: now(),
      entries: log.entries.map((entry) => entry.id === id ? { ...entry, status: 'resuelta', severity: 'resolved', resolvedAt: now(), resolution } : entry)
    };
  },
  reopen(logInput, id) {
    const log = this.ensure(logInput);
    return {
      ...log,
      lastReviewedAt: now(),
      entries: log.entries.map((entry) => entry.id === id ? { ...entry, status: 'abierta', severity: entry.severity === 'resolved' ? 'medium' : entry.severity, reopenedAt: now() } : entry)
    };
  },
  moduleOptions() {
    return MODULE_CATALOG.map((module) => ({ value: module.route, label: `${module.name} · ${module.area}` }));
  }
};
