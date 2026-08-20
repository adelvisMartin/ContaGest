# Auditoría de seguridad de la rama de producción

Fecha: 2026-08-20  
Rama: `feat/production-readiness-ui-qa`

## Resumen ejecutivo

El escáner de secretos y controles locales queda en PASS después de corregir dos falsos positivos del propio detector. La auditoría de dependencias queda en FAIL por cinco vulnerabilidades reportadas por npm (2 moderate, 3 high). No se ejecutó `npm audit fix --force`: la recomendación implica saltos breaking de Prisma y ExcelJS y requiere una decisión separada.

## Checks ejecutados

| Check | Resultado | Evidencia |
|---|---|---|
| `node scripts/security-audit.mjs` | PASS | No detecta secretos obvios; `.env` está ignorado; controles esperados presentes |
| `npm audit --omit=dev --audit-level=high` | FAIL | 5 vulnerabilidades: 2 moderate y 3 high |
| `npm run skills:check` | PASS | 5 fuentes pinned verificadas |
| `npm run skills:sync` | BLOCKED | Una fuente pinned responde 404: `emil-motion:skills/emil-design-eng/ANIMATION-VOCABULARY.md` |
| Browser/RBAC/tenant runtime | NOT EXECUTED | Requiere levantar servicios y fixture autenticado |

## Hallazgos y acciones

### SEC-001 — Vulnerabilidades de dependencias

- Severidad: HIGH; bloqueador de release.
- Alcance: `package-lock.json`, dependencias de producción transitivas de Prisma y ExcelJS.
- Precondición de abuso: instalar/ejecutar una versión vulnerable en un entorno expuesto a entradas o payloads que alcancen los paquetes afectados.
- Evidencia: `npm audit --omit=dev --audit-level=high` reporta `deepmerge-ts` vía Prisma y `uuid` vía ExcelJS.
- Acción propuesta: actualizar cada cadena de dependencia con pruebas de compatibilidad, revisar changelogs y regenerar lockfile; no aceptar `--force` sin revisión de breaking changes.
- Regresión requerida: typecheck, suite backend, migraciones sobre base efímera, build y smoke tests de importación/exportación.

### SEC-002 — Cobertura runtime multi-tenant incompleta

- Severidad: HIGH; bloqueador de release hasta tener evidencia.
- Alcance: rutas backend, Prisma, RBAC/licencias y módulos financieros.
- Precondición de abuso: usuario autenticado con identificadores de otra empresa y una ruta que no aplique el filtro/permiso de forma consistente.
- Evidencia: los checks estáticos pasan, pero la matriz de tenant isolation y autorización no se ejecutó de extremo a extremo.
- Acción propuesta: fixtures de dos tenants, pruebas negativas por módulo y verificación de que `tenantId` de request no puede elevar autoridad.
- Regresión requerida: ventas, compras, inventario, contabilidad, nómina, fiscal, reportes y módulos verticales.

### SEC-003 — Control de secretos frontend/backend

- Severidad: MEDIUM; revisar antes de release.
- Alcance: `scripts/security-audit.mjs`, configuración env y servicios frontend.
- Precondición de abuso: exponer un valor server-only en bundle o commit.
- Evidencia: el detector inicial confundía el nombre documentado `JWT_SECRET` con un literal JWT y marcaba nombres de variables documentados en servicios frontend. Se ajustó el detector para distinguir acceso real a `import.meta.env`/`process.env` y límites de token.
- Acción propuesta: mantener escaneo en CI y revisar manualmente cualquier nuevo secreto; nunca silenciar una detección sin evidencia.
- Regresión requerida: `node scripts/security-audit.mjs`, revisión del bundle y prueba de que las variables server-only no aparecen en `frontend/dist`.

### SEC-004 — Sincronización de skills pinned obsoleta

- Severidad: LOW para runtime; bloqueador de reproducibilidad del pipeline de agentes.
- Alcance: `agent-skills.lock.json` y `scripts/sync-agent-skills.mjs`.
- Precondición de abuso: ejecutar una fuente mutable/no verificada para completar el sync.
- Evidencia: una ruta pinned devuelve 404. La política local exige fuentes pinned y deshabilita el fallback unpinned.
- Acción propuesta: actualizar el pin/ruta después de validar la fuente oficial; no sustituirlo automáticamente por una fuente no fijada.
- Regresión requerida: `npm run skills:check` y luego `npm run skills:sync`.

## Veredicto

Seguridad estática: PASS. Release de producción: BLOCKED por dependencias vulnerables y por falta de pruebas runtime de tenant/RBAC. La rama conserva los riesgos para que puedan resolverse con evidencia, no con excepciones silenciosas.
