# Control Hípico #907 — Bandeja durable de consultas LAB

## Autoridad y alcance

La entrada conversacional de LAB mantiene el contrato existente de consultas informativas
de solo lectura `POST /bridge/lab/query` (#892/#899). La autoridad de envío físico
continúa siendo `lab-test-reply-journal.mjs` (`prepared → sending →
confirmed/ambiguous`) y la verificación de etiqueta visible en el grupo
LAB. No se habilita el envío al grupo SOURCE (#728), no se procesan apuestas
monetarias y no se crea otro motor de conversación ni tabla de dominio.

## Flujo seguro

1. Con una identidad de grupo pinneada y un remitente identificado por JID
   estable `@lid` / `@c.us`, el Bridge reconoce una consulta estrictamente
   informativa (`status`, `result`, `participants`).
2. Guarda **antes del HTTP** una entrada local cifrada y vinculada al grupo,
   remitente, ID de mensaje, texto, pregunta, referencia explícita de carrera
   o cita previamente validada. Ninguna respuesta, saldo o token se almacena
   en esta bandeja.
3. Si se interrumpe la conexión o se reinicia Windows, las preguntas aún
   pendientes se recuperan sin necesidad de que el mensaje siga visible en
   WhatsApp Web. El backend se consulta de nuevo: nunca se reutiliza una
   respuesta de carrera antigua. Si la pregunta citaba otro mensaje cuya
   referencia ya fue verificada y cifrada, se mantiene esa referencia sin
   confiar en el DOM cambiante; si cambian JID, texto, marca temporal,
   número de carrera explícito o ID de cita, el candidato queda retenido
   para revisión y nunca se sobreescribe silenciosamente.
4. Una respuesta canónica verificada permite **preparar** el ACK y enviar;
   una entrega ambigua o `sending` sólo puede reconciliarse mediante la
   etiqueta realmente visible, nunca con otro Enter.
5. El ACK `confirmed` precede a la eliminación de la entrada. Si el proceso
   termina entre ambos pasos, el ACK sigue ganando y se limpia la bandeja
   sin duplicar el mensaje.
6. Las entradas caducan tras **10 minutos desde la marca original del mensaje WhatsApp**, con un máximo de **200** en
   disco. Una marca no interpretable, futura o caducada se rechaza y no se renueva cuando el mensaje reaparece en pantalla. El Bridge limpia caducadas cada minuto, incluso con WhatsApp
   desconectado, mientras el proceso siga levantado; también limpia en
   la recuperación inicial. Un registro corrupto bloquea la recuperación
   (fail-closed) en vez de descartarse y reenviarse a ciegas.

## Confidencialidad y concurrencia

- El contenido de cada registro está cifrado con **AES-256-GCM** (IV
  aleatorio y AAD asociado al grupo y hash de mensaje). Los nombres son
  HMAC y no muestran el remitente ni el mensaje.
- La clave se crea localmente en `lab-pending-queries/inbox.key`,
  archivo privado con modo 0600, y el directorio intenta modo 0700.
  **En Windows estos modos no sustituyen una ACL de NTFS ni el cifrado
  del dispositivo**: restringir el acceso al perfil del servicio y a sus
  copias de respaldo forma parte del despliegue físico.
- `owner.lock` impide levantar dos Bridge que utilicen el mismo
  directorio de datos. Se vincula al hash de identidad del equipo
  además del PID: nunca se reclama un lock de otro equipo usando
  `process.kill(pid, 0)` local. Si hay propietario remoto, se bloquea
  el segundo Bridge. Tras una caída sólo puede recuperarse un PID
  local demostrablemente terminado; los permisos ambiguos bloquean.
  El hash del nombre del equipo no es una autoridad distribuida
  infalible (nombres duplicados y carpetas distintas); desplegar
  dos máquinas para el mismo grupo requiere un gate centralizado
  o exclusión operativa y QA.
- Para evitar que la bandeja capture mensajes monetarios o texto
  malicioso, reevalúa la clasificación al guardar **y** al recuperar.
  La bandeja no concede permiso de consulta por sí misma.
- No escribir el contenido recuperado en métricas, health, logs ni
  soporte. Los operadores sólo reciben referencias hash y conteos.

## Ejecución y evidencia pendiente

```powershell
cd tools/hipico-whatsapp-web-bridge
npm ci
npm run qa
npm run test:lab:recovery
npm run test:lab:tcp
```

Incluye pruebas unitarias de cifrado/reinicio, ámbito, idempotencia,
modificación maliciosa, caducidad, límite de entradas y orden del
journal. Se requiere completar en Windows el ciclo:
entrada → HTTP caído → desaparición del mensaje del DOM → cerrar
proceso → levantar de nuevo → recuperar → reconciliar entrega, además
de casos simultáneos, red perdida, sesiones y la fase soak (#119/#120).

**No afirmar PASS de despliegue, WhatsApp real ni CI exact-SHA mientras no
existan logs/artifacts verificables.** El código nuevo se integra sobre
el PR #906 como dependencia: primero debe aprobarse y fusionarse su
recuperación read-only.

## Coste de consulta y observabilidad

La lectura de un mensaje pendiente localiza directamente su archivo por HMAC,
lo descifra y comprueba su caducidad sin volver a procesar la bandeja completa.
El barrido global se mantiene en arranque, inserción y limpieza periódica. Se
registran únicamente razones de revisión y conteos, no texto, remitentes ni
las citas en claro. La contención por múltiples Windows/hosts sigue siendo
un gate de despliegue: el candado local sólo coordina un directorio compartido.

## Backfill seguro de citas después de una caída

Una respuesta LAB puede estar marcada `confirmed` en el journal de envío
antes de que la referencia HMAC de carrera haya terminado de persistirse. En
recuperación fuera del DOM, un ACK confirmado o reconciliado con etiqueta visible
reconstruye **sólo** la pista de carrera explícita, segura y del mismo JID,
escribiéndola en `lab-quoted-race-journal` con `confirmed:true` **antes**
de eliminar la entrada de la bandeja cifrada. Si persiste un error al guardar
la pista, la pregunta permanece pendiente para reintentar el *backfill*,
**sin ejecutar otro Enter**; el ACK confirmado es siempre definitivo.

### Evidencia de CI y límites

El CI del candidato anterior `cfc5db7c5c9dc44c481e0a54ee27c084af553331`
falló en dos contratos locales del Bridge: un cambio explícito inválido de carrera
retornaba `LAB_PENDING_QUERY_INVALID` pero el test esperaba exclusivamente
`LAB_PENDING_REPLAY_MISMATCH`; el test de orden de envío confundía el
`confirm` de conciliación previa con el ACK posterior al envío. Los tests
se corrigieron preservando validaciones y verificando ambos flujos por
separado. La prueba adicional de recuperación tras caída comprueba que la
referencia HMAC se reconstruye sólo tras ACK y antes de limpiar la bandeja.

Estos cambios **no** declaran QA verde, funcionamiento físico de Windows,
ejecución de PostgreSQL o autorización para escribir al grupo SOURCE.
