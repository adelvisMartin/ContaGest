export const API_INTEGRATIONS = [
  {
    key: 'bcv',
    name: 'BCV / Tasa oficial',
    category: 'Fiscal',
    frontendService: 'BcvService',
    backendEndpoint: '/api/v1/currency/bcv',
    env: ['BCV_PROVIDER'],
    fallback: ['DolarAPI oficial', 'Rafnixg BCV API', 'PyDolarVE', 'cache local', 'tasa manual'],
    risk: 'Cambio de formato, CORS, indisponibilidad o latencia.',
    hardening: 'Usar backend proxy, timeout, cache, stale-while-revalidate y tasa manual auditada.'
  },
  {
    key: 'seniat',
    name: 'SENIAT / RIF y retenciones',
    category: 'Fiscal',
    frontendService: 'SeniatService',
    backendEndpoint: '/api/v1/fiscal/rif',
    env: ['SENIAT_BASE_URL'],
    fallback: ['validación manual', 'catálogo local de contribuyentes especiales'],
    risk: 'No disponibilidad pública estable, captcha, cambios de HTML o servicio fuera de línea.',
    hardening: 'No bloquear facturación si falla; marcar como pendiente de validación y auditar.'
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp Cloud API',
    category: 'Notificaciones',
    backendEndpoint: '/api/v1/notifications/whatsapp/order',
    env: ['WHATSAPP_CLOUD_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    fallback: ['wa.me deep link', 'cola de reintentos', 'notificación interna'],
    risk: 'Tokens expuestos, plantillas no aprobadas, números sin opt-in, rate limit.',
    hardening: 'Solo backend, logs de envío, consentimiento, plantillas, reintentos e idempotencia.'
  },
  {
    key: 'maps',
    name: 'Google Maps / Mapbox',
    category: 'Delivery',
    backendEndpoint: '/api/v1/maps/geocode',
    env: ['GOOGLE_MAPS_API_KEY', 'MAPBOX_TOKEN'],
    fallback: ['Google Maps URL', 'captura manual de referencia', 'zona por parroquia/municipio'],
    risk: 'Costos, límites, direcciones ambiguas, latencia.',
    hardening: 'Places Autocomplete para entrada, geocoding backend, cache y zonas de cobertura.'
  },
  {
    key: 'openai',
    name: 'OpenAI Responses API',
    category: 'IA',
    backendEndpoint: '/api/v1/ai/chat',
    env: ['OPENAI_API_KEY', 'OPENAI_MODEL'],
    fallback: ['modo local con reglas', 'respuestas guiadas', 'documentación interna'],
    risk: 'Alucinación, acciones críticas sin autorización, filtrado de datos sensibles.',
    hardening: 'IA solo consulta/diagnóstico/sugerencia; aprobaciones humanas y logs.'
  },
  {
    key: 'mui',
    name: 'MUI / React islands',
    category: 'UI',
    frontendService: 'MuiRuntime',
    env: [],
    fallback: ['HTML nativo', 'CSS local'],
    risk: 'Fallo de CDN en modo estático si no se usa build local.',
    hardening: 'Migrar shell a Vite/React para producción; mantener fallback visible.'
  },
  {
    key: 'supabase',
    name: 'Supabase / PostgreSQL',
    category: 'Base de datos',
    backendEndpoint: 'Prisma DATABASE_URL + RLS',
    env: ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
    fallback: ['modo offline local', 'exportación JSON/XLSX'],
    risk: 'RLS incompleto, service role expuesto, tenant leakage.',
    hardening: 'RLS por tenant, JWT, service role solo backend, pruebas multiempresa.'
  }
];

export function integrationScore(integration) {
  let score = 0;
  if (integration.backendEndpoint) score += 30;
  if (integration.fallback?.length) score += 25;
  if (integration.hardening) score += 25;
  if (integration.env?.length) score += 10;
  if (integration.risk) score += 10;
  return Math.min(score, 100);
}

export function classifyIntegration(integration) {
  const score = integrationScore(integration);
  if (score >= 85) return 'robusta';
  if (score >= 65) return 'avanzada';
  return 'pretesting';
}
