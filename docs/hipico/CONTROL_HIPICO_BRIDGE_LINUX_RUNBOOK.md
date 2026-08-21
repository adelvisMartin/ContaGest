# Runbook · Control Hípico WhatsApp Bridge en Linux

Estado objetivo de este runbook: **hosted shadow worker**, sin privilegios root durante ejecución, con persistencia del perfil/colas, secretos fuera de Git, logs JSON en journald y respuestas LAB deshabilitadas por defecto.

> Riesgo operativo: este Bridge automatiza WhatsApp Web mediante un navegador real. No es la API oficial de WhatsApp para grupos y puede requerir revinculación, dejar de funcionar por cambios del DOM o quedar sujeto a las políticas/limitaciones de WhatsApp. Por eso el grupo fuente permanece solo lectura y toda automatización monetaria continúa bloqueada.

## 1. Prerrequisitos del host

Usar un servidor Linux dedicado o una VM. Recomendación base: Ubuntu 24.04 LTS, Node.js 22 LTS, Google Chrome estable, `xvfb` y `x11vnc` solo para el emparejamiento inicial.

La instalación de paquetes y de las unidades systemd requiere privilegios administrativos, pero **el proceso del Bridge no corre como root**.

Crear el usuario de servicio sin login interactivo y los directorios protegidos:

```bash
sudo useradd --system --home /var/lib/control-hipico-bridge --shell /usr/sbin/nologin controlhipico || true
sudo install -d -o root -g root -m 0755 /opt/control-hipico-bridge/releases
sudo install -d -o root -g controlhipico -m 0750 /etc/control-hipico-bridge
sudo install -d -o controlhipico -g controlhipico -m 0700 /var/lib/control-hipico-bridge
```

No copiar a este servidor el perfil activo de Windows. El servidor debe vincular su propio dispositivo de WhatsApp para no corromper ni invalidar el runtime que esté operativo en `%LOCALAPPDATA%`.

## 2. Publicar una release inmutable

Desde un checkout aprobado, copiar el repositorio a un directorio identificado por SHA y preparar dependencias con lockfile:

```bash
SHA=<commit-aprobado>
sudo install -d -o root -g root -m 0755 "/opt/control-hipico-bridge/releases/$SHA"
sudo rsync -a --delete --exclude node_modules ./ "/opt/control-hipico-bridge/releases/$SHA/"
cd "/opt/control-hipico-bridge/releases/$SHA/tools/hipico-whatsapp-web-bridge"
sudo npm ci --omit=dev --no-audit --no-fund
sudo ln -sfn "/opt/control-hipico-bridge/releases/$SHA" /opt/control-hipico-bridge/current
```

No ejecutar `npm install` sin lockfile en producción. El código bajo `/opt` queda de solo lectura para el usuario `controlhipico`; únicamente `/var/lib/control-hipico-bridge` contiene estado mutable.

## 3. Configurar secretos y fail-safe

Copiar `deploy/linux/bridge.env.example` a `/etc/control-hipico-bridge/bridge.env`, editarlo localmente en el servidor y protegerlo:

```bash
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/bridge.env.example /etc/control-hipico-bridge/bridge.env
sudo chown root:controlhipico /etc/control-hipico-bridge/bridge.env
sudo chmod 0640 /etc/control-hipico-bridge/bridge.env
```

Valores obligatorios antes de producción:

- `HIPICO_GROUP_BRIDGE_TOKEN`: token largo y aleatorio, idéntico al secreto backend autorizado.
- URLs HTTPS del ingest y health endpoint.
- `HIPICO_LAB_SEND_ENABLED=false` durante observación inicial.
- `HIPICO_LAB_TEST_INPUT_ENABLED=false` en el worker hospedado hasta una ventana QA explícita.
- `HIPICO_DIAGNOSTIC_SCREENSHOTS_ENABLED=false` para evitar persistir chats accidentalmente.

El kill switch inmediato para mensajes salientes es:

```text
HIPICO_LAB_SEND_ENABLED=false
HIPICO_LAB_TEST_INPUT_ENABLED=false
```

Después de cambiarlo: `sudo systemctl restart control-hipico-bridge`.

## 4. Vinculación QR segura

El servicio normal usa Xvfb y no publica escritorio remoto. Para el primer QR se habilita **temporalmente** un VNC ligado solo a loopback y se entra mediante túnel SSH.

1. Detener el worker: `sudo systemctl stop control-hipico-bridge`.
2. Preparar una contraseña VNC fuera del repositorio: `sudo x11vnc -storepasswd /etc/control-hipico-bridge/vnc.pass` y `chmod 0640` con grupo `controlhipico`.
3. Lanzar una sesión temporal con el mismo usuario y el mismo directorio de estado. Un ejemplo operativo es iniciar `Xvfb :91 -screen 0 1366x768x24 -nolisten tcp`, luego `x11vnc -display :91 -localhost -rfbauth /etc/control-hipico-bridge/vnc.pass`, y finalmente el Bridge como `controlhipico` con `DISPLAY=:91`.
4. Desde el equipo del propietario abrir un túnel SSH, por ejemplo `ssh -L 5901:127.0.0.1:5900 servidor`, conectar el cliente VNC a `127.0.0.1:5901`, abrir WhatsApp Web y escanear el QR desde **Dispositivos vinculados**.
5. Confirmar que el perfil quedó bajo `/var/lib/control-hipico-bridge/chrome-profile`.
6. Cerrar VNC y Xvfb temporal; no dejar el puerto VNC escuchando en red.
7. Iniciar el servicio systemd y comprobar health.

No almacenar ni adjuntar capturas del QR a issues, PRs, logs o chats.

## 5. Instalar systemd

```bash
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/control-hipico-bridge.service /etc/systemd/system/
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/control-hipico-bridge-health.service /etc/systemd/system/
sudo cp tools/hipico-whatsapp-web-bridge/deploy/linux/control-hipico-bridge-health.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now control-hipico-bridge
sudo systemctl enable --now control-hipico-bridge-health.timer
```

La unidad aplica `NoNewPrivileges`, filesystem protegido, capacidades vacías, `UMask=0077`, límites de CPU/memoria/tareas y ejecuta como `controlhipico`. El código 42 no se reinicia en bucle: indica que el perfil de navegador requiere una reparación/revinculación controlada.

## 6. Health, logs y observabilidad

Estado y logs:

```bash
systemctl status control-hipico-bridge --no-pager
journalctl -u control-hipico-bridge -n 200 --no-pager
sudo -u controlhipico /usr/bin/node /opt/control-hipico-bridge/current/tools/hipico-whatsapp-web-bridge/src/healthcheck.mjs --ready
systemctl list-timers control-hipico-bridge-health.timer
```

`server-runner.mjs` convierte stdout/stderr del runtime en líneas JSON para journald. `healthcheck.mjs` falla si `health.json` está ausente/obsoleto, si `sourceSendPossible` deja de ser `false` o si `readiness.ready` no está verdadero con `--ready`.

Alertar como mínimo por:

- health timer fallando 2 veces consecutivas;
- `backend.state` distinto de `online` por más de 5 minutos;
- crecimiento sostenido de `eventSpool` o `deadLetters`;
- código de salida 42;
- revinculación QR requerida;
- cualquier evidencia de `sourceSendPossible != false`.

## 7. Backups y recuperación

Respaldar, cifrado en reposo, únicamente el estado necesario:

- `chrome-profile/` (material sensible de sesión vinculada);
- `spool-events/`;
- `spool-lab-mirror/` si se utiliza QA LAB;
- `seen-source-message-ids.json` y estado de reintentos;
- journal shadow cuando sea necesario para auditoría.

No copiar el perfil a repositorios ni artefactos CI. Antes de restaurar, detener el servicio. Verificar dueño `controlhipico:controlhipico` y permisos 0700/0600.

## 8. Actualización y rollback

Cada release usa un directorio por SHA. Para actualizar:

1. Validar la nueva rama/commit fuera de producción.
2. Detener el servicio.
3. Crear `/opt/control-hipico-bridge/releases/<nuevo-sha>` y ejecutar `npm ci`.
4. Cambiar el symlink `current` de forma atómica.
5. Iniciar y verificar health, fuente solo lectura, spool y backend.

Rollback: detener, apuntar `current` al SHA anterior y reiniciar. No borrar `/var/lib/control-hipico-bridge` durante rollback.

## 9. Gate de habilitación LAB

El servidor comienza en observación: captura, clasifica, persiste shadow y genera evidencia, pero no responde. Para una ventana QA autorizada, cambiar temporalmente `HIPICO_LAB_SEND_ENABLED=true` **solo después de verificar el LAB correcto**, reiniciar, ejecutar la prueba controlada y volver el flag a `false` al terminar.

La rama actual todavía debe reforzar el pinning por identificador estable del grupo (`@g.us`) además del nombre visible antes de considerar cerrado ese gate. Hasta que exista y se valide ese ID, el worker hospedado debe mantener envío LAB apagado.

## 10. Criterio de salida

Este runbook no convierte por sí solo el Bridge en `PRODUCTION READY`. El release solo puede avanzar cuando haya evidencia reproducible de:

- lectura del grupo fuente sin posibilidad de escritura;
- LAB explícitamente autorizado y pinneado por ID/nombre;
- deduplicación/reintentos;
- backend/Supabase persistente y aislado;
- recuperación tras caída de red/browser;
- QA en host Linux real;
- plan de backup/rollback probado;
- aceptación explícita del riesgo de automatización de WhatsApp Web.
