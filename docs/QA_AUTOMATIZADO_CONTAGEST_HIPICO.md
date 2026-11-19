# QA automatizado · ContaGest y Control Hípico

Ambos productos están en un monorepo y usan gates diferenciados. No se declara PASS sin comando ejecutado, SHA exacto y artefactos.

| Área | ContaGest | Control Hípico |
| --- | --- | --- |
| Lint, tipos, contratos y build | `ci.yml`, `pr-quality-gate-v1.yml` | CI compartido y `hipico-qa-foundation-v103.yml` |
| PostgreSQL real efímero | PR quality con postgres:16, seed, migraciones y tests reales | workflows especializados de RLS, DB, outbox y restore |
| Chromium/Playwright PR | `qa-browser.yml`, quality gate (flujos, WCAG, contraste) | `hipico-qa-foundation-v103.yml` |
| Firefox/WebKit | `erp-cross-browser-v6375.yml` en PR afectado y nightly | `hipico-browser-matrix.yml` en PR afectado y nightly (Chromium, Firefox, WebKit) |
| PWA / Android / LAB | PWA, seguridad y regresión UI | `hipico-android-rc.yml`, `hipico-production-gates-v290.yml` y QA LAB |
| Skills | `npm run test:skills:ui`, `npm run skills:check` | mismas reglas de Hallmark y Motion |

Hípico hace checkout del SHA de la cabeza del PR (no del pseudo-merge), ejecuta los tres navegadores con `fail-fast: false` y sube resultados por navegador.

## Ejecución local desde la raíz

```bash
npm ci --no-audit --no-fund
npm run skills:check
npm run test:skills:ui
npm run lint
npm run typecheck
npm run test:hipico
npm test
npm run build
npm run test:browser
npx playwright test --config=playwright.hipico-matrix.config.mjs --project=chromium --workers=1
npx playwright test --config=playwright.hipico-matrix.config.mjs --project=firefox --workers=1
npx playwright test --config=playwright.hipico-matrix.config.mjs --project=webkit --workers=1
```

Este repo usa npm workspaces con `package-lock.json`. Los tests de persistencia requieren PostgreSQL **efímero aislado**, `ops/database/prepare-supabase-ephemeral.sql`, migraciones/seed y fixtures propias. No usar bases compartidas ni producción.

## Disponibilidad de skills

Las rutas versionadas son `.agents/skills/contagest-hallmark/SKILL.md` y `.agents/skills/contagest-motion/SKILL.md`. `npm run skills:sync` materializa documentos externos fijados por SHA en `.agents/vendor/`, ignorado por Git. `skills:check` sin ese caché sólo valida pins y política, **no la descarga**. Las fuentes externas son asesoras, no ejecutables.

```bash
node scripts/agent-gate-router.mjs --files frontend/src/app.js --type audit --intent hallmark-audit
node scripts/agent-gate-router.mjs --files frontend/src/app.js --type audit --intent motion-review
```

P0/P1 conserva siempre sus skills obligatorias. Un build/render tampoco sustituye un recorrido real UI→cliente→API→persistencia→UI, con RBAC, loading/empty/error, accesibilidad, foco y reduced motion. QA física Android/WhatsApp SOURCE, soak 24–72 horas, hosting externo y restores reales siguen siendo gates independientes.
