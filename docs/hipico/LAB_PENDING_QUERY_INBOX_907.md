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

## Clave AES ausente con ciphertext existente (2026-10-13)

Durante `initialize`, después de adquirir el candado exclusivo, el arranque
**rechaza** crear una clave AES nueva si falta `inbox.key` y existe al menos
un registro persistido `.json` en la bandeja: `LAB_PENDING_KEY_MISSING_WITH_RECORDS`.
El Bridge libera únicamente su propio candado y conserva todo el ciphertext.
Un operador debe restaurar la **clave original** desde un respaldo protegido;
no debe eliminar ni regenerar registros para forzar el arranque. Un primer
arranque realmente vacío puede crear una clave nueva con publicación atómica.

Se añadió regresión de pérdida de clave, rechazo sin rotación, conservación
byte a byte de los registros y recuperación tras restaurar la clave original.
No implica validación física de NTFS/Windows, ejecución de suite completa ni
permiso de envío al grupo SOURCE.

## Señales operativas agregadas del inbox LAB (2026-10-13)

El resumen HEALTH incluye `labQueries` (entradas cifradas vigentes),
`labNearExpiry` (entradas dentro de los últimos dos minutos de su TTL
máximo de diez minutos) y `labOldestSec` (antigüedad máxima, en segundos).
Estos valores se obtienen únicamente de las marcas temporales de
consultas descifradas en memoria por el propietario autorizado; no se
publican mensajes, participantes, números telefónicos, carreras ni citas.

Las consultas expiradas se descartan de forma acotada según la política
de retención. El contador de cercanía a caducidad permite diagnosticar
desconexiones sin considerar el número de pendientes como entrega efectiva.
Los campos `sourceWriteAllowed:false` y `deliveryAuthority:false`
permanecen en el estado del inbox; estas métricas nunca autorizan
confirmaciones de jugadas ni nuevos envíos.

Pruebas agregadas de cero registros, entrada reciente, frontera de ocho
minutos, expiración, ausencia de identificadores en la respuesta y
contrato de HEALTH. Una regresión adicional comprueba simultáneamente dos
consultas a los 4, 8, 9:59 y 10 minutos, incluida la eliminación exacta
del registro vencido y la continuidad del segundo. La función efectiva
`snapshot()` se ejecutó con entradas temporales controladas; no reemplaza
QA de Node en Windows ni las verificaciones de integración del PR.

## Cierre de handoff y de ventana ACK/contexto (2026-10-13)

Cuando el operador humano toma control durante el precheck, la consulta canónica,
la revalidación o justo antes de pulsar Enter, el Bridge persiste el identificador
como atendido, descarta la consulta cifrada pendiente y no la reanuda aunque
más adelante el operador libere el control. Si ya se marcó el envío como
sending, antes de Enter vuelve el journal a prepared. No hay autorización
de nuevo mensaje a WhatsApp. En cambio, ante un fallo transitorio de backend,
la consulta cifrada puede permanecer pendiente, bajo su TTL original.

Después de confirmar el ACK durable de una respuesta, el orden seguro es:
ACK → guardar contexto conversacional → finalizar pista HMAC →
retirar la entrada cifrada original. Si falla el guardado de memoria o de la
pista HMAC, se conserva temporalmente la entrada cifrada original para
reintentar solamente la persistencia auxiliar: jamás se repite Enter.

Tanto la recuperación visible como la recuperación fuera del DOM se basan
únicamente en la entrada cifrada original (remitente, propósito y carrera),
no en texto visible mutable. El TTL máximo de diez minutos continúa vigente.

Regresiones incorporadas: cuatro escenarios de handoff con descarte de inbox,
tres casos de finalización posterior al ACK, y comprobación del orden de
persistencia. Se ejecutó la función real en V8 con dependencias controladas.
La suite Node completa, PostgreSQL real y Chromium/Windows siguen pendientes
de validación; SOURCE conserva su política de solo lectura.

## Contrato de resúmenes canónicos y lenguaje financiero plural (2026-10-13)

El clasificador del Bridge y la ruta read-only del backend autorizan los
mismos siete propósitos LAB: status, result, participants, summary, next,
active y schedule. El inbox AES-256-GCM admite ahora también summary;
antes lo rechazaba pese a ser válido en el transporte y el servidor.

Una solicitud de resumen de carrera puede persistir y recuperarse solamente
cuando pasa la clasificación no monetaria y la validación de identidad,
mensaje original, alcance explícito o cita verificada, límite temporal y
recepción canónica. Una pregunta sin fecha o pista completas no crea una
carrera ficticia y no hereda autoridad de la memoria conversacional.

Tanto el Bridge como el backend rechazan términos financieros singulares y
plurales: apuestas, saldos, pagos, premios, jugadas, transferencias, ganancias,
liquidaciones y operaciones similares. Este filtro se aplica aunque un
clasificador genérico devuelva conversación segura. Resumir la conversación
o estados financieros no autoriza lecturas operativas ni envíos autónomos.

Regresiones añadidas al inbox cifrado, adaptador de consultas y guardia del
backend. Comprobación aislada de funciones reales (V8): nueve mensajes
positivos/negativos y cinco validaciones del inbox con resultados esperados.
Node tests completos, PostgreSQL y Windows todavía no tienen evidencia verde
del SHA final. No se activó SOURCE ni ninguna autoridad monetaria.

## Reconciliación de conflictos PR #930 vs. #932 (2026-10-13)

La integración conversacional + inbox cifrado de PR #932 llegó primero a
`main`. Para resolver la divergencia de PR #930 sin revertir el código
fusionado, se eligió la versión canónica de `main` en todos los conflictos
que ya estaban cubiertos por #932: el flujo con tres gates de handoff,
WAL, recuperación por ACK saliente, antigüedad real de las consultas,
resúmenes de carrera, privacidad y memoria conversacional tras reinicio.
No se sustituyó el Bridge integrado por el `index.mjs` antiguo del PR #930.

Se conserva además una regresión específica para garantizar que, si se pierde
la respuesta HTTP a un resumen de carrera, el segundo intento conserva el
mismo identificador, canal LAB, alcance y propósito read-only. Esta
reconciliación de Git no es por sí sola evidencia de suite Node, CI o pruebas
Windows/WhatsApp ejecutadas. SOURCE continúa sin autoridad de escritura.


## QA Windows · último handoff humano, WAL y recuperación (PR #947)

Estos casos corresponden **solo al grupo LAB autorizado**. Ejecutar con el
Bridge detenido antes de crear una copia de seguridad de su directorio local
`data/`. No copiar ni publicar claves AES, sesiones, mensajes, JID o tokens;
no borrar registros para provocar artificialmente un PASS. El canal SOURCE
continúa NO-GO para escritura.

Desde `tools/hipico-whatsapp-web-bridge` en Windows, con **Node.js 22**:

```powershell
node --version
npm ci --no-audit --no-fund
npm run check
npm run test:lab:recovery
npm run qa
npm run source:policy
```

Registrar el SHA exacto de `git rev-parse HEAD`, versión de Node, exit codes y
la conclusión de GitHub Actions. Si el ZIP no incluye `.git`, anotar el SHA
del release/archivo publicado; el nombre del ZIP por sí solo no prueba
identidad binaria. No interpretar un workflow `queued` como PASS.

Matriz de fault-injection para la fase LAB supervisada (nunca SOURCE):

| Escenario | Resultado obligatorio |
| --- | --- |
| El operador toma LAB antes de consultar backend | No HTTP canónico adicional, no WAL, no Enter; mensaje atendido. |
| El operador toma LAB tras HTTP, antes de preparar WAL | No envío; solicitud cifrada invalidada. |
| El operador toma LAB tras `begin`, antes de Enter | Primero marca `seen` durable, luego devuelve WAL a `prepared`; no Enter ni nueva respuesta al reiniciar. |
| Falla fsync de `LAB_SEEN_FILE` durante ese último gate | No volver WAL a `prepared`; queda `ambiguous` hasta conciliación estricta, sin reenvío. |
| El fsync tuvo éxito pero falla borrar la entrada cifrada | Se registra `HANDOFF_CLEANUP_DEFERRED`; no `ambiguous` nuevo; el siguiente arranque limpia el residuo usando `seen` persistente. |
| Permiso no disponible (`LAB_HANDOFF_UNAVAILABLE`) | No inventar toma humana; rollback previo a Enter, conservar ciphertext bajo el TTL original. |
| Tras `begin` el compositor ya pulsó Enter y se pierde el ACK | Sólo un TAG saliente verificado confirma; nunca repetir automáticamente un Enter ambiguo. |

Verificar en `npm run diagnostic:status` y `npm run lab:ack-report` los
estados de revisión sin exponer contenidos; comprobar con dos remitentes
distintos que no se comparte contexto. Para ensayar un cierre entre escrituras
utilizar el arnés Node de regresión/fallos inyectados, **no** cerrar de forma
aleatoria una sesión personal de WhatsApp o manipular archivos cifrados reales.

Criterio de salida: `npm run qa` PASS sobre el SHA correcto, CI final PASS,
prueba física de Windows/WhatsApp LAB documentada y soak independiente #120.
Hasta entonces #907, #892 y #837 continúan abiertos y release NO-GO.

## Permisos de clave AES del inbox LAB — Unix/macOS y Windows (#907)

En Linux/macOS, el arranque ahora rechaza un `inbox.key` existente si
los bits de permiso conceden cualquier acceso a grupo u otros
(`LAB_PENDING_KEY_PERMISSIONS_UNSAFE`). El control también conserva
los rechazos anteriores de claves de tamaño inválido o enlaces simbólicos.
**No** cambia ni elimina registros cifrados y **no** regenera la clave.
El operador debe detener el Bridge, examinar la causa de la exposición
y restaurar el acceso privado (p. ej., `chmod 600 inbox.key`) **sin**
hacer rotación improvisada ni borrar el inbox. Un permiso corregido no
borra una posible exposición anterior; valorar la respuesta a incidentes
y restauración según el riesgo.

En Windows, los bits POSIX de `stat.mode` no prueban las ACL de NTFS.
Se mantiene el control operativo de que el directorio y `inbox.key`
sólo sean accesibles por la identidad del servicio, con evidencias
físicas del equipo y almacenamiento protegido. No registrar ni
adjuntar el contenido de la clave en issues, pruebas o informes.
Los grupos SOURCE y LAB no adquieren nuevas capacidades con este cambio.

Regresión añadida: clave `0600` → modo inseguro `0644`, `0640`
o `0602` → denegación sin pérdida del material cifrado → recuperación
con `0600`. La prueba del Bridge se ejecuta en sistemas POSIX;
en Windows verifica reapertura sin declarar que revisó DACL/NTFS.
La verificación aislada no sustituye `npm run test:lab:recovery`,
`npm run qa`, CI exact-SHA, QA Windows ni soak físico.


## Raíz del inbox cifrado: modo privado verificable (#907, seguimiento)

En Linux/macOS, `safeRoot()` intenta aplicar `0700` a la carpeta de
consultas LAB y vuelve a consultar el estado real del directorio. Si el
`chmod` falla y todavía existen permisos para grupo/otros,
`initialize()` se detiene con `LAB_PENDING_ROOT_PERMISSIONS_UNSAFE`
**antes de cargar o crear la clave AES**. Un cambio a symlink entre las
dos lecturas del estado del directorio genera `LAB_PENDING_ROOT_UNSAFE`.
No hay fallback a la carpeta abierta, ni envío de WhatsApp ni borrado
automático de ciphertext para ocultar el error.

**Respuesta operativa:** detener el Bridge LAB; revisar propietario,
permisos y ruta del directorio, incluido el volumen montado; comprobar que
el almacenamiento es privado y restablecer `0700` sólo bajo control del
operador autorizado. Conservar `inbox.key` y los archivos cifrados. Si
alguna vez pudieron acceder terceros, tratarlo como un posible incidente:
corregir permisos no demuestra que el material no fuera leído.
No adjuntar rutas de usuario completas, identificadores ni secretos
a los tickets de diagnóstico.

En Windows no se infiere privacidad de `stat.mode`. Sigue obligatoria
la inspección física de ACL NTFS del directorio, clave y perfil de servicio
en el equipo real; estos tests Linux/aislados **no** acreditan ACL Windows,
pruebas WhatsApp ni CI exact-SHA. SOURCE continúa sin escritura automática.


## Lectura de clave AES atada a descriptor (seguimiento #907)

La validación de `inbox.key` no termina con un `lstat` del nombre: en
Linux/macOS el Bridge abre la clave con `O_NOFOLLOW`, comprueba sobre
**el archivo abierto** tamaño 32 B, dispositivo/inodo y permisos privados,
y lee los bytes por ese mismo descriptor. Se rechazan reemplazos o
enlaces simbólicos entre la comprobación de ruta y la apertura. Cualquier
error después de `open` cierra el descriptor incluso si la clave
no puede usarse. Nunca se regenera ni borra la clave o los registros
cifrados para esconder un fallo de identidad/permisos.

En Windows se comprueba que el archivo abierto es regular y de 32 B, sin
atribuir significado de ACL NTFS a `stat.mode` o a los identificadores de
inodo POSIX. La revisión de permisos Windows continúa en el QA físico.

Si el inicio falla por `LAB_PENDING_KEY_INVALID` o
`LAB_PENDING_KEY_PERMISSIONS_UNSAFE`, detener el Bridge, conservar intactos
`inbox.key` y ciphertext, revisar ruta/permisos, y restaurar desde un
respaldo autorizado si corresponde. No rotar una clave AES arbitrariamente,
pues impediría descifrar las consultas todavía pendientes.

La regresión prueba una sustitución de inodo/dispositivo, cambio de modo,
archivo no regular, reducción de longitud y cambio a symlink después de
la primera validación, sin falsear una prueba de integración del Bridge:
Node 22 completo, CI exact-SHA, pruebas Windows/WhatsApp LAB y soak
requieren ejecución separada antes de cerrar #907.
