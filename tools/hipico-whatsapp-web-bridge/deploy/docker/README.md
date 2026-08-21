# Control Hípico Bridge · Docker

Este despliegue ejecuta el worker WhatsApp Web v1.4.1 sin root, sin puertos publicados y con estado persistente separado del contenedor.

## Preparación

1. Copia `bridge.env.example` como `bridge.env` en este directorio.
2. Configura el token backend y los IDs estables `@g.us` de fuente/LAB. Nunca subas `bridge.env` a Git.
3. Mantén `HIPICO_LAB_SEND_ENABLED=false` y `HIPICO_LAB_TEST_INPUT_ENABLED=false` durante la primera observación.
4. Construye desde este directorio:

```bash
docker compose build --pull
```

## Vinculación inicial

El volumen `control_hipico_bridge_data` conserva el perfil de Chrome. La primera vinculación QR requiere una sesión gráfica temporal; para servidores sin escritorio se recomienda realizar el binding mediante el procedimiento VNC/SSH documentado en `docs/hipico/CONTROL_HIPICO_BRIDGE_LINUX_RUNBOOK.md` o preparar un perfil dedicado en el mismo host antes de iniciar el contenedor permanente.

No reutilices ni copies a ciegas el perfil activo de Windows.

## Inicio y observabilidad

```bash
docker compose up -d
docker compose ps
docker compose logs -f --tail=200 control-hipico-bridge
```

El contenedor usa:

- usuario `10001:10001`;
- root filesystem de solo lectura;
- `cap_drop: ALL`;
- `no-new-privileges`;
- límites de CPU, memoria y PIDs;
- volumen persistente únicamente para perfil, colas, health y journal;
- healthcheck sin exponer secretos;
- rotación local de logs Docker.

## Kill switch

Para detener cualquier mirror LAB:

```text
HIPICO_LAB_SEND_ENABLED=false
HIPICO_LAB_TEST_INPUT_ENABLED=false
```

Después:

```bash
docker compose up -d --force-recreate
```

El grupo fuente no es un destino de envío del Bridge.

## Backup

Con el servicio detenido, respalda el volumen `control_hipico_bridge_data` cifrado. Contiene material de sesión de WhatsApp y debe tratarse como secreto. No lo adjuntes a PRs, issues ni artefactos CI.

## Actualización / rollback

Construye una imagen por versión/commit, prueba health en QA y conserva la imagen anterior. Para rollback, cambia el tag de imagen, recrea el servicio y reutiliza el mismo volumen de estado. No borres las colas ni el perfil durante rollback.
