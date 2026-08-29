# Guía de estudio — Hípico #151: LAB Group Simulator

## Qué problema resuelve

Un bot puede aprobar unit tests y aun fallar cuando varios participantes escriben casi al mismo tiempo, llegan retries o un mensaje viejo reaparece después de reconnect. El simulador convierte esos problemas temporales en fixtures reproducibles.

## 1. Orden de entrega vs timestamp

Son conceptos diferentes:

```text
orden de entrega = posición del evento en el fixture
atMs             = timestamp lógico del mensaje
```

Esto permite probar out-of-order: un mensaje puede entregarse segundo y llevar un timestamp anterior al primero.

## 2. Participantes sintéticos

El simulator usa IDs como `tester-a`. Al importar corpus, el sender se transforma en un hash sintético. La identidad real no es necesaria para verificar decisiones.

## 3. Determinismo

Un scenario tiene:

- ID;
- seed;
- participants;
- active/closed races;
- events.

Mismo fixture + mismo engine produce el mismo transcript hash y state hash. Esto vuelve útil una regresión histórica: si cambia un hash, se puede investigar qué decisión cambió.

## 4. Duplicados

`duplicateOf` hace que dos entregas compartan `sourceMessageId`. La segunda debe terminar en `NO_RESPONSE`, evitando doble respuesta.

## 5. Findings

El runner detecta:

- `UNKNOWN_PARTICIPANT`;
- `LOST_DECISION`;
- `DUPLICATE_RESPONSE`;
- `EXPECTED_DECISION_MISMATCH`;
- `CONTEXT_LEAK`.

Un finding no se oculta ajustando el resultado esperado después de ver el output; el fixture debe representar el contrato deseado.

## 6. Carga

El escenario `pre-close-load` incluye 120 eventos. No es un soak de 24h: sirve para exponer problemas lógicos con ráfagas. #120 es el ticket que mide memoria/colas/latencia durante horas.

## 7. Modo interactivo

Dos testers pueden usar una consola local:

```text
/a hola
/b juega 2N
```

Cada entrada vuelve a ejecutar el escenario y muestra la última decisión. La interacción sigue siendo local; no existe transporte externo.

## 8. Evidence por SHA

Los resultados van a `artifacts/qa/hipico-lab/<sha>/`. El SHA hace que la evidencia responda a “¿qué código produjo este resultado?”.

`local-unbound` significa precisamente que no había un candidate SHA verificable; no debe presentarse como evidencia de release final.

## 9. Reinicio

El escenario de restart comprueba que una secuencia puede reconstruirse determinísticamente desde el fixture. La recuperación real de procesos/colas se prueba además en #112/#119/#120.

## 10. Qué no demuestra

El simulador no demuestra:

- que WhatsApp Web siga teniendo el mismo DOM;
- que una sesión real sobreviva reboot;
- que Android WebView funcione;
- estabilidad 24–72h;
- autorización legal/platform para producción.

Por eso existen #119, #120 y #154.

## Preguntas de repaso

1. ¿Por qué no conviene ordenar automáticamente los eventos por timestamp?
2. ¿Qué diferencia hay entre burst test y soak test?
3. ¿Qué garantiza un transcript hash?
4. ¿Cómo se modela un retry del mismo mensaje?
5. ¿Por qué la importación debe pseudonimizar participantes?
6. ¿Qué significa `local-unbound` en artifacts?
