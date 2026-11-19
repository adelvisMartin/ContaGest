# #841 · Orquestador de cierre de backlog y PR — modo de diagnóstico en vivo

**Autoridad:** `AGENTS.md` → Agent System v3 → skills de dominio/release → tickets existentes. **No** instala otro agente ni una segunda autoridad de decisiones. Fecha de auditoría: 2026-11-18; el SHA de `main` que se consulta al ejecutar siempre reemplaza cualquier fotografía de este documento.

## Uso
```bash
node scripts/agent-ticket-router.mjs closeout --repo adelvisMartin/ContaGest
node scripts/agent-ticket-router.mjs closeout --repo adelvisMartin/ContaGest --strict
node scripts/agent-ticket-router.mjs gates --base main --type audit
node scripts/verify-agent-system-v3.mjs
node --test tests/agent_backlog_closeout_v1.test.mjs tests/agent_context_plane_v2_contract.test.mjs
```

El primer comando lee **todos** los issues y PR abiertos mediante paginación GitHub, obtiene el SHA actual de la rama principal, `mergeable_state`, checks asociados al SHA exacto del head y contextos requeridos de la protección de rama cuando sean accesibles. Revalida que `main` y los heads de PR no se movieron mientras recolectaba datos. No necesita descargar código ni datos privados de clientes; `GITHUB_TOKEN` se obtiene del entorno y no se imprime. Si GitHub no está disponible, la lectura falla **cerrada**.

`--strict` retorna error mientras exista trabajo aceptado todavía abierto o PR bloqueados. Eso no significa que un simple conteo certifique producción: `HUMAN_REVIEW_REQUIRED` implica revisión y validación exact-SHA adicionales. Un conflicto resuelto es sólo integrabilidad; no es CI verde. Un PR fusionado es sólo estado de Git, no prueba de QA física o DoD.

## Estado de inventario observado

- GitHub informó **19 issues abiertos**. El rango organizativo solicitado es **17–20**, cumplido sin cierre administrativo ni requisitos eliminados.
- En el inicio de esta campaña había tres PR abiertos: #1341 contabilidad, #1343 rendimiento, #1345 catálogo. #1341 y #1343 eran `dirty` tras fusiones concurrentes. Fueron reconciliados por **commits de merge con dos padres** y actualización de ref fast-forward sin force; no se eliminó el test Gym #709 de la suite global.
- La cola `.agents/context/WORK_QUEUE.json` fue actualizada desde dueños históricos (#553 y #562...) a los 19 owners abiertos y `metaIssue=841`. Sigue siendo una **fotografía de navegación**, nunca una lista autoritativa de lo que se puede cerrar.
- Inventario de agentes y skills del SHA observado: **11 perfiles**, **27 skills de proyecto ACTIVE** y sus 27 contratos, **5 skills de ejecución**. El lock externo registra 18 fuentes con SHA completo y metadatos de licencia; ese inventario estructural **no** prueba que las fuentes remotas estén descargadas ni que ejecuten acciones.
- Se mantienen canales separados para ContaGest, Control Hípico, seguridad, contabilidad, compatibilidad de migraciones y proveedores. Los P0 de finalización #837/#839/#840/#841 no se cierran por tener su PR asociado fusionado.

## Merge/closure, reglas obligatorias

1. Obtener `HEAD` nuevo del PR y `main` vivo; detectar conflictos y cambios concurrentes. No forzar refs ni hacer squash para ocultar diferencias.
2. Ejecutar los gates de `agent-ticket-router.mjs gates`, `agent:system:verify`, regresiones unitarias, lint, typecheck, build, DB PostgreSQL 17 efímera y browsers/rutas según riesgo.
3. Inspeccionar jobs/logs/artifacts de **ese** SHA. `queued`, `skipped`, check en otro SHA, protección desconocida y `unstable` nunca cuentan como PASS. Repetir tras cualquier nuevo SHA.
4. Hacer revisión de seguridad, tenants A↔B, reversibilidad, linaje de auditoría y rollback. El dominio financiero y SOURCE WhatsApp mantienen controles independientes.
5. Fusionar serialmente sólo con checks aprobados, refrescar `main` y registrar SHA fusionado. Cerrar el issue sólo si **todos** sus criterios de aceptación y DoD (incluyendo QA física/soak cuando corresponda) tienen evidencia, o retener alcance pendiente en el owner adecuado.
6. Si un proveedor impide verificaciones, registrar `BLOCKED` con su URL de run/deployment; no cambiar checks, desactivar browsers ni publicar `DONE` ficticio.

## Validación de este incremento

- **VERIFIED local aislado:** Node 22.16, 6/6 tests de `evaluateBacklogCloseout`; sintaxis de scripts. Los blobs publicados coinciden con el contenido probado, pero el CLI de GitHub real solo estará verificado cuando corra el job del PR.
- **SOURCE REVIEW:** verificados los inventarios de roles/skills/lock; no se crean herramientas productivas ni dependencias.
- **PENDING:** live API integration de la versión publicada, `node scripts/verify-agent-system-v3.mjs` completo y el workflow `.github/workflows/agent-closeout-v841.yml` en GitHub Actions.
- **OUT OF SCOPE:** migrar/actualizar base productiva, autorizar despliegue, ejecutar QA física, reducir artificialmente 19 issues o cerrar la totalidad de las épicas en una ejecución.

**Rollback:** revertir el comando `closeout`, los dos módulos, tests, workflow, documentos y actualización de cola; no existen migraciones ni efectos sobre usuarios.
