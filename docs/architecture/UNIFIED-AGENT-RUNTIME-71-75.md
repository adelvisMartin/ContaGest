# 71/75 · Unified Agent Runtime

## Objetivo

Unificar la composición del agente de Control Hípico sin crear una segunda autoridad de clasificación, riesgo, herramientas, promoción o persistencia.

## Autoridades preservadas

- `agent-evaluator.ts`: evaluación determinista/model-assisted y composición de candidato.
- `risk-policy.ts`: única autoridad de `AUTO | SUGGEST | HUMAN_REQUIRED | DENY`.
- `agent-tools.ts`: única autoridad de allowlist, sanitización y tool scope.
- `promotion-policy.ts`: única autoridad de promoción SHADOW/ASSISTED/AUTOMATIC.
- `automation.store.ts`: persistencia, auditoría, métricas y transiciones tenant/group scoped.
- Jev/decision-provider: evidencia downgrade-only; nunca autoriza ni reemplaza la decisión canónica.

## Runtime unificado

`unified-agent-runtime.ts` es una capa de composición, no un motor paralelo. Recibe el texto, modo y contexto de riesgo; delega la evaluación al `HipicoAgentEngine`; conserva la propuesta sanitizada; y solo expone una tool request ejecutable cuando la política canónica ya autorizó `canAct`.

También puede delegar el registro de evaluación al contrato existente de `AutomationStore` mediante una dependencia estructural, sin importar Prisma ni ganar autoridad de persistencia.

## Invariantes de seguridad

- `financialAuthority` permanece siempre `false`.
- SHADOW y ASSISTED nunca exponen una tool request ejecutable.
- Los candidatos de modelo no cruzan la frontera AUTO.
- El runtime no construye SQL, no aplica efectos de dominio y no ejecuta comandos.
- La auditoría ligera del runtime contiene metadatos acotados de decisión, nunca el texto crudo del usuario.
- La ruta `/automation/evaluate` conserva Jev como evidencia-only, observabilidad existente y `AutomationStore.recordEvaluation` como persistencia canónica.

## Compatibilidad

La ruta existente conserva su shape histórico (`candidate`, `toolRequest`, `canAct`, `mode`, `riskPolicy`) mediante un adapter local sobre el envelope del runtime. No cambia paths, autenticación de operador, RBAC, esquema, SQL, migraciones ni contratos financieros.

## Regresión

`unified-agent-runtime.test.ts` bloquea:

1. ejecución únicamente después de `AUTO`;
2. propuesta no ejecutable en SHADOW;
3. delegación a la política canónica de promoción;
4. reutilización del contrato de auditoría persistida;
5. ausencia del mensaje crudo en eventos de auditoría del runtime.

La prueba entra automáticamente en `backend test` y `test:hipico` por el glob existente `src/modules/hipico/*.test.ts`.
