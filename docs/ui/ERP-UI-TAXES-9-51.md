# 9/51 · Tributos React Cg/MUI

## Objetivo

Migrar `tributos` a React preservando la separación entre alícuotas operativas locales y documentos fiscales server-side.

## Autoridades preservadas

- `Store.quote.taxes`: configuración operativa de tasas/activación;
- `FiscalService.periods`: governance y capacidades del tenant;
- `FiscalService.documents`: lectura de evidencia fiscal;
- `FiscalService.createDocument`: único camino de creación documental;
- HTTP 403 se representa como permission denied/solo lectura;
- payload opcional debe parsear a objeto JSON, nunca array/primitivo.

La UI no convierte configuración tributaria en certificación regulatoria ni bypassa períodos cerrados/RBAC.

## UI

Cards de alícuotas, switches, formulario documental y tabla pasan a un único React root con Cg*/MUI. Estados loading/error/permission denied son explícitos.

## QA

Source contract/audit requerido. Browser 360/390/430/768/1366 permanece `NOT_EXECUTED` mientras #134 bloquee runners.
