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

## Publicación atómica de la bandeja y evidencia de salida (2026-10-13)

Una entrada cifrada se escribe primero como archivo privado `.tmp`, se sincroniza,
y sólo entonces se renombra al nombre HMAC final `.json` antes del HTTP.
La inicialización, bajo el candado de propietario local, elimina restos
`.tmp` de procesos anteriores; un archivo definitivo incompleto sigue
siendo inválido y detiene el Bridge para revisión (no se reenvía ciegamente).
El registro definitivo se conserva intacto tras un reinicio cuando existe
un archivo temporal abandonado.

El ACK de LAB requiere la comprobación estricta de salida de `main`:
burbuja `.message-out` dentro de `#main`, JID del grupo fijado validado
antes y después de leer el DOM, etiqueta `[LABTEST:…]` exactamente en
la primera línea y líneas completas de respuesta y fuente. Una etiqueta
dentro de una cita o un reenvío no confirma ni reactiva el mensaje.

Se incluyeron regresiones de archivos temporales huérfanos, publicación
completa y citas con etiquetas falsificadas. Estas pruebas de código no
sustituyen su ejecución real en Node/Windows ni el soak.

## Recuperación tras ACK sin duplicar envíos (2026-10-13)

También el ciclo LAB **visible** conserva el texto cifrado hasta que la pista
HMAC de carrera, si corresponde, se haya guardado después del ACK físico
confirmado. Los casos `confirmed`, `sending/ambiguous` conciliados por
burbuja saliente y `send + confirm` comparten
`finalizeConfirmedVisibleLabQuote`. Un fallo al guardar esa pista mantiene
la entrada pendiente para un ciclo siguiente, pero nunca repite `Enter`.
La suite comprueba tanto la secuencia positiva
`read → hint → remove` como el fallo seguro `read → hint` sin borrado.

Si un archivo definitivo cifrado está corrupto, la inicialización falla
cerrada sin destruir ese registro. Al salir por error, el proceso únicamente
elimina `owner.lock` cuando su token todavía coincide con el propietario
que adquirió el candado; no borra un candado reemplazado por otro proceso.
La recuperación manual de datos corruptos exige intervención operacional.

## Post-ACK offline, aun cuando el mensaje continúe visible

La reconciliación de `lab-pending-queries` distingue **entrega** de
**consulta**. Puede completar el hint HMAC de un envío con journal `confirmed`
aunque `labSeen` ya marque la fila visible y aunque el backend esté
`offline`. Así se cierra el hueco en que el poll LAB omite la fila vista,
pero el registro cifrado no puede limpiarse porque falló un guardado auxiliar.

Un envío `sending/ambiguous` sin fila visible sólo se confirma ante prueba
estricta de una burbuja saliente LAB, no por conexión del backend. Por el
contrario, las preguntas todavía sin ACK **no** disparan consulta HTTP ni
`Enter` mientras el backend esté desconectado. El envío sigue necesitando
una consulta canónica reciente y el journal de envío.

Regresiones agregadas: ACK ya confirmado + fila visible + backend offline
con éxito/error de HMAC; consulta nueva sin conexión que no realiza envío;
conciliación ambigua fuera del DOM con evidencia saliente estricta.

La función efectiva del Bridge se ejecutó con dependencias controladas como
smoke test de secuenciación; esto **no sustituye** la suite Node completa,
el CI exact-SHA ni la verificación física de WhatsApp en Windows.

## Integridad del contexto después de ACK (2026-10-13)

Si el journal de salida ya tiene un ACK confirmado pero **no existe** la entrada cifrada original de la consulta, el Bridge no reconstruye pistas de carrera a partir del texto mutable del DOM. Mantiene el ACK, registra únicamente `LAB_QUOTE_HINT_NO_VERIFIED_INPUT` y omite la pista auxiliar. Una entrada cifrada que sí existe tiene prioridad sobre texto/cita visible y se elimina únicamente después de guardar la pista HMAC. Esto no provoca un segundo envío ni afecta SOURCE.

Regresión: DOM con otra carrera + bandeja vacía no genera pistas; DOM alterado + entrada cifrada válida usa solamente la entrada cifrada. QA Node/CI exact-SHA y Windows físico siguen como gates independientes.

## Arranque transaccional de clave privada AES (2026-10-13)

El Bridge adquiere `owner.lock` **antes** de leer o crear `inbox.key`.
Una clave nueva se genera en `inbox.key.<UUID>.tmp` con modo privado,
se sincroniza y después se renombra atómicamente a `inbox.key`.
Sólo bajo el candado se limpian restos temporales abandonados.

Una clave existente **nunca se reemplaza ni se regenera**: si mide distinto
de 32 bytes, es un enlace simbólico o no puede leerse, el arranque falla
cerrado. Rotarla destruiría la posibilidad de recuperar consultas cifradas
pendientes; restaurar la clave original corresponde al procedimiento seguro
de respaldo. El error libera únicamente el candado cuya identidad/token
siga perteneciendo al proceso de arranque.

Pruebas añadidas: inicialización con clave temporal incompleta abandonada,
reinicio que conserva exactamente los mismos 32 bytes, rechazo de clave
existente dañada conservando ciphertext, arranque restaurado con la clave
original, y comprobación de orden `lock → key → scan`.

Estas comprobaciones no certifican todavía el manejo de ACL de NTFS,
apagones físicos ni los workflows de Node completos.

## Selección equitativa de recuperación (2026-10-13)

El Bridge procesa como máximo **25 consultas cifradas por ciclo LAB**, pero
ahora avanza un cursor rotativo incluso cuando las primeras consultas siguen
ambiguas, el backend está desconectado o hay *backoff*. Antes siempre volvía
a elegir las mismas 25 más antiguas y podía dejar sin oportunidad a consultas
posteriores hasta que caducasen.

La nueva lectura `list(25,{offset})` realiza una ventana circular sobre
el máximo configurado de 200 entradas; no altera la identidad, orden de
confirmación ni contenido de ningún registro cifrado. El cursor es temporal
y **no constituye un ACK**, una autoridad de entrega ni un permiso de envío.
Las consultas nuevas siguen necesitando respuesta canónica reciente y los
envíos ambiguos se concilian exclusivamente por prueba saliente válida.

Pruebas agregadas: 31 entradas, ventanas rotativas que cubren todas,
rechazo de desplazamientos inválidos y avance del cursor antes del control
de backend. El selector real se ejecutó con 31 registros simulados:
cobertura 31/31 en dos ventanas, **PASS**. La validación de Node con cifrado
y filesystem real permanece pendiente de CI/Windows.
