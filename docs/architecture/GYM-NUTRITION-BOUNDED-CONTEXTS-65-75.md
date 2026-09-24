# Gym + Nutrition bounded contexts · 65/75

## Purpose

Implementation 65/75 decomposes the Fitness vertical on top of `main@374afef480d55127dfc5d038239246b68ab90349` without changing its public HTTP contracts, authorization, tenant isolation, persistence semantics or UI service authority.

## Backend ownership

The former `gym.routes.ts` owned 46 endpoints, training algorithms and nutrition snapshot logic. It is now a composition root only.

| Context | Owner | Responsibility |
| --- | --- | --- |
| core | `gym-core.routes.ts` | summary, members, trainers, plans, memberships, check-ins, assessments |
| training | `gym-training.routes.ts` | exercise library, progression, periodization, sessions, performance, substitutions, routines |
| nutrition | `gym-nutrition.routes.ts` | ingredients, profiles, rules, recipes, meal plans, nutrient snapshots, shopping list |
| adherence | `gym-adherence.routes.ts` | integrated nutrition/training/evolution read model and append-only meal adherence |
| classes | `gym-classes.routes.ts` | class schedule and creation |

The mount order remains core → training → nutrition → adherence → classes, which matches the original endpoint registration order.

Every public endpoint keeps its existing `requirePermission('gym.manage')` boundary. No new parent guard, alternate policy or bypass is introduced.

`gym.schemas.ts` remains the only request-schema authority and `gym.progression.ts` remains the deterministic progression authority. Nutrient snapshot creation moved with the nutrition context without changing its SQL or transaction contract.

## Frontend ownership

`GymManagementPage.jsx` remains the single state/service orchestrator and the only owner of the rendered gym panel.

Presentation is decomposed into:

- `GymTrainingPanel.jsx`: routines, exercise library, periodization, workout execution and performance;
- `GymNutritionPanel.jsx`: ingredients, nutrition profiles/rules/recipes, complete meal plans, shopping list, nutrient snapshots and integrated adherence;
- `GymWorkspacePrimitives.jsx`: shared visual `Metric`, `Section` and `RecordList`.

Existing `gymWorkspace.helpers.js`, `GymVerticalService` and all focused feature panels remain authoritative. The extracted panels receive state and callbacks from the page and do not create local stores or alternate API clients.

## Contract invariants

1. All 46 method/path signatures are preserved in original order.
2. Every endpoint keeps exactly one `gym.manage` permission guard.
3. Tenant filters, SQL, transactions, append-only adherence events and snapshot semantics are moved without behavior edits.
4. Request validation stays in `gym.schemas.ts`.
5. Progression stays in `gym.progression.ts`.
6. The frontend keeps one state/service owner and one rendered panel authority.
7. No `skip`, `only`, fixed sleeps, forced interaction or timeout inflation is introduced.

## Regression

`tests/gym_nutrition_bounded_contexts_65_75.test.mjs` locks route count/order/uniqueness, permission parity, composition-root purity, schema/progression ownership, frontend orchestration boundaries and bypass absence.

CI/build/runtime/database/browser status is only PASS when the exact candidate SHA executes those gates.
