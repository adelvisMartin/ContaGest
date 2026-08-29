# Control Hípico — LAB Group Simulator (#151)

## Objetivo

Permitir jornadas completas, multiusuario y reproducibles sin depender de una cuenta WhatsApp ni escribir al grupo real. El simulador consume el Bot Conversation Engine #150 y convierte cada evento en una decisión auditable.

## Frontera de seguridad

El runner LAB:

- no abre WhatsApp;
- no usa red externa;
- no toca SOURCE;
- no ejecuta efectos monetarios;
- usa participantes sintéticos;
- exporta transcript/decisions/hashes ligados al candidate SHA cuando está disponible.

## Escenarios versionados

`hipico-lab-scenarios.ts` incluye diez familias mínimas:

1. jornada nominal completa;
2. 2–5 participantes simultáneos;
3. duplicado/retry;
4. corrección/cancelación inmediata;
5. mensaje ambiguo;
6. carrera cerrada con mensajes en vuelo;
7. reconnect + mensaje stateful fuera de orden;
8. reinicio lógico a mitad de jornada;
9. carga previa al cierre (120 eventos);
10. input hostil aislado entre participantes.

## Determinismo

El orden del array representa **orden de entrega**. `atMs` representa el timestamp del mensaje. Esto permite modelar de forma explícita un mensaje entregado después pero con timestamp anterior.

Con el mismo fixture, epoch, parser y policy se esperan los mismos `stateHash` y `transcriptHash`.

## Importación de corpus histórico

`importSanitizedCorpus()` transforma cualquier sender/alias en `synthetic-<hash>` y no conserva la identidad original en el scenario exportado. El texto sigue necesitando sanitización/redacción previa si contiene PII dentro del cuerpo; no debe usarse un corpus real sin ese paso.

## Ejecución

Desde `backend/`:

```bash
npm run lab:hipico
npm run lab:hipico:interactive
```

También:

```bash
npx tsx scripts/hipico-lab-simulator.ts --scenario=duplicate-retry
```

## Modo interactivo

Permite dos testers locales en una sola consola:

```text
/a texto   -> Tester A
/b texto   -> Tester B
/race ID   -> cambia la carrera activa
/reset     -> limpia el escenario manual
/export    -> escribe artifact
/quit      -> finaliza y exporta transcript final
```

El modo interactivo es una ayuda de prueba, no un transport WhatsApp.

## Evidencia

Artifacts:

```text
artifacts/qa/hipico-lab/<candidate-sha>/
  nominal-day.json
  multi-user-burst.json
  ...
  summary.json
```

Cada resultado incluye:

- transcript;
- decisions;
- expected-vs-actual cuando el fixture lo declara;
- findings;
- cantidad de respuestas duplicadas;
- decisiones perdidas;
- context leaks;
- state hash;
- transcript hash.

## Gate

`assertLabRunSafe()` falla si existe:

- decisión perdida;
- respuesta duplicada;
- fuga de contexto;
- expectativa explícita incumplida.

No convierte una ejecución no realizada en PASS. Si Actions no obtiene runner por #134, CI queda `BLOCKED/NOT_EXECUTED`.

## Relación con otros tickets

- #150 provee las decisiones.
- #152 endurece response safety y handoff humano.
- #153 amplía corpus hostil.
- #120 reutiliza replay/carga para soak prolongado.
- #119 sigue siendo necesario para Android/PWA/WhatsApp físico.

El simulador reduce riesgo antes del mundo real; no sustituye la evidencia física ni autoriza producción.
