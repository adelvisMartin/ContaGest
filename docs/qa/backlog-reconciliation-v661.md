# #661 — Reconciliación del backlog, ownership y ramas

El auditor `scripts/reconcile-backlog-v661.mjs` es **solo lectura**. Complementa AGENTS.md, #623, #624, #649, el ownership map #653 y el índice de evidencias #662. No realiza merges, no cierra issues ni borra ramas.

## Comandos exact-SHA

```bash
HEAD="$(git rev-parse HEAD)"
BASE="$(git merge-base origin/main HEAD)"
node --test tests/backlog_reconciliation_issue_661.test.mjs
node scripts/reconcile-backlog-v661.mjs config/backlog-reconciliation-v661-snapshot.json "$HEAD" "$BASE" "artifacts/qa/backlog-reconciliation/$HEAD/report.json"
```

`structuralValidation=PASS` **no implica** `allReconciled=true`. El reporte incluye issues sin PR confirmado, PRs sin vínculo inequívoco, dobles claims, duplicados candidatos y ramas potencialmente obsoletas que requieren revisión. El snapshot fue observado el 14 de octubre de 2026; debe refrescarse al cambiar el estado real de GitHub y al avanzar `main`. No se pueden asumir estados live de una instantánea antigua.

Para cerrar un issue ya implementado, comparar criterios con archivos y pruebas ejecutadas, identificar SHA exacto en main y verificar que no haya gaps materiales; entonces registrar evidencia en el issue y cerrar como completed. Para un duplicado, mostrar dos issues y el owner superior, dejar la referencia de supersession y cerrar duplicate/not_planned solo tras verificación. Los PR con `Agent-Claim-Mode: advisory` explícito (p.ej. PR #976) no reclaman un issue exclusivo; requieren evidencia de su declaración y revisión de colisiones de archivos antes del merge. Un PR sin issue y sin declaración advisory verificada permanece pendiente de asignación. Los PR activos se serializan al merge; no se pierden revisiones al aparecer ramas históricas. Una rama ahead=0/behind>0 no se borra sin comparar nuevamente con main y revisar consumidores/protecciones.

#661 queda abierto mientras `allReconciled=false`, incluso con un workflow de verificación exitoso. #647 no recibe un GO a través de este auditor.
