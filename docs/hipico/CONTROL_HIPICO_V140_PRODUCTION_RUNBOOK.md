# Control Hípico v1.4.0 — runbook de producción

## Objetivo y límite operativo

La versión 1.4.0 conecta el grupo oficial `CLUB HIPICO TRIPLE COWN/CROWN` con
la persistencia shadow de ContaGest y con `Control hípico lab`. El grupo
oficial es solo lectura. Ninguna clasificación crea, confirma o anula jugadas,
modifica saldos, publica resultados ni escribe el ledger.

El material observado alimenta un dataset shadow auditable. “Adiestrar” significa
evaluar ejemplos, entidades y discrepancias con revisión humana; no significa
aprendizaje online ni promoción automática de reglas.

## Flujo

`WhatsApp Web oficial → captura idempotente → spool local durable → API autenticada
→ transporte/canónico shadow → evaluación → mirror LAB`

Si la API falla, la captura se conserva en spool. Si el LAB falla, su mirror
permanece en una cola independiente. Un fallo de un destino no habilita escritura
en la fuente.

## Refactor por módulo

| Módulo | Responsabilidad | Invariante |
| --- | --- | --- |
| `runtime-config.mjs` | carga, normaliza y valida entorno | producción no admite token corto, HTTP ni backend desactivado |
| `runtime-utils.mjs` | normalización, fechas, backoff y clasificador local | funciones puras cubiertas por tests |
| `health-state.mjs` | deriva `ready/degraded/blocked` | pendientes y dead letters impiden declarar listo |
| `preflight.mjs` | valida backend antes de abrir WhatsApp | exige shadow, persistencia lista y fuente sin envío |
| `index.mjs` | orquesta navegador, captura y entrega | fuente read-only; persistir antes de marcar visto; diagnósticos sin contenido de chats |
| `report.mjs` | métricas de dataset | no imprime muestras ni remitentes por defecto |
| `hipico-bridge-security.ts` | secreto compartido en tiempo constante | mínimo 32 caracteres y sin fallback permisivo |
| `hipico-bridge.routes.ts` | health e ingestión HTTP | auth, canales permitidos, `actions: []` |
| `hipico-bridge-transport.store.ts` | transporte y outbox compatible | PostgreSQL obligatorio, dedupe persistente |
| `hipico-canonical-shadow.store.ts` | mensaje/evento/evaluación canónica | solo shadow/pending; LAB único |
| launcher PowerShell | runtime, DPAPI, UTF-8 y navegador | sin administrador, sin portapapeles y sin borrar colas |
| `package.json` / lockfiles | dependencias reproducibles | overrides auditados para `deepmerge-ts` y `uuid`; auditoría productiva en cero |

## Evidencia local de esta rama

- `npm run ci`: typecheck, 195 contratos, tests backend, builds y presupuesto de bundle aprobados;
- Bridge: 18 tests, sintaxis, selftest Playwright/Chrome y launcher PowerShell aprobados;
- `npm audit --omit=dev --audit-level=high`: cero vulnerabilidades en el monorepo y en el Bridge;
- Prisma 6.19.3 validó el schema con `deepmerge-ts` 8.0.1 y el smoke de ExcelJS pasó con `uuid` 11.1.1;
- navegador local en 1280 px y 390 px: ContaGest y Control Hípico sin overflow horizontal ni errores de consola.

Esta evidencia valida la rama, no el despliegue. La declaración operativa final
requiere completar los gates de despliegue y aceptación descritos abajo.

## Despliegue

1. Ejecutar tests, typecheck, build, bundle y auditoría de seguridad.
2. Publicar la rama y revisar el diff; no mezclar mientras fallen gates.
3. Fusionar mediante PR aprobado.
4. Confirmar que `/api/health` devuelve el SHA de `main`.
5. Confirmar que el mismo SHA aparece en el despliegue Vercel.
6. Ejecutar el launcher v1.4.0. Este reutiliza el token DPAPI y exige
   `/api/v1/hipico-bot/bridge/health ready=true`.
7. Verificar `health.json`: fuente correcta, backend `online`, spools y
   dead letters en cero.
8. Inyectar mensajes sintéticos en LAB y luego observar mensajes nuevos del
   grupo real; nunca reprocesar historia visible.

## Criterios de aceptación

- 100% del corpus QA clasificado y persistido sin efectos monetarios.
- reinicio con continuidad de IDs vistos y colas;
- un evento repetido no crea duplicados;
- LAB recibe exactamente una respuesta por tag;
- consola y red sin errores inesperados;
- escritorio y móvil sin overflow ni controles inaccesibles;
- `sourceSendPossible=false`, `actions=[]` y operación canónica `pending`;
- backup/restore probado antes de habilitar tráfico sostenido.

## Rollback

Si falla backend o despliegue, no se borra el runtime ni sus datos: se detiene el
Bridge con Ctrl+C, se revierte el despliegue/commit aprobado y se reinicia cuando
el health vuelva a estar listo. Los eventos pendientes se reenvían desde spool.
No eliminar `%LOCALAPPDATA%\ControlHipicoBridge\data`.

Si falla exclusivamente el perfil de WhatsApp, ejecutar
`REINICIAR-WHATSAPP-WEB.cmd`: mueve el perfil a cuarentena y conserva token,
journal, logs, IDs y colas.
