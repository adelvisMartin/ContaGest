# Auditoría e incorporación de skills y agentes — 15 de octubre de 2026

## Inventario inicial verificado
En `main@cff24727bcb5bca1f0f585ad63562c7ea092dbe5` existían **20 directorios de skills** (18 `contagest-*` y 2 adaptadores, Graphify/React Doctor), **5 skills de ejecución** independientes del límite de rutas, **8 perfiles de agentes** y **11 fuentes externas con pin**. Se conservaron todos. El PR #997 incorpora REA por separado y continúa sin merge: este cambio no lo da por instalado.

## Archivos realmente incorporados
| Skills propias ACTIVE nuevas | Propósito |
|---|---|
| `contagest-simplicity-review` | Evitar complejidad y dependencias innecesarias; inspiración Ponytail |
| `contagest-code-review-quality` | Revisar corrección, legibilidad, arquitectura, seguridad y rendimiento |
| `contagest-api-contract-design` | Proteger contratos API, consumidores, errores e idempotencia multi-tenant |
| `contagest-ci-triage` | Diagnosticar CI desde jobs/logs y SHA exacto sin saltarse controles |
| `contagest-hipico-lab-operations` | LAB autorizado, SOURCE read-only, outbox/replay/recibos seguros |

**Agentes nuevos:** `integration-contracts`, `ci-triage`, `hipico-lab-operations`. Los 8 perfiles anteriores siguen existiendo. Estos agentes son **perfiles operativos para el orquestador**, no procesos persistentes ejecutándose solos.

Se corrigió `contagest-apple-design` agregando `Source of truth`, `Graphify probes`, `Inputs` e `Invariants`, que el verificador v2 del repositorio ya exigía.

## Fuentes externas admitidas con pin SHA, licencia MIT y allowlist
- [Addy Osmani agent-skills](https://github.com/addyosmani/agent-skills), commit `aeac41d4d005999432bb7312f7ff06383a91d59d`: `LICENSE` y `skills/api-and-interface-design/SKILL.md`, `skills/code-review-and-quality/SKILL.md`, `skills/ci-cd-and-automation/SKILL.md`.
- [Ponytail](https://github.com/DietrichGebert/ponytail), commit `84740e3d344b69b4a133201fa519eb37a62a2b2a`: `LICENSE` y `skills/ponytail/SKILL.md`.
- Todo lo externo queda **advisory** y la sincronización solo descarga archivos permitidos mediante `scripts/sync-agent-skills.mjs`, nunca hooks, instalaciones globales o ejecutores remotos.

**OmniRoute no se instaló:** es un gateway independiente que introduce servidor, configuración y credenciales; no resuelve una carencia justificada del router determinista v3. No confundir más módulos con mejor cobertura. Su incorporación necesitaría un ticket propio con una necesidad real de gateway.

## Comandos de activación y diagnóstico
```bash
npm run skills:check
npm run agent:system:verify
npm run agent:system:test
node --test tests/agent_skill_admissions_v1.test.mjs
node scripts/agent-gate-router.mjs --files backend/src/modules/api/contract.ts --type feature
node scripts/agent-gate-router.mjs --files tools/hipico-whatsapp-bridge/index.ts --type feature
node scripts/agent-gate-router.mjs --files frontend/src/components/ui/Button.tsx --type design --intent simplicity-review
```

Descarga opt-in de material externo en la máquina del desarrollador con npm/node y HTTPS al GitHub oficial:
```bash
npm run skills:sync
npm run skills:check
```
Los archivos de terceros van a `.agents/vendor/` ignorado por Git. No se puede afirmar que hayan quedado descargados en la PC Windows del propietario desde una sesión remota de GitHub. Las cinco skills **propias** y los tres agentes **sí** están físicamente versionados en la rama y pasan por el router al leerla localmente.

## Gates y límites
- `AGENTS.md` prevalece; máximo 2–4 skills de dominio seleccionadas. Las cinco skills de ejecución existentes permanecen independientes.
- Frente a un incidente de Control Hípico, el router prioriza `contagest-systematic-debugging`, `contagest-secure-verification` y `contagest-release-evidence`; la skill LAB no desplaza esos tres controles.
- Prohibido otorgar autoridad monetaria a agentes, operar WhatsApp SOURCE, instalar scripts de upstream a ciegas, rebajar checks, cerrar issues sin evidencia o inferir que CI pendiente es PASS.
- Registro de QA: pruebas nuevas `tests/agent_skill_admissions_v1.test.mjs`; también `npm run agent:system:verify` y `npm run agent:system:test` sobre SHA candidato. La validación final depende del resultado real de GitHub Actions.

## Reversión
Revertir esta rama/PR. No hay cambios productivos en frontend/backend, migraciones, secretos ni datos; los vendor caches opcionales se eliminan localmente.
