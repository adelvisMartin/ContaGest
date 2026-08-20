# Matriz QA de la rama

Fecha: 2026-08-20  
Rama: `feat/production-readiness-ui-qa`

## Checks automatizados

| Área | Comando/alcance | Estado | Nota |
|---|---|---|---|
| Instalación | `npm ci` | PASS | Instalación limpia; npm reporta 5 vulnerabilidades |
| Backend types | `npm run typecheck` | PASS | Corregido el tipo de `rawBody` en `backend/src/app.ts` |
| Build | `npm run build` | PASS | Frontend y backend compilan |
| Bundle | `npm run check:bundle` | PASS | 87 chunks; máximo 506.6 KiB; total 1.83 MiB |
| Seguridad estática | `node scripts/security-audit.mjs` | PASS | Sin secretos obvios detectados |
| Skills | `npm run skills:check` | PASS | Fuentes pinned verificadas |
| Suite Node posterior | `npm test` | FAIL | 182/194 PASS; 12 contratos históricos/compatibilidad permanecen abiertos |
| Lint | `npm run lint` | FAIL/pendiente de repetir | El baseline se detuvo por typecheck; la suite aún no estaba verde |
| Auditoría producción | `npm run audit:prod` | FAIL | Vulnerabilidades de dependencias |
| Sync de skills | `npm run skills:sync` | BLOCKED | Pin `emil-motion` devuelve 404 |
| Browser QA | Navegador integrado contra Vite local | BLOCKED | `ERR_BLOCKED_BY_CLIENT` al abrir `localhost:8080` y `127.0.0.1:8080`; Vite sí inició correctamente |

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
| Hipico | Pendiente runtime/shadow | Puente de grupos, offline, PWA | Pendiente browser | NOT EXECUTED |

## Criterio de salida

La rama no puede pasar a release candidate hasta que la suite de contratos sea verde o cada contrato fallido tenga una decisión documentada (actualizar test, corregir producto o retirar contrato), las dependencias high estén resueltas y la matriz runtime incluya evidencia de dos tenants y roles mínimo/administrador.
