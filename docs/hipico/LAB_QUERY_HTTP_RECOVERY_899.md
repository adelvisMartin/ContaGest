# #899 — Recuperación de consultas LAB tras perder la respuesta HTTP

## Contrato vigente
El flujo activo de LAB desde main@a954abcbb272016ab7836550b0dd5b449464f7cc usa
`POST /bridge/lab/query` como **proyección de solo lectura**. No crea un
`HipicoResponseReceipt` ni modifica carreras. La publicación en LAB sigue
exclusivamente en `labTestReplyJournal` del Bridge.

El diseño anterior de snapshots de recibos del PR #902 estaba dirigido a un
camino alternativo no fusionado de `/bridge/events`. No debe desplegarse
sobre este flujo ni introducir una migración innecesaria.

## Recuperación real
1. La consulta está limitada a LAB y a preguntas informativas; sender JID,
   grupo e identidad se validan antes de consultar.
2. Si la conexión se interrumpe o la proyección responde 502/504, se
   permite un único nuevo POST **de solo lectura** con el mismo envelope
   y token, al mismo endpoint fijado por la URL de ingestión.
3. Si la respuesta contiene autoridad canónica verificada, se prepara y
   confirma la escritura solamente mediante el journal LAB.
4. Si hay errores 401/403/404/429/503, respuesta malformada o autoridad
   indebida, no se reintenta inmediatamente. Ante fallo de consulta LAB
   con backend configurado, se conserva el mensaje sin ACK ni envío, para
   volver a consultar datos frescos en un ciclo posterior. Se usa un backoff
   volátil por mensaje (15, 30 y máximo 60 segundos; 500 entradas en memoria)
   para limitar carga sobre el backend y evitar bucles de reintentos inmediatos.
5. Si un Enter fue ambiguo, la conciliación por etiqueta visible existente
   prevalece; este cambio no abre un nuevo envío ni altera el gate SOURCE.

## Alcance y riesgos
No altera balances, carreras ni recibos, ni escribe en el grupo SOURCE.
La consulta del segundo intento puede devolver datos más recientes que la
primera: se acepta esa actualización porque sólo se publica la respuesta
completa verificada; nunca se recupera una confirmación monetaria.

Persistir consultas aún no resueltas para recuperarlas cuando desaparezcan
del DOM queda como follow-up separado. Se requieren QA con Chromium/Windows,
conexión perdida, reinicio del Bridge y los gates exact-SHA.

## Verificación
```bash
cd tools/hipico-whatsapp-web-bridge
npm ci
npm run qa
```

`npm run qa` cubre la recuperación read-only, la orden de consulta
anterior al send intent y el bloqueo de errores de seguridad. No sustituye
pruebas de WhatsApp real ni soak.

## Revisión humana como respuesta canónica terminal

El backend `/bridge/lab/query` puede responder HTTP 200 con `status:
REVIEW_REQUIRED` cuando la política conversacional detecta que la consulta
requiere intervención humana, aunque un clasificador local haya permitido
la petición inicial. Ese estado **no es** un hecho canónico y no autoriza
enviar una respuesta automática al WhatsApp LAB.

El Bridge convierte `REVIEW_REQUIRED` válido en
`{available:false,reason:'LAB_CANONICAL_REVIEW_REQUIRED'}`. Tanto la
ruta visible como la recuperación cifrada fuera del DOM hacen handoff terminal:
guardan la marca de atendido/revisión, eliminan el trabajo cifrado pendiente y
no ejecutan `prepare`, `Enter` ni backoff automático. La respuesta de
revisión es visible solo en el backend/auditoría autorizada; los mensajes de
WhatsApp no se envían en nombre de un operador.

Una respuesta `REVIEW_REQUIRED` sin texto, con autoridad monetaria o con
formato inválido sigue tratándose como error de contrato. Las respuestas
informativas verificadas como `CANONICAL_RACE_NOT_FOUND` conservan su
comportamiento de ausencia explícita de datos. Esta es una mejora de seguridad
de LAB, **no** habilita SOURCE ni omite #119/#120/#839.


### Códigos de respuesta explícitamente autorizados

El Bridge ya no convierte cualquier `status` en mayúsculas y con `text`
en autorización de envío. El adaptador read-only permite únicamente códigos
informativos que realmente producen los lectores canónicos de carrera,
cartelera y conciliación inmutable (`CANONICAL_*` conocidos y exactamente
`LAB_CANONICAL_RECOVERED`/`LAB_CANONICAL_REVISION_CHANGED`). Los códigos
nuevos o desconocidos son `LAB_CANONICAL_INVALID_RESPONSE`, sin Enter, y
requieren actualizar explícitamente backend, adaptador y pruebas.

Los estados `LAB_CANONICAL_HUMAN_HANDOFF`,
`LAB_CANONICAL_REQUEST_STALE` y `LAB_CANONICAL_RECEIPT_NOT_VERIFIABLE`
tampoco publican respuestas: el Bridge los trata como revisión terminal
`LAB_CANONICAL_REVIEW_REQUIRED`, igual que `REVIEW_REQUIRED`. Un estado
sintácticamente bien formado como `TRANSFER_APPROVED` no constituye una
respuesta oficial ni concede permisos al agente. Esto no concede acceso
financiero, escritura a SOURCE ni autorización para omitir QA.

Regresiones del adaptador: códigos ajenos, respuestas de control terminales
y códigos informativos válidos. Las comprobaciones V8 aisladas del SHA del
PR pasaron 15/15, pero la suite Node completa y pruebas reales de Windows,
PostgreSQL y WhatsApp LAB siguen pendientes.
