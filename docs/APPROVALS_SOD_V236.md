# Aprobaciones y Segregación de Funciones v236

## Objetivo

ContaGest aplica maker-checker únicamente cuando existe una política activa para una capability sensible. La ausencia de política conserva el flujo histórico; activar una versión vuelve obligatoria la aprobación en el servidor para las operaciones que alcancen su umbral.

## Capabilities iniciales

`purchases.issue`, `purchases.cancel`, `banking.payment`, `banking.reverse`, `banking.correct`, `inventory.adjust`, `inventory.reverse`, `fiscal.reopen`, `accounting.post`, `accounting.reverse` y `financial.recovery`.

## Ciclo

1. Un administrador crea una nueva versión de `ApprovalPolicy`. Las versiones anteriores no se reescriben.
2. El maker obtiene el contexto canónico mediante `POST /api/v1/approvals/execution-context` para la operación concreta.
3. Si `required=true`, crea `ApprovalRequest` usando exactamente `capability`, `payload`, `amount` y `currency` devueltos.
4. Checkers habilitados por rol, permiso o delegación vigente deciden. Self-approval falla salvo que la política lo permita explícitamente.
5. Editar el payload crea una nueva revisión, cambia su SHA-256 y devuelve la solicitud a `pending` sin borrar decisiones históricas.
6. La operación productiva se ejecuta normalmente contra su endpoint de dominio agregando `x-approval-request-id`. El gate transversal recalcula el contexto desde el estado actual y rechaza payload, monto o moneda distintos.
7. La aprobación se reclama atómicamente antes del efecto. Doble click o ejecución concurrente no pueden reutilizar la misma aprobación. Un HTTP exitoso termina en `executed`; un error libera el claim para reintento.
8. Al vencer `expiresAt`, el backend materializa el estado `expired` de forma idempotente antes de lecturas operativas, decisiones, revisiones, cancelaciones, break-glass y claims. Una solicitud vencida no puede revivirse mediante edición ni presentarse como `pending` en `mine`/reportes.

`executing` es un estado técnico transitorio para exclusión mutua y no representa una decisión del negocio.

## Seguridad y multi-tenant

Las cuatro tablas están bajo RLS forzada con `private.current_tenant_id()`. Además, todas las consultas del servicio filtran por `tenantId`; una solicitud, política o delegación de A no puede autorizar B. El checker se revalida en el momento de decidir, por lo que un usuario deshabilitado o cuyo rol fue retirado pierde inmediatamente capacidad de aprobación.

Break-glass no es un bypass silencioso: exige `admin.manage`, `reasonCode`, comentario y genera `AuditLog` separado. La delegación exige dos usuarios activos del mismo tenant, intervalo de vigencia y motivo.

## Umbrales

No hay umbrales regulatorios hardcodeados. Cada tenant crea versiones explícitas. `thresholdAmount = null` significa que toda operación de esa capability requiere aprobación. Cuando existe umbral, se aplica inclusivamente (`amount >= threshold`).

## Integración de UI

El workspace operativo se muestra dentro de **Reglas de negocio** y separa claramente `Esperando aprobación` de error/success. Incluye bandeja del checker, solicitudes del maker y aging por capability/estado.

## Recuperación

Si el proceso cae después de reclamar una aprobación y antes de completar la respuesta, puede quedar temporalmente en `executing`. Nunca se debe cambiar a `executed` manualmente sin comprobar primero el efecto de dominio y el `AuditLog`. La recuperación debe reconciliar el recurso objetivo, documentar la evidencia y sólo entonces completar o devolver la solicitud a `approved`.

## Evidencia QA

El workflow `Aprobaciones y SoD v236` reconstruye PostgreSQL desde cero y ejecuta typecheck, contrato estático, pruebas reales de threshold, self-approval, A→B, cambio de payload, decisiones concurrentes, consumo único y delegación temporal. Si GitHub no asigna runner (`runner_id=0`, `steps=[]`), el resultado es infraestructura bloqueada y no un PASS del código.
