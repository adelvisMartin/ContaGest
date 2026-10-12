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
2. Si la conexión se interrumpe o la proyección responde 502/503/504, se
   permite un único nuevo POST **de solo lectura** con el mismo envelope
   y token, al mismo endpoint fijado por la URL de ingestión.
3. Si la respuesta contiene autoridad canónica verificada, se prepara y
   confirma la escritura solamente mediante el journal LAB.
4. Si hay errores 401/403/404/429, respuesta malformada o autoridad
   indebida, no se reintenta inmediatamente. Ante fallo de consulta LAB
   con backend configurado, se conserva el mensaje sin ACK ni envío, para
   volver a consultar datos frescos en un ciclo posterior.
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
