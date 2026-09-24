# 58/75 · Shared role access profiles

## Problem

The canonical route manifest governed routes and route permissions, but default role presets were still duplicated:

- frontend `AccessControlService` stored modules and permissions;
- backend RBAC bootstrap stored another permission list.

The two copies had already drifted. Examples included `Contador`, `Demo limitado`, `Inventario`, `RRHH` and clinical profiles with visible routes whose backend bootstrap role did not include the permission required by that route.

## Resolution

A shared role-access contract now owns only access semantics:

- role id;
- enabled canonical modules;
- explicit non-route capabilities;
- optional backend bootstrap metadata.

The runtime validator resolves each profile against the validated access manifest and derives:

- canonical modules;
- route permissions;
- complete frontend permissions.

Frontend keeps visual metadata such as label, tone, description and scope, but no longer owns module/permission arrays.

Backend RBAC bootstrap consumes the same shared profiles and derives its tenant role permissions from `profile.routePermissions`.

## Compatibility

Custom/persisted tenant roles remain editable. If a role id has no shared default profile, `AccessControlService` continues normalizing that saved role from its own modules and explicit permissions.

Non-route frontend capabilities such as `care.manage`, `support.manage` or `fitness.manage` remain explicit capabilities; they are not promoted into canonical route permissions or backend tenant permissions.

## Fail-closed rules

The shared runtime rejects:

- duplicate profile ids;
- unknown module routes;
- duplicate module/capability entries;
- capabilities that duplicate canonical route permissions;
- malformed backend bootstrap metadata;
- duplicate backend role names.

## Corrected drift

After resolution from the shared contract:

- Contador receives the permissions implied by Ventas and module-management routes;
- Demo receives the permissions implied by Ventas and Pedidos;
- Inventario, RRHH, Clínica and Veterinaria receive `audit.view` when Auditoría is enabled.

## Regression

- `tests/shared_role_access_profiles_58_75.test.mjs`
- 54/75 role drift regression retargeted to the shared contract;
- 52/75 nutrition profile regression retargeted to the shared contract.

Remote CI is evaluated on the exact candidate SHA. Pre-runner zero-step failures remain `BLOCKED_INFRASTRUCTURE #134`.
