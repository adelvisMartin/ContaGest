# #662 — Índice de evidencias exact-SHA

Autoridad: `AGENTS.md`, #623, #624, #630 y #647. Es un registro de referencias: no ejecuta pruebas ni autoriza despliegues.

El inventario versionado `config/evidence-index-v662-inventory.json` parte de una consulta de issues abiertos en GitHub (14 de octubre de 2026) y de referencias del META #624. Una referencia de META no equivale necesariamente a un issue dependiente: se conserva en `unresolvedParentReferences` hasta verificarla. El inventario envejece cuando cambia GitHub; hay que actualizarlo contra el estado live antes de certificar completitud.

## Ejecución local

```bash
SHA="$(git rev-parse HEAD)"
node --test tests/evidence_index_issue_662.test.mjs
node scripts/evidence-index-v662.mjs generate config/evidence-index-v662-inventory.json "$SHA" "artifacts/qa/evidence-index/$SHA/index.json"
node scripts/evidence-index-v662.mjs validate "artifacts/qa/evidence-index/$SHA/index.json" "$SHA" config/evidence-index-v662-inventory.json
node scripts/evidence-index-v662.mjs rc-input "artifacts/qa/evidence-index/$SHA/index.json" "$SHA" config/evidence-index-v662-inventory.json
```

`validate` PASS indica solo integridad estructural y SHA coherente, **no** que los issues están implementados. La generación inicia cada issue como `NOT_EXECUTED` con razón explícita. `rc-input` es el adaptador de entrada a #647: retorna `NO_GO` por diseño. El release gate debe incorporar la evaluación con sus propios tests/DB/browser/seguridad y nunca inferir `PRODUCTION_VERIFIED` de este manifest.

Estados: PASS, FAIL, BLOCKED, NOT_EXECUTED, NOT_APPLICABLE. Dimensiones: SOURCE_REVIEW, LOCAL_STATIC, LOCAL_UNIT, LOCAL_INTEGRATION, LOCAL_POSTGRES, LOCAL_BUILD, LOCAL_BROWSER_E2E, REMOTE_CI, REMOTE_DEPLOY, PHYSICAL_EXTERNAL.

Para declarar una entrada PASS se exigen issue CLOSED, criterios completados, PR/merge SHA, y evidencia PASS del SHA candidato con comando, entorno y ruta a artifact. **El validador comprueba formato, no la existencia o veracidad externa de un archivo referenciado:** hace falta revisar los artifacts y los logs originales. Evidencia antigua de otros SHA no se hereda silenciosamente. BLOCKED necesita causa explícita; no se convierte en PASS.

#661 es propietario de reconciliar duplicados/históricos; #666 de integridad documental; #647 del veredicto RC. Este índice no cierra esas autoridades.
