# Control Hípico — Windows CLI (#284)

## CMD

Desde la raíz del repositorio:

```bat
set HIPICO_API_BASE_URL=http://127.0.0.1:3030
set HIPICO_OPERATOR_CONTROL_TOKEN=<token-operador>
set HIPICO_GROUP_KEY=<group-key>
HIPICO.cmd status
HIPICO.cmd command-center
HIPICO.cmd events tail --limit 25
```

Para Bridge health:

```bat
set HIPICO_GROUP_BRIDGE_TOKEN=<token-bridge>
HIPICO.cmd bridge status
```

## PowerShell

```powershell
$env:HIPICO_API_BASE_URL = 'http://127.0.0.1:3030'
$env:HIPICO_OPERATOR_CONTROL_TOKEN = '<token-operador>'
$env:HIPICO_GROUP_KEY = '<group-key>'
.\HIPICO.ps1 status
.\HIPICO.ps1 command-center
.\HIPICO.ps1 events tail --limit 25
```

## Reglas operativas

- Los tokens no se pasan por argumentos.
- HTTP solo está permitido para loopback; un backend remoto requiere HTTPS.
- `status`, `readiness` y `version` pertenecen a `/api/v1/hipico/*` y requieren token de operador.
- Las consultas de grupo añaden `x-hipico-group-key`.
- `events stream` mantiene una conexión SSE; use `events tail --json` para una lectura puntual automatizable.
- El código de salida es distinto de cero cuando el comando falla. Scripts operativos deben respetarlo en lugar de ocultar errores.
