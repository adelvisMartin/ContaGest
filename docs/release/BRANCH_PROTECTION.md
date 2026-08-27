# ContaGest VE — protección de `main` y release governance

Issue: #97

## Objetivo

La integración ordinaria a `main` debe ocurrir únicamente mediante Pull Request y evidencia verificable. Force-push y borrado de `main` permanecen bloqueados. Las excepciones no convierten checks no ejecutados en PASS y deben dejar evidencia posterior.

## Estado deseado

La configuración estructural canónica está declarada en:

```text
ops/github/main-branch-protection-v97.json
ops/github/main-release-governance-v97.json
```

Fase A, aplicable antes de promover checks inestables:

- Pull Request obligatorio;
- administradores sujetos a la protección normal;
- conversaciones resueltas;
- force-push bloqueado;
- delete bloqueado;
- sin bypass general de administradores;
- sin merge queue por ahora;
- GitHub approval count `0` en la regla estructural para no producir un deadlock en un repositorio de equipo pequeño; P0/P1 conserva revisión independiente obligatoria por `AGENTS.md` y debe evolucionar a approval machine-enforced cuando exista reviewer independiente disponible.

La regla estructural **no** convierte un check inestable en required.

## Required checks

La tabla se mantiene en `ops/github/main-release-governance-v97.json` y debe corresponder a nombres **observados realmente por GitHub**, no sólo al texto esperado leyendo YAML.

| Contexto | Estado inicial | Condición de promoción |
|---|---|---|
| `ContaGest CI / validate` | candidate/blockado | ejecuciones reales repetidas y confiables |
| `PostgreSQL / Migraciones + constraints v11.15` | candidate/blockado | reconstrucción PostgreSQL real estable por SHA |
| `ContaGest Browser QA / playwright` | informativo | disponibilidad suficientemente estable |
| `Accessibility WCAG22 / wcag22-aa` | pendiente #99 | #99 mergeado + ejecuciones reales estables |

### Hallazgo de nombre real del gate #28

`.github/workflows/postgres-tenant-rules-v28.yml` declara sin comillas:

```yaml
name: PostgreSQL #28 · reglas anti-tenant reales
```

En YAML, `#28 ...` se interpreta como comentario. Los workflow runs observados por GitHub se llaman realmente `PostgreSQL`, y el job se llama `Migraciones + constraints v11.15`. Por eso el contexto candidato correcto es:

```text
PostgreSQL / Migraciones + constraints v11.15
```

No se usa el nombre histórico documentado por el PR #130 porque sería un required check inexistente, uno de los casos negativos explícitos de #97.

### Política de promoción

Un contexto puede pasar a `required` sólo si:

1. existe realmente en GitHub;
2. se ejecutó sobre candidate SHAs recientes;
3. PASS significa que el job tuvo steps reales;
4. no depende de un runner históricamente indisponible sin procedimiento `BLOCKED`;
5. el tiempo de ejecución es compatible con el flujo de PR;
6. su fallo representa un riesgo que debe bloquear `main`.

`steps: []`, `runner_id: 0`, outage de GitHub Actions, rate-limit externo o un job que nunca arrancó = `BLOCKED/NOT_EXECUTED`, nunca PASS.

## Aplicación de la regla

El payload para Branch Protection REST es:

```text
ops/github/main-branch-protection-v97.json
```

Con una sesión GitHub que tenga permisos administrativos y un plan que permita proteger ramas privadas, la operación equivalente es:

```bash
gh api \
  --method PUT \
  repos/adelvisMartin/ContaGest/branches/main/protection \
  --input ops/github/main-branch-protection-v97.json
```

Después se ejecuta el verificador live:

```bash
GITHUB_TOKEN=... node scripts/verify-main-protection-v97.mjs
```

No versionar ni imprimir el token.

## Verificación obligatoria

El workflow `.github/workflows/release-governance-v97.yml` separa:

- `governance-contract`: valida documentación/payload/nombres y no requiere cambiar settings;
- `live-main-protection`: sólo `workflow_dispatch`, consulta GitHub y produce un snapshot asociado al SHA.

El reporte vive en:

```text
artifacts/release/governance-v97.json
```

Estados permitidos:

- `PASS`: protección live leída y todas las reglas estructurales mínimas presentes;
- `FAIL`: GitHub respondió y la protección está ausente/incompleta;
- `BLOCKED`: GitHub no permitió inspeccionar la regla o infraestructura impidió la verificación;
- `NOT_EXECUTED`: no se ejecutó la consulta live.

## Governance test

Después de activar la protección en GitHub, usar una rama efímera y un PR de prueba. No usar `main` como laboratorio destructivo.

### Push directo

Intentar un push ordinario a `main` desde una credencial sin break-glass. Esperado: rechazado.

### Force push

Intentar únicamente contra una referencia/commit de prueba que no introduzca datos sensibles. Esperado: rechazado por la protección. No forzar `main` para “probar que falla” si la plataforma permite determinar el rechazo mediante dry-run/UI/API.

### Delete

No borrar realmente `main`. Verificar la regla `allow_deletions=false` por API/configuración y, si la plataforma ofrece una simulación segura, usarla. La evidencia de configuración es preferible a una acción destructiva.

### Required check

Cuando exista al menos un required check estable:

1. abrir PR de prueba;
2. provocar un fallo controlado únicamente en la rama de prueba;
3. confirmar que GitHub bloquea merge;
4. corregir el fallo;
5. confirmar PASS real y mergeability;
6. cerrar/eliminar la rama de prueba si no corresponde mergearla.

No introducir un nombre de check inexistente para simular bloqueo.

## P0/P1 independent review

`AGENTS.md` exige que el autor de un cambio P0/P1 no lo apruebe solo. Mientras el repositorio no tenga capacidad real para exigir un approval independiente sin deadlock:

- la regla de GitHub requiere PR pero no fuerza un número ficticio de approvals;
- el PR P0/P1 conserva evidencia de revisión independiente (humana o reviewer autorizado distinto del implementador cuando esté disponible);
- cuando exista al menos un reviewer independiente estable, elevar `required_approving_review_count` a `1` en un PR separado de governance y validar que el owner no quede bloqueado permanentemente.

No falsear independencia aprobándose a sí mismo desde la misma identidad.

## Break-glass

Principal autorizado por esta política:

```text
repository-owner: adelvisMartin
```

No existe bypass permanente para “todos los administradores”. El break-glass es un procedimiento excepcional, no una ruta normal de merge.

### Motivos aceptados

- outage real de GitHub Actions/runner;
- incidente GitHub que impide checks;
- recuperación crítica de producción donde esperar el runner aumenta el daño.

### Antes de usarlo

Registrar en issue/PR/incidente:

- actor;
- motivo codificado;
- candidate SHA;
- PR;
- checks ejecutados;
- checks `BLOCKED/NOT_EXECUTED`;
- riesgo de no esperar;
- rollback.

### Durante

- mantener PR como unidad de cambio;
- modificar sólo la regla mínima necesaria;
- **nunca** habilitar force-push ni delete;
- no desactivar CI dentro del código;
- no cambiar un resultado `BLOCKED` a PASS;
- conservar el SHA exacto integrado.

### Después

- restaurar inmediatamente la protección canónica;
- ejecutar `verify-main-protection-v97.mjs`;
- adjuntar snapshot del ruleset/branch protection;
- ejecutar checks pendientes cuando vuelva la infraestructura;
- revisión independiente post-evento para P0/P1 si fue imposible antes;
- documentar merge SHA, actor y duración de la excepción.

## Outage de runner

Si Actions crea un job pero no asigna runner (`steps: []`/`runner_id: 0`):

1. clasificar el check como `BLOCKED`;
2. reintentar una vez si existe evidencia de recuperación;
3. no hacer loops de rerun para fabricar verde;
4. no eliminar el check de la política estable de forma improvisada;
5. si el cambio no es urgente, esperar a infraestructura sana;
6. si es emergencia real, aplicar break-glass con evidencia y restauración.

## Rollback de una configuración incorrecta

Una regla demasiado estricta no se resuelve dejando `main` abierta.

1. conservar el snapshot live previo;
2. identificar la regla que causa el deadlock;
3. aplicar temporalmente la última configuración conocida funcional;
4. verificar `protected=true`, force-push/delete bloqueados y PR obligatorio;
5. corregir el payload declarativo mediante PR;
6. volver a aplicar y verificar;
7. adjuntar ambos snapshots al incidente.

## Limitación de plataforma

Si GitHub responde que el plan actual no permite rulesets/branch protection para este repositorio privado, #97 queda `BLOCKED` en su criterio de activación. Hacer el repositorio público o cambiar de plan es una decisión de cuenta/producto y **no** debe ejecutarse silenciosamente como parte de este ticket.

La documentación/configuración versionada sigue siendo útil, pero no equivale a `main protected=true`.
