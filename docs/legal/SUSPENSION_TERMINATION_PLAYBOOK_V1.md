# Playbook profesional de suspensión, reactivación, cancelación y clausura v1

Este documento traduce la política contractual a operación. **Ningún operador debe inventar motivos libres para cerrar una cuenta.** Toda acción manual requiere categoría, evidencia, actor, timestamp, alcance y ticket/audit log.

## 1. Jerarquía de alcance

Aplicar siempre el menor alcance que controle el riesgo:

1. **Sesión**: revocar una sesión comprometida.
2. **Dispositivo**: revocar `LicenseActivation` concreta.
3. **Usuario**: bloquear un perfil/membresía.
4. **Tenant/RIF**: suspender solo una empresa cubierta.
5. **Subscription**: suspender todas las empresas del contrato.
6. **CustomerAccount**: clausura completa, reservada para fraude/ilegalidad grave, terminación contractual o imposibilidad de continuar.

## 2. Matriz de decisiones

| Evento | Severidad | Aviso previo | Acción inicial | Cuándo escala | Reactivación |
|---|---|---|---|---|---|
| contraseña/sesión comprometida | alta | no si aumenta el riesgo | revocar sesión; reset credenciales | actividad persiste | credenciales nuevas + validar sesiones |
| dispositivo robado/clonado | alta | no | revocar dispositivo | múltiples dispositivos afectados | nueva activación administrada |
| intento de otro tenant/RIF | alta | no ante explotación activa | bloquear sesión/dispositivo, preservar logs | evidencia de evasión deliberada | revisión AppSec + nuevo secreto si aplica |
| malware/ransomware/ataque activo | crítica | no | contención inmediata | cuenta/tenant involucrado | incidente cerrado + controles verificados |
| fraude deliberado/falsificación grave | crítica | no necesariamente | suspensión preventiva | investigación confirma | decisión manual; puede terminarse |
| prueba de seguridad sin autorización que afecta terceros | alta | puede ser posterior | limitar/bloquear origen | reincidencia/daño | alcance autorizado por escrito |
| uso indebido subsanable | media | sí | aviso + 5 días hábiles | no corrige | demostrar corrección |
| compartición no maliciosa de credenciales | media | sí | advertir, revocar sesiones si necesario | repetición dentro de 90 días | capacitación + reset |
| exceder empresa/usuario/dispositivo | media | error inmediato del backend | negar alta extra, no borrar datos | evasión deliberada | contratar cupo o retirar exceso |
| impago | comercial | sí | D0 past_due | fin de gracia | pago confirmado |
| abuso/amenazas al soporte | media/alta | según riesgo | limitar canal/persona, conservar servicio si posible | amenaza real/ilegal | compromiso de canal apropiado |
| orden válida de autoridad | crítica/legal | según orden | cumplir alcance exigido | nueva orden | validación jurídica |
| cierre solicitado por cliente | normal | no sancionatorio | no renovación | fin del ciclo | nueva contratación |

## 3. Impago: cronograma por defecto

El contrato específico puede modificarlo. Si no lo hace:

- **D0 — vencimiento:** `Subscription.status = past_due`; aviso de vencimiento y enlace/instrucción de pago.
- **D+1 a D+5 calendario:** período de gracia por defecto. Recordatorios razonables; sin hostigamiento.
- **D+6:** si no hay pago conciliado, `suspended`. La licencia técnica se conserva para trazabilidad, pero el guard comercial bloquea operaciones.
- **D+23 aprox.:** aviso de riesgo de terminación si la deuda continúa.
- **30 días después de la suspensión:** elegible para terminación comercial.
- **Mínimo 7 días calendario antes de ejecutar terminación:** aviso final, salvo fraude/ilegalidad/imposibilidad jurídica donde no sea razonable.

**Nunca** marcar pago por captura de pantalla únicamente si el medio exige conciliación. Registrar `SubscriptionPayment` y referencia.

## 4. Incumplimiento subsanable

Notificación debe contener:

- cláusula/política afectada;
- hecho concreto, no una acusación genérica;
- alcance afectado;
- evidencia disponible que pueda compartirse sin comprometer seguridad;
- acción requerida;
- fecha/hora límite;
- canal de respuesta;
- efecto si no se subsana.

Plazo operativo: **5 días hábiles** salvo que el contrato indique otro. Repetición sustancial en 90 días puede reducir el período, pero requiere revisión humana.

## 5. Suspensión inmediata de seguridad

Se permite cuando esperar crea riesgo material para confidencialidad, integridad, disponibilidad, fraude u otros tenants. Flujo:

1. preservar logs y request IDs;
2. identificar alcance mínimo;
3. revocar sesión/dispositivo/usuario según proceda;
4. si hace falta, suspender tenant/subscription;
5. abrir incidente con severidad;
6. documentar quién autorizó;
7. notificar cuando hacerlo no empeore la contención;
8. definir criterios objetivos de recuperación.

Para una clausura completa por seguridad, exigir revisión del **AppSec Principal + Release/Operations Principal**; una sola persona no debe crear el hallazgo y cerrar definitivamente la cuenta sin segunda revisión, salvo emergencia temporal.

## 6. Reactivación

### Impago

- pago existe y está conciliado;
- no hay chargeback/fraude pendiente;
- actualizar `Subscription` a active;
- mantener historial de deuda y pagos;
- no emitir una licencia nueva si la vigente puede recuperarse de forma segura.

### Seguridad

- causa contenida;
- contraseñas/secretos rotados si aplicó;
- dispositivos comprometidos revocados;
- malware eliminado o integración retirada;
- AppSec confirma que el riesgo residual es aceptable;
- evento de reactivación en `AuditLog`.

### Incumplimiento contractual

- evidencia de corrección;
- cupos contratados ajustados o uso reducido;
- aceptación de versión contractual si estaba pendiente.

## 7. Terminación/clausura

Puede aprobarse por:

- fraude o ataque deliberado grave confirmado;
- actividad ilícita que impida continuar;
- incumplimiento material no subsanado;
- reincidencia documentada;
- falta de pago superando el proceso pactado;
- falsedad material de identidad/RIF no corregida;
- orden válida o imposibilidad legal;
- cancelación/no renovación solicitada por el cliente.

Antes de una terminación no urgente:

1. confirmar identidad del cliente;
2. comprobar saldo/contrato;
3. revisar datos sujetos a retención/legal hold;
4. generar/exportar inventario de datos cuando corresponda;
5. notificar fecha efectiva;
6. revocar sesiones y credenciales en la fecha efectiva;
7. congelar, no borrar inmediatamente;
8. iniciar ventana de retención/exportación.

## 8. Retención y borrado tras terminación

Política operativa propuesta: **90 días** para solicitar recuperación/exportación administrativa después de terminación, salvo contrato, obligación legal, investigación, disputa o datos clínicos que exijan otro tratamiento. No significa 90 días de acceso normal.

Al finalizar la ventana:

- borrar datos operativos según runbook aprobado;
- permitir que backups expiren por su política normal;
- mantener únicamente evidencia legal/auditoría estrictamente necesaria;
- documentar la ejecución;
- no prometer borrado de datos sujetos a legal hold.

Antes de clientes reales de Salud, sustituir esta regla genérica por una matriz clínica validada.

## 9. Revisión/reclamación

El cliente puede solicitar revisión dentro de **5 días hábiles** de la notificación. La revisión debe ser atendida por alguien distinto del operador que tomó la decisión cuando sea posible. Una suspensión preventiva puede seguir activa durante la revisión si levantarla recrea el riesgo.

## 10. Motivos codificados sugeridos

`SEC_SESSION_COMPROMISED`, `SEC_DEVICE_COMPROMISED`, `SEC_TENANT_ESCAPE_ATTEMPT`, `SEC_MALWARE`, `SEC_ATTACK_ACTIVE`, `FRAUD_IDENTITY`, `FRAUD_PAYMENT`, `BILLING_PAST_DUE`, `CONTRACT_LIMIT_BYPASS`, `CONTRACT_AUP`, `LEGAL_ORDER`, `CUSTOMER_CANCEL`, `PROVIDER_CONVENIENCE`, `DATA_RETENTION_HOLD`.

No usar un campo de texto libre como única causa.
