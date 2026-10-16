# ContaGest · primeros diez tickets P0 — matriz de implementación real

**Candidato:** se vinculará al SHA de merge de este PR. **Tickets:** #1011, #751, #785, #774, #775, #776, #778, #780, #781, #782. **Estado general:** INCREMENTO PARCIAL DE CÓDIGO, no DoD de diez tickets. No introducir tasas fiscales venezolanas sin provenance revisada.

## Autoridad y dependencias

La autoridad fiscal vigente en `backend/src/modules/fiscal/fiscal.repository.ts` usa `FiscalRuleVersion`, `FiscalDocumentRuleSnapshot`, `resolveFiscalRules`, `fiscalEvidenceHash` y snapshots persistidos; rutas en `fiscal.routes.ts`. La autoridad contable es `backend/src/modules/accounting/` y `chart-accounts/`. No se crea una segunda DB. El nuevo módulo `ve-reviewed-rule-policy.ts` es un **guard puramente funcional**: una base para endurecer estas authorities cuando existan migraciones y reviewed legal sources, **todavía no se invoca** desde fiscal.routes y no bloquea ni altera transacciones actuales. No constituye fiscalización o cumplimiento legal certificado.

| Ticket | Implementación de esta entrega | Necesario para terminar el ticket (pendiente) |
| --- | --- | --- |
| #1011 · Messenger manual | Campo vacío editable, fuente y fecha visibles, casilla de revisión, copia explícita, cancelación, limpieza al cerrar; guías actualizadas según #1120 | UX/privacidad/accesibilidad física, consentimiento/opt-out, review oficial de autorización de plataforma; SOURCE automático continúa NO_GO |
| #751 · legal provenance | Guard puro para fuente con SHA-256, review UTC, version, status ACTIVE, selector/tenant y vigencia sin fechas ambiguas; snapshot de cálculo SHA-256 | Persistir LegalSource/review/activación, RBAC/admin, ciclo de supersession, PG17 from-zero/upgrade, integración real con FiscalRuleVersion/snapshots |
| #785 · semantic account roles | Previsualización inerte de asiento con sumas Debe/Haber enteras e igualdad exacta | Mapping tenant-role↔cuenta, naturaleza/postable, journal real, UI, auditoría, PG17 conciliación y migración |
| #774 · tenant tax profile | Aislamiento tenant y selector obligatorios antes de seleccionar reglas | RIF/jurisdicción/actividades/condición tributaria server-derived versionados, auditoría, API/UI, RLS |
| #775 · IVA + retención | Familia IVA/RET_IVA exige fuente y regla aprobada, sin tasa inventada | Reglas legales concretas, certificados, reversos, documents/posting, API/RLS y pruebas |
| #776 · ISLR | Familia ISLR cerrada sin regla activa revisada | Conceptos, tipo de beneficiario, bases/mínimos, certificados, posting y reconciliación |
| #778 · IGTF | Familia IGTF cerrada sin fuente vigente | Selectores moneda/medio/evento, documentación, posting/snapshots reales |
| #780 · municipal | Familia MUNICIPAL cerrada sin provenance | Catálogo municipio/actividad, perfil tenant, reglas y retenciones/obligaciones |
| #781 · parafiscales | Familias FAOV/IVSS/INCES cerradas sin provenance | Integración payroll, bases/riesgo/periodicidad, débito/crédito por trabajador-patrono |
| #782 · libros IVA | Snapshot puro con hash determinista de regla, sin reinterpretación de tasa | Libros de ventas/compras derivados de documentos, notas/créditos, cierres y hash de período reproducible |

## Seguridad y alcance de la entrega

- `ve-reviewed-rule-policy.ts` **no se integra con rutas/DB**, y no contiene tipos/rates legales predeterminados. La única base monetaria admitida por el preview es un entero seguro en unidades menores; cálculo con `BigInt` y redondeo half-up. Un denominador cero, fechas inválidas, revisión ausente, tenant ajeno, vigencias ambiguas o asientos desbalanceados fallan cerrados.
- Los snapshots en memoria incluyen una huella SHA-256 de la provenance y del cálculo, pero para considerarlos históricos **deben persistirse** en la autoridad fiscal real y verificarse frente a la regla aplicada.
- No se modifica ledger, estado de facturas, períodos cerrados, migraciones, licencias, SOURCE o configuración de producción. El centro de sugerencias no permite lectura de chats ni comunicación externa y no almacena el borrador.
- Faltan QA completo de fuente/PG17/Tenant A-B, revisión normativa, CI y aceptación de los diez tickets. **No cerrar los issues** por fusionar este PR. El usuario pidió posponer QA al final; la política de repository no permite convertir un gate no ejecutado en PASS.
- Orden próximo: terminar #1011 manual QA y #751 persistencia/reviewer/effectivity; después #785/#774; solo con esa base integrar las seis familias fiscales y los libros.

## Verificación focal

```sh
node --experimental-strip-types --test tests/ve_reviewed_rule_policy_v751.test.mjs
node --test tests/hipico_manual_messenger_suggestion_v1011.test.mjs
node --check frontend/public/hipico-control/assets/js/operational-copy-center.js
```

QA PostgreSQL17, navegadores y dispositivos **NOT_EXECUTED**. Ningún gate remoto de GitHub se desactiva. Rollback: revertir estos archivos; no existen migraciones ni datos que restaurar.
