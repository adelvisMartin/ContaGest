# Control Hípico — integración del agente #923 y la bandeja cifrada #930

## Autoridad y procedencia

Esta rama parte de `main@001df2a22f002aa0aab7a88b66e21c3991ecaa4a`,
**después** del merge del agente conversacional #923. Incorpora los
componentes independientes del PR #930 y adapta sus recorridos al handoff
canónico del agente, **sin sustituir el `index.mjs` de main por el del PR #930**.

Se mantiene una sola autoridad física para enviar en LAB:
`lab-test-reply-journal.mjs` y la prueba de una burbuja saliente propia,
en el grupo LAB con ID verificado. SOURCE sigue READ-ONLY/NO-GO.

## Invariantes de consulta informativa

1. En LAB visible, comprobar remitente estable, grupo pinneado y handoff
   actual antes de admitir consultas al backend.
2. Para consultas canónicas `status/result/participants/next/active/schedule/summary`,
   leer una marca de WhatsApp fiable y guardar el mensaje original
   **cifrado y durable antes del primer HTTP**. No almacenar secretos,
   datos de apuestas o una respuesta canónica obsoleta.
3. Al recuperar, usar exclusivamente el contenido cifrado original
   y su carrera/cita verificada; no reconstruir alcance desde DOM mutable.
4. Los gates `checkLabSendEligibility` se ejecutan **antes del HTTP**,
   **después de una respuesta canónica válida**, y **justo antes de Enter**
   para consultas visibles y consultas recuperadas fuera del DOM.
   Los dos últimos comprueban el alcance inmutable usado por el HTTP.
5. Un operador que tomó control bloquea el reenvío diferido. Si el takeover
   ocurre después de `begin`, volver el journal a `prepared` antes de
   abandonar el envío, sin pulsar Enter.
6. Respuesta canónica fallida, cambio de carrera, marca expirada,
   fallo de integridad o backend offline: **no crear otro send intent**.
7. Un estado `sending/ambiguous` solo puede reconciliarse mediante una
   etiqueta real de mensaje **saliente** en LAB. Nunca enviar otra vez
   una entrega ambigua.
8. Después de ACK `confirmed`, una referencia HMAC puede reconstruirse
   de un registro cifrado original, aun con backend offline; jamás
   del texto visible cambiado. No se prolonga la caducidad original.
9. Mantener los límites: máximo 200 entradas, TTL diez minutos y
   selección de 25 entradas por ciclo con round-robin volátil.

## Caída del backend y relevo humano

La persistencia mínima y cifrada ocurre **antes** de consultar elegibilidad
online, por lo que una consulta informativa validada puede sobrevivir a una
caída del backend o a la desaparición del mensaje del DOM. Esto **no**
autoriza responder: la lectura canónica, el handoff y el journal se comprueban
al recuperar. Si el backend informa `LAB_HANDOFF_HELD`, tanto el recorrido
visible como el recuperado descartan la consulta no entregada y registran
`seen`: no se responde más tarde simplemente porque el operador liberó
el control. Si solo hay un fallo temporal de conexión, se mantiene la entrada
hasta la caducidad original.

Una carrera extraída únicamente de memoria conversacional **no** se guarda
como alcance canónico durable. Para consultas con referencias implícitas se
conserva la orientación del agente; el ámbito para recuperación debe proceder
del mensaje explícito o de una cita verificada del mismo JID. No se promociona
una sugerencia contextual a autoridad de datos.

## QA reproducible

```powershell
cd tools/hipico-whatsapp-web-bridge
npm ci
npm run check
npm run test:lab:recovery
npm run qa
npm run production:check
npm run source:policy
```

Regresiones nuevas en `tests/lab-pending-integration.test.mjs`:
operator takeover pre-HTTP, post-HTTP y pre-Enter; ACK no duplicado;
backend offline; rechazo de consulta canónica no validada; orden de
persistencia/hand-off en la ruta visible y soporte de `summary`.

La función `resumePendingLabQueries` del blob integrado se ejecutó
aisladamente en V8 con mocks de journal, backend y operador:
**6/6 escenarios esperados**. También pasó la validación sintáctica
aislada de `index.mjs` y las dos suites de tests afectadas. Estos
resultados **NO sustituyen** las pruebas completas Node 22,
PostgreSQL 17, Chromium, Windows real, WhatsApp LAB físico, dos
sesiones ni soak #119/#120; no se han confirmado los gates de Actions
del HEAD de la rama.

## Publicación y remediación

Este incremento debe revisarse como PR de integración independiente;
el PR #930 original no debe forzar un merge conflictivo ni cerrar
#899/#907 automáticamente. Resolver cualquier diferencia futura de
main mediante commits explícitos con QA exact-SHA, sin `--force` y
sin introducir SOURCE writes. No borrar `data/`, `inbox.key`,
journals ni entradas cifradas durante actualizaciones/rollback.
