# ContaGest #97 — Branch Protection de `main`

## Estado actual

La API de GitHub todavía reporta `main.protected=false`. La política y el aplicador están versionados, pero la protección no existe hasta que un administrador la aplique realmente en GitHub.

## Aplicación estructural recomendada ahora

Mientras #134 siga sin asignar runners, aplicar sólo el perfil estructural:

```text
APLICAR-PROTECCION-MAIN.cmd
```

O desde terminal:

```bash
node scripts/github-main-protection-v97.mjs apply
node scripts/github-main-protection-v97.mjs verify
```

Este perfil exige PR, aplica también a admins, requiere conversaciones resueltas y bloquea force-push/delete. No convierte un check roto por infraestructura en required check.

## Perfil full después de recuperar #134

Sólo cuando Runner Probe + ContaGest CI hayan demostrado steps reales:

```powershell
.\scripts\apply-main-protection-v97.ps1 -Full -Issue134Recovered
```

El guard evita activar `ContaGest CI / validate` como required mientras #134 no esté expresamente recuperado.

## Evidencia

`apply`, `verify` y `snapshot` generan:

```text
artifacts/qa/release-governance-v97/<sha>/protection-evidence.json
artifacts/qa/release-governance-v97/<sha>/SHA256SUMS.txt
```

La evidencia registra:

- `branchProtected`;
- PR required;
- enforce admins;
- conversation resolution;
- force push/delete;
- required checks;
- profile structural/full;
- candidate SHA;
- estado previo cuando se usa `apply`.

Nunca guarda tokens.

## Pruebas de gobernanza después de aplicar

1. Confirmar por API que `protected=true`.
2. Intentar push ordinario directo a `main` desde una rama de prueba: debe rechazarse.
3. Intentar force-push/delete: deben rechazarse.
4. Integrar mediante PR conforme al perfil activo.
5. Una vez #134 esté estable, verificar que un required check fallido impide merge.
6. Conservar un break-glass excepcional según `ops/github/main-release-governance-v97.json`; nunca dejar `main` desprotegida como solución permanente.

## Por qué ChatGPT no puede aplicar el setting desde esta sesión

El conector GitHub disponible aquí permite leer Branch Protection, archivos, issues y PRs, pero no expone una acción de escritura para rulesets/branch protection. El script usa la API oficial a través de una sesión `gh` ya autenticada con permisos admin en la máquina del propietario.
