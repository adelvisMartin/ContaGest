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
