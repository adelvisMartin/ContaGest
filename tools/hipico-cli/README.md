# Control Hípico CLI (Windows)

CLI operacional de solo lectura/diagnóstico para Control Hípico. No contiene lógica de clasificación, persistencia de negocio ni automatización monetaria.

## Preparación (una sola vez o al actualizar)

Desde PowerShell 7+ en la raíz del repositorio:

```powershell
.\HIPICO-SETUP.ps1
```

El setup instala las dependencias bloqueadas del Bridge con `npm ci`. El launcher diario **no** reinstala dependencias.

## Uso diario

PowerShell:

```powershell
.\HIPICO.ps1 status --json
.\HIPICO.ps1 doctor
.\HIPICO.ps1 bridge status --json
.\HIPICO.ps1 channel status --json
.\HIPICO.ps1 groups --json
.\HIPICO.ps1 messages tail 25 --json
.\HIPICO.ps1 events tail 25 --json
.\HIPICO.ps1 trace correlation-id --json
```

CMD:

```bat
HIPICO.cmd status --json
HIPICO.cmd doctor
```

## Configuración

- `HIPICO_API_BASE_URL`: backend. Por defecto `http://127.0.0.1:3030`. Fuera de loopback el CLI exige HTTPS.
- `HIPICO_GROUP_BRIDGE_TOKEN`: necesario sólo para `bridge status` y el check Bridge de `doctor`.
- `HIPICO_OPERATOR_CONTROL_TOKEN`: necesario para `messages tail`, `events tail` y `trace`.

Los tokens se envían únicamente en headers; la salida JSON y humana aplica redacción recursiva y nunca debe imprimir secretos.

`groups` no lista JIDs ni identidades privadas. Informa únicamente si SOURCE/LAB están correctamente pinneados según el estado canónico del backend.

`trace` examina una ventana máxima de 100 eventos autorizados y filtra localmente por `correlationId`; no crea una segunda API de trazas ni modifica estado.

## Límites de seguridad

- Solo GET.
- Redirects bloqueados.
- Timeout de 10 segundos.
- Respuesta máxima: 1 MiB.
- Tail máximo: 100 registros.
- HTTP remoto prohibido; sólo HTTPS o loopback local.
- Ningún comando ejecuta acciones monetarias ni envíos a SOURCE.
