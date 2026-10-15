# ContaGest — four ChatGPT windows / issue-to-merge protocol

**Authority:** `AGENTS.md`, `.agents/TICKET_EXECUTION_POLICY.md`, META #624/#835/#837/#841. One issue = one exclusive branch/PR. This protocol is a coordination rule, not an agent scheduler.

## Coordinator — before opening the four windows

1. Query live open issues/PRs, dependencies and claim records. Pick **four explicitly distinct, unblocked issue numbers**, preferably separate write boundaries. Never independently ask every window to "choose next issue": that races.
2. Allocate fixed IDs and scope in a shared dispatch message: WINDOW 1 = #..., WINDOW 2 = #..., WINDOW 3 = #..., WINDOW 4 = #.... Do not let windows claim the same issue or shared schema migration without coordination.
3. Each window records its claim in its own issue and owns a branch `ticket/<issue>-<short-slug>-w<N>`; inspect any existing claim, branch or PR first. GitHub labels/comments are informative, not atomic locks: the coordinator must be the **single source of assignments**.
4. Only one designated coordinator merges to main at a time. Window agents can implement/test/open PR in parallel but must not race main merges. A worktree or isolated workspace/branch is required for each concurrent coder.
5. After every merge, refresh main SHA. Other windows compare their candidate to new main, resolve actual conflicts without overwriting unrelated work, and **rerun invalidated local/CI gates** before their turn. Do not force-push/force-merge or disable required checks.
6. Claim the **next** ticket only after previous issue was proven completed/merged/closed and the coordinator assigned the next unclaimed issue. Stop on BLOCKED and report exact blocking evidence.

## Prompt to paste into EACH window

~~~text
Actúa como Principal/Staff+ de ContaGest (adelvisMartin/ContaGest), con acceso real a GitHub y sin inventar cambios, resultados o ejecuciones. Mi ventana es WINDOW <N>; ticket exclusivo asignado: #<ISSUE_NUMBER>. No elijas otro ticket ni cierres issues ajenos. El coordinador controla los merges seriales y asignará el siguiente ticket.

Antes de modificar: lee #<ISSUE_NUMBER>, sus criterios, dependencias/owners, AGENTS.md, .agents/TICKET_EXECUTION_POLICY.md, los agentes y los skills del repositorio. Identifica main HEAD exacto, branches/PRs abiertos y claims duplicados. Selecciona agente y 2–4 skills propios por scripts/agent-ticket-router.mjs; opcionalmente revisa los wrappers contagest-ponytail y contagest-addy-engineering, y contagest-omniroute sólo si el ticket afecta explícitamente a proveedores IA. Los externos nunca sustituyen una skill P0/P1.

Haz un plan acotado con archivos, fronteras UI→API→servicio→PostgreSQL, aceptación y riesgo. Trabaja sólo en ticket/<ISSUE_NUMBER>-<slug>-w<N> desde el main inspeccionado. No reutilices branch compartida; no toques ni borres cambios de otras ventanas. Implementa código integrado y mínimos tests/regresiones, con commits atómicos y push comprobado. Usa Node 22 y npm ci porque ESTE repositorio es npm-workspaces/package-lock.json. Si hay DB, PostgreSQL real efímero, fixtures propios, tenant isolation y cleanup. Ejecuta los comandos relevantes reales: lint, typecheck, tests, build, audits, E2E Chromium, y Firefox/WebKit si el alcance/CI lo exige. No skip, only, sleeps, force, ni bypass de checks.

Antes de PR: compara diff con issue, detecta secretos/scope creep, cita SHA candidato y qué se verificó. Abre/actualiza PR a main, enlaza "Closes #<ISSUE_NUMBER>" sólo cuando todos los criterios estén completos, y reporta su URL. Si existe CI, inspecciona exclusivamente runs del head SHA, con job/step/expected/actual. NUNCA llames PASS a algo no ejecutado o bloqueado por GitHub/Vercel.

NO ejecutes el merge simultáneamente con las otras ventanas. Reporta "READY_FOR_COORDINATED_MERGE" con branch, PR y SHA; el coordinador realiza merge serial con expected head SHA, luego verifica merge SHA y cierre de issue/backlog. Si no hay coordinador operando, solicita turno de merge; no conviertas la autorización general en una carrera de merges. Si falta evidencia material: PARTIAL/BLOCKED, sin DONE ni cierre. Al finalizar, devuelve informe: issue, baseline/candidate/merge SHA, causa raíz, cambios, criterios, comandos realmente ejecutados, CI, E2E, seguridad, riesgos y follow-ups.
~~~

## Assignment matrix

| Window | Owns | Avoid overlapping writes with |
|---|---|---|
| 1 | Ticket explicitly assigned by coordinator (e.g., core/financial) | 2–4 |
| 2 | Ticket explicitly assigned (e.g., UI/UX) | 1, 3, 4 |
| 3 | Ticket explicitly assigned (e.g., backend/tenant) | 1, 2, 4 |
| 4 | Ticket explicitly assigned (e.g., Hípico/LAB) | 1–3 |

These examples are **not live assignments**. Coordinator must verify dependencies, branch claims, and actual changed paths before scheduling. Shared schema, lockfile, agents config, CI and API authority work is **serial** even across different tickets.

## Gate and closure rule

`claim → branch → implement → local evidence → PR → CI exact SHA → coordinated merge → confirm main merge SHA → issue close/backlog update → next assignment`.

Provider/runner quota blocked is BLOCKED_EXTERNAL, not PASS. A direct merge may be considered only under owner-established local-first rules with sufficient risk-proportional code evidence, not by suppressing failing required protections or misreporting CI. Never declare PRODUCTION_VERIFIED without real postdeploy evidence.
