# Seguridad — Hípico Control

## Fronteras
- Frontend: publishable key solamente; nunca Service Role, Meta App Secret o access token.
- Vercel Functions: secretos server-side y verificación de firma de webhook.
- Supabase: RLS por `owner_id`; Service Role solo en backend controlado.
- IndexedDB: persistencia offline; los respaldos exportados deben tratarse como información operativa sensible.

## Controles
- HMAC SHA-256 del webhook Meta con comparación constante.
- Fingerprints/IDs únicos para deduplicación.
- Outbox idempotente con reintentos limitados.
- Ledger append/reversal, no edición destructiva del historial financiero.
- CSP y HTTPS del proyecto anfitrión.
- Rate limiting/WAF se agrega al endpoint antes de abrirlo públicamente a tráfico no controlado.

## Pendiente de infraestructura
Activar la configuración Meta, cargar secretos en Vercel y ejecutar prueba end-to-end con un número de negocio real antes de activar envío automático.
