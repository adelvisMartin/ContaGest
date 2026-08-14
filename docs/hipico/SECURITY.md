# CONTROL HÍPICO · Seguridad

## Fronteras de confianza

- **Frontend/PWA:** solo configuración pública; nunca Service Role, Meta App Secret, access token privado, credencial de webhook ni clave administrativa.
- **IndexedDB:** base operacional offline; no almacenar secretos de servidor. Los respaldos exportados son información operacional sensible.
- **Backend/Vercel Functions:** secretos server-side, autorización, rate limits, auditoría e integraciones privilegiadas.
- **Supabase:** RLS por identidad/propietario/dispositivo según el modelo definitivo. Service Role únicamente en backend controlado.
- **WhatsApp/Bridge:** adaptador independiente; no forma parte del dominio hípico.

## Modelo de amenazas mínimo

1. robo o reutilización de sesión;
2. dispositivo perdido;
3. manipulación de IndexedDB o backup;
4. replay de webhook/mensaje;
5. doble submit o duplicación de operación;
6. XSS/inyección mediante texto importado;
7. exposición accidental de secretos;
8. endpoint sin autorización/RLS;
9. abuso de recursos/rate;
10. escalamiento de privilegios;
11. fuga entre usuarios/dispositivos;
12. cache de datos sensibles;
13. dependencia/supply-chain comprometida;
14. service worker obsoleto;
15. exportación de información sensible.

## Controles

- validación cliente para UX y validación autoritativa en servidor;
- contenido importado renderizado como texto escapado, no HTML confiable;
- CSP y headers de seguridad del anfitrión;
- cookies `HttpOnly/Secure/SameSite` cuando aplique;
- RLS y autorización por operación;
- rate limiting en endpoints públicos y costosos;
- HMAC SHA-256 de webhook Meta con comparación constante cuando el Bridge sea activado;
- IDs/fingerprints e idempotency keys para deduplicación;
- outbox con reintentos limitados y reconciliación;
- logs estructurados y auditoría;
- feature flags, shadow mode y kill switch para automatización;
- secrets solo en servidor/Vercel;
- lockfiles y escaneo de dependencias;
- backups/snapshots antes de cambios destructivos.

## Service worker

El SW de Control Hípico no cachea rutas `api`, `auth`, `session`, `license` o `webhook`. Navegación usa network-first y assets estáticos stale-while-revalidate. Cada release cambia versión de cache y elimina caches propios obsoletos.

## WhatsApp

La automatización no se activa directamente. Flujo requerido: entrada/webhook → normalización → dedupe → clasificación → **shadow mode** → reglas → confirmación → registro → respuesta autorizada. Debe existir intervención manual y kill switch.

## Pendiente de infraestructura

Configurar credenciales reales de Meta/Supabase en entornos server-side, cerrar RLS final, ejecutar pruebas E2E y revisar rate limits antes de abrir tráfico real. Hasta entonces el análisis WhatsApp de la PWA modernizada es local/manual y no envía mensajes.
