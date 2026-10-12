# Runbook · Control Hípico WhatsApp Bridge en Linux

Estado objetivo: **hosted shadow worker v1.4.1**, sin privilegios root durante ejecución, perfil/colas persistentes, secretos fuera de Git, logs estructurados, health periódico y LAB deshabilitado por defecto.

> El Bridge automatiza WhatsApp Web mediante navegador real. No es la API oficial de WhatsApp para grupos y puede requerir revinculación o adaptación ante cambios del DOM. El grupo fuente permanece solo lectura y toda automatización monetaria continúa bloqueada.

## 1. Host

Base recomendada: Ubuntu 24.04 LTS, Node.js 22 LTS, Google Chrome estable, `xvfb`; `x11vnc` únicamente durante vinculación/binding.

```bash
sudo useradd --system --home /var/lib/control-hipico-bridge --shell /usr/sbin/nologin controlhipico || true
sudo install -d -o root -g root -m 0755 /opt/control-hipico-bridge/releases
sudo install -d -o root -g controlhipico -m 0750 /etc/control-hipico-bridge
sudo install -d -o controlhipico -g controlhipico -m 0700 /var/lib/control-hipico-bridge
```

No copiar el perfil activo de Windows. El servidor debe vincular su propio dispositivo.

## 2. Release inmutable

```bash
SHA=<commit-aprobado>
sudo install -d -o root -g root -m 0755 "/opt/control-hipico-bridge/releases/$SHA"
sudo rsync -a --delete --exclude node_modules ./ "/opt/control-hipico-bridge/releases/$SHA/"
cd "/opt/control-hipico-bridge/releases/$SHA/tools/hipico-whatsapp-web-bridge"
sudo npm ci --omit=dev --no-audit --no-fund
sudo ln -sfn "/opt/control-hipico-bridge/releases/$SHA" /opt/control-hipico-bridge/current
```

Código en `/opt` de solo lectura para `controlhipico`; estado mutable únicamente bajo `/var/lib/control-hipico-bridge`.

## 3. Secretos y fail-safe

```bash
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/bridge.env.example /etc/control-hipico-bridge/bridge.env
sudo chown root:controlhipico /etc/control-hipico-bridge/bridge.env
sudo chmod 0640 /etc/control-hipico-bridge/bridge.env
```

Obligatorio:

- `HIPICO_GROUP_BRIDGE_TOKEN`: 32+ caracteres, igual al secreto backend.
- ingest/health por HTTPS.
- `HIPICO_REQUIRE_PINNED_GROUP_IDS=true`.
- `HIPICO_SOURCE_GROUP_ID` y `HIPICO_LAB_GROUP_ID`: IDs reales `@g.us`, distintos.
- `HIPICO_LAB_SEND_ENABLED=false` inicialmente.
- `HIPICO_LAB_TEST_INPUT_ENABLED=false` inicialmente.
- screenshots diagnósticos apagados salvo incidente controlado.

Kill switch:

```text
HIPICO_LAB_SEND_ENABLED=false
HIPICO_LAB_TEST_INPUT_ENABLED=false
```

## 4. QR y binding de IDs

El servicio normal usa Xvfb sin publicar escritorio remoto. Para el primer QR se habilita temporalmente VNC ligado a loopback y se entra por túnel SSH.

1. `sudo systemctl stop control-hipico-bridge`.
2. Crear password VNC fuera del repo y protegerlo.
3. Iniciar Xvfb + x11vnc como sesión temporal, solo loopback.
4. Entrar por `ssh -L 5901:127.0.0.1:5900 servidor` y vincular WhatsApp desde **Dispositivos vinculados**.
5. Confirmar perfil bajo `/var/lib/control-hipico-bridge/chrome-profile`.
6. Con esa misma sesión ejecutar temporalmente `npm run capture:groups` como `controlhipico` y capturar primero fuente y luego LAB.
7. El asistente debe producir dos `@g.us` válidos y distintos; copiar esos valores a `/etc/control-hipico-bridge/bridge.env` sin registrarlos en issues/PRs.
8. Cerrar VNC/Xvfb temporal y borrar exposición de VNC.
9. Reiniciar servicio todavía con LAB send/input en `false`.

El helper de binding no envía mensajes. Los nombres visibles son hints; la habilitación LAB exige los IDs pinneados.

No almacenar capturas del QR ni `group-bindings.json` en Git/CI.

## 5. systemd

```bash
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/control-hipico-bridge.service /etc/systemd/system/
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/control-hipico-bridge-health.service /etc/systemd/system/
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/control-hipico-bridge-health.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now control-hipico-bridge
sudo systemctl enable --now control-hipico-bridge-health.timer
```

La unidad aplica `NoNewPrivileges`, filesystem protegido, capacidades vacías, `UMask=0077`, límites CPU/memoria/tareas y usuario dedicado. Exit 42 no reinicia en loop: requiere reparación/revinculación controlada.

## 6. Docker alternativo

`tools/hipico-whatsapp-web-bridge/deploy/docker/` incluye imagen y Compose sin root, sin puertos publicados, capabilities vacías, root filesystem read-only, límites y volumen persistente. Usar **systemd o Docker**, no ambos contra el mismo perfil al mismo tiempo.

## 7. Health y logs

```bash
systemctl status control-hipico-bridge --no-pager
journalctl -u control-hipico-bridge -n 200 --no-pager
sudo -u controlhipico /usr/bin/node /opt/control-hipico-bridge/current/tools/hipico-whatsapp-web-bridge/src/healthcheck.mjs --ready
systemctl list-timers control-hipico-bridge-health.timer
```

Alertar por:

- health fallando dos veces seguidas;
- backend no `online` >5 min;
- crecimiento de spool/dead letters;
- exit 42;
- revinculación requerida;
- cualquier `sourceSendPossible != false`.

## 8. Backup/restore

Respaldar cifrado:

- `chrome-profile/`;
- `spool-events/`;
- `spool-lab-mirror/` si QA LAB;
- IDs vistos/retry-state;
- group bindings;
- journal shadow si es requerido para auditoría.

Antes de restaurar, detener el servicio. Dueño `controlhipico:controlhipico`, estado sensible 0700/0600. Nunca subir perfil/binding a artefactos CI.

## 9. Actualización y rollback

Cada release vive en `/opt/control-hipico-bridge/releases/<sha>`. Detener, preparar nuevo SHA, `npm ci`, mover symlink `current`, iniciar y verificar health. Rollback: apuntar al SHA anterior y reiniciar **sin borrar** `/var/lib/control-hipico-bridge`.

## 10. Gate QA LAB

El worker empieza observando, clasificando y persistiendo shadow sin responder. Para una ventana QA:

1. confirmar fuente/LAB `@g.us` pinneados y distintos;
2. health backend verde;
3. spool/dead letters en cero;
4. activar temporalmente LAB send/input;
5. usar mensajes sintéticos no monetarios y luego corpus controlado;
6. verificar una sola respuesta `[SHADOW:...]` por evento;
7. volver ambos flags a `false` al terminar.

La fuente continúa sin ruta de envío. Un binding correcto no habilita por sí mismo efectos monetarios.

## 11. Criterio de salida

Requiere evidencia reproducible de lectura source sin escritura, binding fuente/LAB, dedupe/retry, persistencia backend, recuperación de red/browser, host real, backup/restore y aceptación del riesgo de WhatsApp Web. Hasta completar QA del host, el estado correcto es `READY FOR QA`, no `PRODUCTION READY`.


## Spool v2: unicidad y recuperación segura (#837)

El runtime conserva **una autoridad por directorio de spool**: arrancar **una sola instancia** del Bridge propietaria de `HIPICO_DATA_DIR`. No compartir el directorio entre Docker, systemd, Windows, ni réplicas paralelas. La serialización de queue/flush añadida es **intraproceso**, no es una promesa de locking distribuido.

Cada registro queued/failed/sent/quarantined exige identidad canónica SHA-256 de `kind|key`, coincidencia entre nombre del archivo y registro, y correspondencia del estado con su carpeta. Los registros manipulados o incoherentes nunca se envían automáticamente; pasan a cuarentena con un identificador nuevo seguro. Si ya existe un archivo corrupto para el ID esperado, el productor rechaza sobrescribirlo y se detiene para revisión. Ante un JSON corrupto, el Bridge conserva una copia byte-a-byte en `spool-v2/quarantined-raw/*.raw` con permisos 0700 en el directorio y 0600 en el archivo; ese material puede contener datos sensibles y se mantiene exclusivamente en el host autorizado.

Los dos canales (`backend-event` y `lab-mirror`) tienen lanes independientes y cada uno admite un solo `flush` simultáneo por proceso. Una segunda invocación concurrente devuelve `busy=true` y cero intentos. Esto protege frente a reentradas del event loop, pero **no reemplaza** control de idempotencia persistente del backend, reconciliación de recibos, exclusión de procesos ni QA de reinicios y entregas ambiguas.

Ante `SPOOL_EXISTING_RECORD_INVALID` o `SPOOL_QUARANTINE`, parar el Bridge, preservar copia privada del directorio y revisar el inventario. No borrar/renombrar manualmente records de envío ni usar replay sin la aprobación del procedimiento correspondiente. Nunca subir contenidos del spool, perfiles o mensajes completos a GitHub Actions.


## LAB test input: confirmación, reintento y entrega ambigua (#837)

El modo QA `HIPICO_LAB_TEST_INPUT_ENABLED=true` nunca confirma un mensaje de entrada como procesado **antes** de la respuesta LAB. El cambio introducido distingue tres resultados operativos:

- **Antes de Enter y con compositor limpiado correctamente:** `LAB_PRE_SEND_RETRYABLE`; el mensaje permanece sin ack en `labSeen` y puede procesarse en el siguiente ciclo.
- **Después de intentar Enter o si no se puede confirmar el estado del compositor:** `LAB_DELIVERY_AMBIGUOUS`; se marca como visto para **evitar reenvíos ciegos**, y aparece `LAB_TEST_REPLY_AMBIGUOUS` con identificador correlacionado por tag en el log. El monitor expone `counters.labTestReplyAmbiguous`. Un operador debe revisar el LAB y decidir una recuperación controlada.
- **Entrega confirmada por tag visible o respuesta ya existente:** se marca como visto y se intenta persistir `labSeen`. Los mensajes vacíos o respuestas propias siguen ignorándose deliberadamente.

El mismo clasificador se aplica al envío de espejos del spool: los errores posteriores a Enter no se reintentan automáticamente y quedan en cuarentena en vez de arriesgar dos publicaciones. No se promete entrega exactly-once ante una caída exacta entre Enter y persistencia; la validación visual por tag y la conciliación de receipts siguen siendo obligatorias durante QA. No habilita escritura SOURCE ni pagos.

## LAB send-intent WAL y conciliación post-restart (#837)

El Bridge guarda ahora un **intento durable de envío** antes de llamar al navegador: `queued/failed → sending → sent/replayed`. Un fallo seguro anterior a Enter puede avanzar de `sending → failed` con backoff; un error posterior a Enter se clasifica como ambiguo y pasa a cuarentena sin reenvío ciego.

En el arranque, cualquier registro persistido en `sending` se mueve **antes de iniciar las entregas** a `quarantined` con `quarantineReason=LAB_SEND_INTERRUPTED` y `lastError=LAB_DELIVERY_AMBIGUOUS`. También se bloquea un duplicado `queued/failed` si existe otra copia `sending/quarantined` con el mismo ID lógico. Ni `spool:replay --execute` ni `requestReplay` permiten reencolar estas entregas ambiguas; el plan de replay las informa como `LAB_DELIVERY_RECONCILIATION_REQUIRED`.

**Procedimiento para el operador (cuando se haga el QA físico):** detener el Bridge; conservar el directorio privado de spool; comprobar en el grupo LAB **con ID pinneado** si ya existe la respuesta con la etiqueta exacta `mirrorTag`; registrar resultado y SHA candidato sin publicar chat/PII; sólo tras investigación específica decidir el curso de recuperación. **No** renombrar archivos para forzar `queued`, ni reenviar al grupo SOURCE, ni activar un replay por una entrega no confirmada. El sistema prefiere detener una respuesta dudosa antes que duplicarla.

Esta garantía cubre reinicios de un solo proceso Bridge y pérdida de confirmación entre Playwright y el disco. No asegura exactamente-una-entrega en WhatsApp, no sustituye recibos verificados del proveedor, y requiere pruebas de reinicio/reconexión con un LAB real antes de cerrar #837/#120.


## Acuses LAB persistentes entre reinicios — v1.6 / #837

El modo `HIPICO_LAB_TEST_INPUT_ENABLED=true` ahora mantiene una autoridad local dedicada en `HIPICO_DATA_DIR/lab-test-replies/`. Cada mensaje de entrada LAB tiene un archivo de identidad SHA-256 con alcance al **ID pinneado del grupo LAB**, etiqueta `[LABTEST:…]` y estado `prepared | sending | confirmed | ambiguous`. El journal no guarda texto del mensaje, teléfono, identificador externo sin hash, token ni sesión de WhatsApp; usa archivos privados (0600) en directorio privado (0700).

El procesamiento es `prepare → sending (fsync) → Enter en LAB → confirmación del tag saliente → confirmed (fsync) → seen legacy`. Confirmar el acuse requiere comprobación de la etiqueta **en un mensaje saliente** del LAB pinneado; una etiqueta falsificada en un mensaje recibido no es evidencia.

Si Chrome o el Bridge se cierran estando en `sending`, en el próximo arranque el journal mueve esa entrada a `ambiguous` y **no la vuelve a publicar**. Durante el monitoreo LAB, al detectar la respuesta saliente con el tag exacto, registra `confirmed` sin un segundo envío. Si no está visible, la entrada sigue bloqueada para conciliación humana; la ausencia de la etiqueta entre los últimos mensajes visibles no prueba que nunca se entregó. Un fallo seguro pre-Enter con compositor limpiado correctamente vuelve a `prepared`. Si `confirmed` existe aunque falte el archivo auxiliar `seen-lab-test-message-ids.json`, el journal impide repetir el envío.

La observabilidad expone `labTestReplyPending`, `labTestReplyAmbiguous` y `labTestReplyStates` en el health JSON. Ante `LAB_TEST_JOURNAL_RECORD_INVALID` (archivo corrupto, estado manipulado o alcance de grupo distinto) el procesamiento falla cerrado: conservar la copia privada, detener el Bridge, no borrar ni reconstruir el acuse a ciegas. No compartir el journal, perfiles, capturas ni chats en CI.

**Límites:** protección intraproceso + journal local, no delivery exactly-once garantizada por WhatsApp, ni prueba real de entrega en dispositivos. Los acuses antiguos que solo constan en `seen-lab-test-message-ids.json` no pueden clasificarse retroactivamente como confirmados o ambiguos; deben investigarse durante QA sin reinyectar automáticamente mensajes antiguos. SOURCE continúa read-only y la política #728/#154 permanece NO-GO.

## Conciliación LAB sin manipular el journal — herramienta read-only (#837)

**Comando operacional** (Node 22; desde la raíz del repositorio, con las variables del Bridge configuradas):

```bash
npm --prefix tools/hipico-whatsapp-web-bridge run lab:ack-report -- --state=ambiguous --limit=50
npm --prefix tools/hipico-whatsapp-web-bridge run lab:ack-report -- --state=all --limit=100 --check
```

El informe presenta solo `recordRef` (16 caracteres de SHA-256), `tag` del mensaje saliente `[LABTEST:…]`, `state`, `attempts`, `updatedAt` y un código acotado de `resolution`. Incluye `counts`, `pending`, `reviewRequired`, `selectedCount` y `truncated`. **Nunca entrega el cuerpo del chat, teléfono, JID del grupo, token, nombre de archivo ni ubicación del directorio.** El comando exige IDs SOURCE/LAB pinneados y distintos, y usa el `HIPICO_DATA_DIR` autorizado; no admite `--dir` ni ejecución de replay.

El modo `--check` retorna **exit 2** si existe un `sending` o `ambiguous` pendiente de revisión, **exit 0** cuando no existen esos estados y **exit 1** si hay error de lectura, configuración o integridad. Sin `--check`, una conciliación pendiente permanece visible en `status: REVIEW_REQUIRED` pero el comando retorna 0 para permitir inspección manual. En cualquier caso `releaseGate: NOT_EVALUATED`: un informe sin ambiguos **no certifica** release ni sustituye QA.

**Flujo de conciliación segura:** filtrar `--state=ambiguous`, localizar cada `tag` **en mensajes salientes** del LAB cuyo ID se ha verificado en la aplicación, contrastar con el acuse durable y dejar evidencia sanitizada ligada al SHA. Si no está visible, eso **no demuestra** que nunca se envió (puede estar fuera del histórico cargado), así que NO reencolar el mensaje. Esta herramienta es **estrictamente de lectura** y no cambia `sending`, `ambiguous` ni `confirmed`.

Ante `LAB_TEST_JOURNAL_MISSING`, `LAB_TEST_JOURNAL_FILE_INVALID` o `LAB_TEST_JOURNAL_RECORD_INVALID`, el resultado es error (no un falso PASS). Preservar los archivos del host y resolver el incidente sin borrarlos a mano. El journal es propiedad exclusiva de un único proceso Bridge; no mezclar perfiles, sesiones, hosts o grupos LAB diferentes.

## Recuperación tras commit backend y HTTP perdido — #899 (fase segura)

La ruta existente `POST /api/v1/hipico-bot/bridge/events` escribe primero el evento
y el recibo `HipicoResponseReceipt`. Si ocurre una pérdida de la respuesta HTTP
**después de guardar ese recibo**, una repetición de la misma entrada LAB puede
recuperar únicamente un **acuse informativo estático**, no un resultado de carrera
ni una transacción, al volver a evaluar la política vigente y comparar el
`responseHash` SHA-256 con el recibo inmutable de la primera decisión.

**Invariantes obligatorios:** evento persistido con la misma identidad, grupo
LAB pinneado, clasificación `greeting/help/status_non_monetary` sin riesgo,
mismo `sourceMessageId`, política y correlación, digest exacto, recibo de estado
`planned`, evidencia financiera nula, ausencia de handoff humano, sin medio,
prompt injection, rate limit ni history sync, y marca temporal dentro de
**90 segundos**. Si alguno falta, el backend devuelve
`responsePlan.canSend=false` y razón `LAB_RECOVERY_*`; no reconstruye texto a
partir de un hash, no crea otro recibo ni habilita SOURCE.

La respuesta HTTP por sí sola **no prueba entrega WhatsApp**: en el cliente
se mantiene la autoridad del `labTestReplyJournal` y la comprobación de
etiqueta en mensajes salientes. El Bridge serializa ciclos de procesamiento LAB
en un solo proceso para evitar dos `Enter` simultáneos para el mismo mensaje.

**Límite explícito:** si el proceso falló antes de persistir el recibo, si el
resultado depende de estado canónico cambiante, o si el PR #898 todavía no está
integrado, este mecanismo no recupera esa respuesta dinámica. Esos casos
permanecen `REVIEW_REQUIRED` y requieren una autoridad de respuesta versionada
y pruebas reales; #899 no debe cerrarse por el merge de código.

Las pruebas unitarias y de contratos se versionan en GitHub, pero no sustituyen
un fault-injection real (commit/timeout/restart), Postgres aislado y QA de
WhatsApp Windows con dos sesiones en LAB.

## Recuperación de estado/llegada LAB con prueba de revisión (#899 fase 2)

`POST /api/v1/hipico-bot/bridge/lab/query` dispone de un recibo de **solo lectura**
para preguntas `purpose=status` y `purpose=result` cuando el read model canónico
verificó el agregado y expone `state`, `version`, `updatedAt` y respuesta textual.
Se conserva el **digest SHA-256** del texto y el fingerprint de versión en
`HipicoResponseReceipt` ANTES de responder HTTP, sin persistir el cuerpo.
La clave vincula owner, SOURCE, grupo y canal LAB, remitente e ID de mensaje.

Si el HTTP falla después de guardar el recibo y antes del `prepare` local,
el Bridge reintenta **una sola vez con el mismo envelope**. El backend vuelve
a leer el agregado: exige el mismo estado, revisión, timestamp, propósito,
hash de respuesta, política, identidad y recibo sin evidencia financiera.
Tras una corrección o cambio de versión devuelve
`LAB_CANONICAL_REVISION_CHANGED` y solicita una consulta nueva, sin datos antiguos.
El handoff humano global o de carrera, falta de persistencia, consulta antigua
(más de 90 segundos) y cualquier inconsistencia de recibo bloquean la recuperación.

Una respuesta HTTP exitosa NO confirma entrega WhatsApp. El Bridge mantiene
`labTestReplyJournal.prepare → begin → Enter → confirm` y reconciliación por
etiqueta, nunca reintenta un Enter ambiguo. SOURCE no obtiene permiso de envío.

**Límites:** los propósitos `next/active/schedule/participants` no tienen
todavía una revisión canónica suficientemente fuerte para usar este recibo.
No garantiza snapshot serializable entre lectura y una corrección concurrente.
Faltan fault-injection PostgreSQL, WhatsApp Windows físico y soak 24–72h;
por ello #899 sigue abierto. Los tests locales no sustituyen esos gates.
