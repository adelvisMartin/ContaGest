# Auditoría de seguridad de la rama de producción

Fecha: 2026-08-20
Rama final: `feat/hipico-production-readiness-v140`

## Resumen ejecutivo

El escáner de secretos y controles locales queda en PASS. Las cinco vulnerabilidades inicialmente reportadas se corrigieron con overrides explícitos y pruebas de compatibilidad, sin aceptar el downgrade breaking sugerido por `npm audit fix --force`. La auditoría productiva final reporta cero vulnerabilidades.

## Checks ejecutados

| Check | Resultado | Evidencia |
|---|---|---|
| `node scripts/security-audit.mjs` | PASS | No detecta secretos obvios; `.env` está ignorado; controles esperados presentes |
| `npm audit --omit=dev --audit-level=high` | PASS | Cero vulnerabilidades en monorepo y Bridge |
| `npm run skills:check` | PASS | 5 fuentes pinned verificadas |
| `npm run skills:sync` | BLOCKED | Una fuente pinned responde 404: `emil-motion:skills/emil-design-eng/ANIMATION-VOCABULARY.md` |
| Browser smoke | PASS parcial | Login y PWA Hípico validados en desktop/móvil; RBAC/tenant autenticado requiere fixtures |

## Hallazgos y acciones

### SEC-001 — Vulnerabilidades de dependencias — RESUELTO

- Severidad original: HIGH.
- Alcance: `package-lock.json`, dependencias de producción transitivas de Prisma y ExcelJS.
- Precondición de abuso: instalar/ejecutar una versión vulnerable en un entorno expuesto a entradas o payloads que alcancen los paquetes afectados.
- Acción aplicada: override de `deepmerge-ts` a 8.0.1 y `uuid` a 11.1.1, con lockfile regenerado.
- Evidencia final: auditoría en cero, schema Prisma 6.19.3 válido, smoke ExcelJS con formato condicional, CI y build aprobados.
- Riesgo residual: mantener estos overrides bajo Dependabot/auditoría hasta que Prisma y ExcelJS actualicen sus rangos transitivos.

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

Seguridad estática y dependencias: PASS. Veredicto de rama: READY FOR QA. Release de producción sigue bloqueado hasta completar pruebas runtime de tenant/RBAC y los gates desplegados del Bridge; los riesgos pendientes quedan explícitos, no exceptuados.
