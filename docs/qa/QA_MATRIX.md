# Matriz QA de la rama

Fecha: 2026-08-20
Rama final: `feat/hipico-production-readiness-v140`

## Checks automatizados

| Área | Comando/alcance | Estado | Nota |
|---|---|---|---|
| Instalación | `npm ci` | PASS | Instalación limpia con lockfile reproducible |
| Backend types | `npm run typecheck` | PASS | Corregido el tipo de `rawBody` en `backend/src/app.ts` |
| Build | `npm run build` | PASS | Frontend y backend compilan |
| Bundle | `npm run check:bundle` | PASS | 87 chunks; máximo 506.6 KiB; total 1.83 MiB |
| Seguridad estática | `node scripts/security-audit.mjs` | PASS | Sin secretos obvios detectados |
| Skills | `npm run skills:check` | PASS | Fuentes pinned verificadas |
| Suite Node posterior | `npm test` | PASS | 195/195 contratos del repositorio; suite backend incluida |
| Lint | `npm run lint` | PASS | Typecheck y contratos aprobados |
| Auditoría producción | `npm run audit:prod` | PASS | Cero vulnerabilidades después de overrides compatibles y verificados |
| Sync de skills | `npm run skills:sync` | BLOCKED | Pin `emil-motion` devuelve 404 |
| Bridge v1.4 | `npm run check && npm test && npm run selftest` | PASS | 18 tests; Playwright 1.62.1/Chrome disponible |
| Browser QA | Navegador integrado contra Vite local | PASS parcial | Login ContaGest y PWA Hípico en 1280 px/390 px, sin overflow ni errores de consola; flujos autenticados no ejecutados |

## Matriz funcional pendiente

| Módulo | Tenant/RBAC | Flujos principales | Responsive/accessibility | Estado |
|---|---|---|---|---|
| Dashboard | Pendiente runtime | KPIs y navegación | Pendiente browser | NOT EXECUTED |
| Ventas/cotizaciones | Pendiente runtime | Documento, impuestos, cobro | Pendiente browser | NOT EXECUTED |
| Compras/proveedores | Pendiente runtime | Orden, recepción, pago | Pendiente browser | NOT EXECUTED |
| Inventario/kardex | Pendiente runtime | Existencias, ajustes, trazabilidad | Pendiente browser | NOT EXECUTED |
| Contabilidad/fiscal | Pendiente runtime | Asiento, cierre, libros, RIF | Pendiente browser | NOT EXECUTED |
| Reportes | Pendiente runtime | Filtros, exportación y precisión | Pendiente browser | NOT EXECUTED |
| Usuarios/RBAC/licencias | Pendiente runtime | Permisos, expiración, sesiones | Pendiente browser | NOT EXECUTED |
| Veterinaria | Pendiente runtime | Paciente, cita, historia | Pendiente browser | NOT EXECUTED |
| Gimnasio | Pendiente runtime | Cliente, membresía, entrada, coaching | Pendiente browser | NOT EXECUTED |
| Hipico | Contratos shadow PASS; despliegue pendiente | Puente, offline y PWA cubiertos; tráfico real pendiente | Desktop/móvil PASS | READY FOR QA |

## Criterio de salida

La rama está en `READY FOR QA`. No puede pasar a release candidate hasta que la matriz runtime incluya evidencia de dos tenants y roles mínimo/administrador, y el Bridge desplegado complete preflight, replay/idempotencia, colas en cero y prueba controlada con LAB/grupo real.
