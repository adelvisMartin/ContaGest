# Control Hípico Windows CLI (#284)

The CLI is intentionally a thin API client. Daily startup never runs `npm ci`.

## Launch
From CMD:

```bat
HIPICO.cmd status
HIPICO.cmd doctor
HIPICO.cmd bridge status --json
```

From PowerShell 7+:

```powershell
.\HIPICO.ps1 status
.\HIPICO.ps1 doctor
.\HIPICO.ps1 trace corr-123 --json
```

`HIPICO_API_BASE_URL` defaults to `http://127.0.0.1:3030`. Use an HTTPS origin for remote operation. `HIPICO_GROUP_BRIDGE_TOKEN` is read only when a Bridge endpoint requires it and is never printed by the CLI.

Commands currently mapped: `status`, `doctor`, `health`, `version`, `bridge status`, `channel status`, `groups`, `races`, `documents`, `providers`, `messages tail`, `events tail`, `trace <correlationId>`. The CLI never fabricates local data when an API is unavailable.

Install/update remains a separate operational step using the repository lockfile and `npm ci`.
