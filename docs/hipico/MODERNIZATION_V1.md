# Control Hípico · Modernización v1

## Mandato

**Misma operación hípica. Mejor ingeniería. Mejor experiencia.**

Control Hípico permanece como producto independiente. ContaGest-VE sirve como referencia de disciplina técnica; no se importan reglas contables ni se cambia la semántica hípica.

## Entregado en esta fase

- identidad visible **CONTROL HÍPICO** y matriz SVG derivada del arte de caballo suministrado;
- shell `Precision Hípica` mobile-first con Light, Dark y System;
- navegación móvil inferior, drawer, sidebar desktop y `Ctrl/Cmd + K`;
- módulos visibles: Resumen, Captura, Participantes, Chat WhatsApp, Adelantadas, Historial, Cierres y saldos, POLLA y Configuración;
- IndexedDB versionado para operaciones, participantes, outbox, snapshots y settings;
- captura local que escribe operación + outbox con `idempotencyKey`;
- estado Offline/Pendiente/Local listo visible;
- análisis manual de WhatsApp reutilizando los parsers operativos existentes, sin envío automático;
- PWA propia: manifest, service worker versionado, iconos `any` y `maskable`, shortcuts y actualización controlada;
- service worker que no cachea rutas sensibles de API/auth/session/license/webhook;
- respaldo JSON local sin secretos;
- tests estáticos de identidad, módulos, PWA, seguridad de cache, IndexedDB y design tokens.

## Contrato protegido

La modernización no elimina ni reinterpreta Resumen, Captura, Participantes, Chat WhatsApp, Adelantadas, Historial, Cierres y saldos, POLLA ni Configuración. La persistencia local, operación offline, sincronización futura, outbox, deduplicación, snapshots y Bridge siguen siendo capacidades del producto.

## Arquitectura objetivo

1. **Presentación:** shell, páginas, componentes, feedback, accesibilidad, responsive.
2. **Dominio:** participantes, jornadas, carreras, jugadas, saldos, cierres, resultados, adelantadas y POLLA sin dependencia de React/Vercel/Supabase/WhatsApp.
3. **Aplicación:** casos de uso y orquestación.
4. **Persistencia local:** IndexedDB y migraciones.
5. **Sincronización:** outbox, backoff, idempotencia, dedupe, reconciliación y estados observables.
6. **Backend/cloud:** autenticación, operaciones privilegiadas, webhooks, auditoría y sincronización remota.
7. **Integraciones:** adaptadores independientes para WhatsApp/Bridge, Supabase, exportaciones y proveedores futuros.

## Fases que siguen abiertas

Esta fase no declara terminadas tareas que requieren infraestructura externa o caracterización completa del negocio histórico:

- extracción total del dominio histórico y POLLA hacia módulos por capa;
- migración/upgrade de todos los datos históricos al nuevo IndexedDB con pruebas downgrade/rollback;
- sincronización cloud real con RLS y reconciliación multi-dispositivo;
- WhatsApp Business Platform/Bridge real: webhook, firma, colas, retry/backoff, dead-letter lógico, shadow mode medido, kill switch y feature flag;
- observabilidad remota completa y SLOs;
- Playwright real en 360/480/768/1024/1280+, accesibilidad WCAG 2.2 AA y pruebas de PWA instalada;
- separación física a repositorio/proyecto Vercel propio cuando se decida realizar el desacoplamiento.

## Definition of Done de una fase

Una fase solo puede marcarse completa cuando: build reproducible; no hay secretos en frontend; no existe identidad histórica anterior en el build activo; flujos funcionales caracterizados mantienen resultados; responsive no presenta overflow accidental; offline conserva datos; service worker puede actualizar/rollback; tests relevantes se ejecutan realmente; existe commit/PR trazable; rollback documentado; y producción corresponde al SHA aprobado.

## Rollback

Cada incremento se mantiene en commits separados. El shell anterior de Control Hípico permanece recuperable desde Git. Ninguna migración destructiva de datos debe ejecutarse sin exportación/snapshot previo y una ruta de reversión explícita.
