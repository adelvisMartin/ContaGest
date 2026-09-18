# ContaGest · Baseline técnico congelado 1/51

## Autoridad

- Repositorio: `adelvisMartin/ContaGest`
- Rama: `main`
- SHA solicitado originalmente para la auditoría: `ab02c550f24c3347121d8c74c636b450245036ac`
- SHA real de `main` al iniciar 1/51: `9566d77ad51e6eccc51d95fa76c65487a1b08821`
- Manifiesto machine-readable: `docs/baselines/contagest-technical-baseline-v1.json`

El SHA `ab02c550` queda registrado porque fue la referencia explícita de la auditoría anterior, pero **no se finge que continúa siendo HEAD**. Antes de empezar 1/51 se fusionaron #365 y #367; por eso el snapshot técnico ejecutable se congela sobre `9566d77a`.

## Qué queda congelado

El manifiesto registra y el gate verifica:

1. las 58 rutas canónicas de `frontend/src/data/pageRegistry.js`;
2. los bounded contexts y esquemas Zod de Health, Gym, Communications, Veterinary y extensiones;
3. las migraciones/tablas verticales de Salud/Veterinaria/Fitness;
4. los endpoints verticales preservando su archivo propietario y mount point;
5. los owners frontend de Odontología, Veterinaria y Gimnasio/Nutrición/Rutinas;
6. el inventario de tests/Playwright relevante;
7. el estado CI observado y su clasificación de evidencia.

## Regla de SHA para 2/51 en adelante

El baseline **no obliga a que el código futuro siga en el mismo commit**; eso haría imposible implementar.

Obliga a que cada evidencia posterior declare:

```json
{
  "baselineSha": "9566d77ad51e6eccc51d95fa76c65487a1b08821",
  "candidateSha": "<SHA exacto del cambio>",
  "testedSha": "<mismo SHA exacto del cambio>"
}
```

Una implementación no se considera validada cuando:

- `baselineSha` no es el baseline congelado vigente;
- `candidateSha !== testedSha`;
- se reutilizan resultados de un SHA anterior;
- un workflow falla antes de ejecutar steps y se presenta como PASS.

El verificador acepta opcionalmente `--evidence <archivo.json>` para aplicar esa regla.

## Estado CI congelado

### main `9566d77a`

- GitHub Actions sobre el merge SHA: **NOT_EXECUTED** por la política actual del workflow principal (`pull_request` + `workflow_dispatch`, sin `push`).
- Vercel: **FAIL** en el estado combinado observado.

### candidato de arquitectura PR #367 · `ff53aaf5`

Los jobs observados de CI, Browser QA, PR Quality Gate, PostgreSQL, WCAG y security terminaron `failure` con `steps=null`.

Clasificación correcta:

```text
BLOCKED_INFRASTRUCTURE_PRE_STEPS
```

No se atribuyen esos fallos al código y tampoco se declaran PASS.

## Cobertura conocida

Existe cobertura contractual del route registry, manifiesto backend y bounded contexts, además de Playwright general y una suite veterinaria. En este baseline **no existe todavía evidencia E2E completa de CRUD + refresh + persistencia + permisos + tenant isolation para Odontología y Gimnasio**. Ese gap queda explícito para las implementaciones posteriores.

## Uso

```bash
npm run baseline:verify
npm run baseline:verify -- --evidence artifacts/evidence.json
```

El CI ejecuta el primer comando antes del gate de arquitectura.

## Scope

1/51 no cambia reglas clínicas, rutinas, nutrición, UX ni persistencia. Sólo crea una autoridad técnica reproducible para que 2/51–51/51 no puedan apoyarse en inventarios o SHAs ambiguos.
