# Issue #27 — checklist de verificación

- [x] Bypass de login desligado de `Role.system`.
- [x] `platform.manage` exige permiso explícito mediante helper canónico.
- [x] El helper exige `Role.scope=platform`.
- [x] El helper exige tenant interno `00000000`.
- [x] Licencia usa la identidad explícita para cualquier bypass.
- [x] Suscripción usa la identidad explícita para cualquier bypass.
- [x] Aceptación legal usa la identidad explícita para cualquier bypass.
- [x] Selector/switch multiempresa no considera `system=true` como autoridad.
- [x] Migración revoca bindings históricos globales fuera del tenant interno sin crear privilegios nuevos.
- [x] Trigger DB bloquea `platform.*` en roles cliente.
- [x] Auditor estático incorporado a `security-baseline`.
- [x] Test estático dedicado añadido.
- [x] Test HTTP + PostgreSQL real dedicado añadido.
- [x] Workflow PostgreSQL 17 aislado añadido.
- [ ] Workflow ejecutado realmente sobre el SHA final del PR.
- [ ] `typecheck` ejecutado realmente sobre el SHA final del PR.
- [ ] Revisión AppSec/IAM humana o del propietario completada.

Los tres últimos puntos no deben marcarse como aprobados si GitHub termina un job sin asignar runner o sin ejecutar steps.
