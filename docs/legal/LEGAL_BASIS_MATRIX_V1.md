# ContaGest-VE — Matriz de bases legales y contractuales v1

**Estado:** borrador de ingeniería/producto para revisión jurídica antes del primer cliente real.  
**Fecha:** 2026-08-09.  
**No sustituye asesoría de un abogado venezolano.** Antes de producción deben completarse razón social/RIF/domicilio/correos del proveedor, jurisdicción, facturación, política de retención y anexos por vertical.

## 1. Principios venezolanos que condicionan el diseño

| Tema | Referencia de trabajo | Implicación para ContaGest | Control implementado |
|---|---|---|---|
| Datos personales en registros | Constitución de la República Bolivariana de Venezuela, art. 28 | El producto debe facilitar conocimiento del uso de datos, corrección cuando proceda y protección frente a usos ilegítimos. | Aviso de privacidad versionado; canal de solicitudes pendiente de configurar con email real; auditoría de aceptación. |
| Vida privada/confidencialidad | Constitución, art. 60 | Debe limitarse el acceso por rol/tenant, evitar exposición innecesaria y documentar finalidades. | RBAC, tenant, cookies HttpOnly, sesiones server-side, política de minimización. |
| Información al consumidor/usuario | Constitución, art. 117 y régimen de consumo vigente que revise el abogado | Precio, alcance, límites, renovación, suspensión y claims deben ser claros y no engañosos. | Separación Subscription/LicenseKey, términos claros, registro de claims, política de suspensión. |
| Mensajes de datos y aceptación electrónica | Decreto-Ley sobre Mensajes de Datos y Firmas Electrónicas | La aceptación electrónica debe ser reproducible y atribuible: versión, contenido, usuario, fecha y método. | `LegalAcceptance` guarda documento, versión, SHA-256, usuario, tenant, timestamp, método, IP/user-agent. |
| Actividad comercial por medios electrónicos | Régimen económico/comercial venezolano vigente | La venta SaaS no deja de estar sujeta a obligaciones por realizarse en web. | Contrato comercial separado de licencia técnica; precios/planes no deben depender de un campo manipulable del cliente. |
| Registros contables/fiscales | Código de Comercio, Código Orgánico Tributario y normativa fiscal aplicable, **a validar en su versión vigente por asesor local** | ContaGest no debe prometer que sustituye la obligación de conservación del cliente. La eliminación automática puede ser incompatible con obligaciones del negocio. | Términos asignan al cliente la conservación legal; terminación contempla exportación y legal hold. |
| Datos de salud/confidencialidad profesional | Constitución + normativa sanitaria, ética y profesional aplicable a cada rama, **requiere revisión especializada** | El módulo Salud no puede pasar a producción real solo porque técnicamente funciona. | Gate específico de privacidad clínica; no se presenta como diagnóstico; addendum pendiente de revisión profesional. |

## 2. Fundamento/justificación del tratamiento por categoría

Venezuela no debe presentarse en la UI como si usara automáticamente la taxonomía del GDPR. Para ContaGest usamos **fundamento/justificación del tratamiento**, y solo hablamos de consentimiento cuando realmente lo pedimos.

| Datos | Finalidad | Justificación de producto | Retención propuesta | Observaciones |
|---|---|---|---|---|
| Cuenta: nombre, email, rol | autenticar y autorizar | ejecutar el servicio solicitado | vida de cuenta + período de cierre/auditoría | evitar reutilización comercial no prevista |
| RIF y razón social | identificar tenant/contrato | ejecutar contrato, facturación, aislamiento | durante relación + obligaciones aplicables | RIF inmutable en runtime |
| Sesión/IP/user-agent | seguridad, fraude, revocación | seguridad del servicio | política de logs definida; minimizar | revisar si IP completa es necesaria a largo plazo |
| Credencial de dispositivo | anti-clonado/licencia | seguridad y cumplimiento contractual | vigencia de activación + auditoría | secreto solo en HttpOnly; DB conserva hash |
| Contabilidad/ventas/inventario | operación del cliente | instrucciones del cliente/contrato | según contrato + obligación legal del cliente | cliente debe exportar y conservar cuando corresponda |
| Salud humana | expediente/operación clínica | instrucciones y deberes del cliente; no habilitar sin evaluación | definir por especialidad y ley aplicable | **gate de producción obligatorio** |
| Veterinaria | operación clínica veterinaria + datos de propietarios | contrato/instrucciones | política por cliente y normativa | separar datos de persona propietaria y animal |
| Fitness | gestión de miembros; puede incluir datos sensibles según captura | contrato + información/consentimientos que correspondan | minimizar | evitar recolectar salud innecesaria |
| Pagos/suscripción | cobrar, renovar, comisiones | contrato y obligaciones comerciales | contable/fiscal aplicable | no guardar tarjetas si un PSP puede tokenizarlas |
| Aceptación legal | probar versión aceptada | evidencia contractual/seguridad jurídica | relación + plazo de defensa/obligaciones, a validar | SHA-256 + Git permiten reconstrucción técnica |
| Analítica backend opcional | mejora de producto | elección separada del usuario | limitada y documentada | default OFF |

## 3. Reglas para documentos de adhesión

1. Español claro y legible para el mercado venezolano.
2. No ocultar precio, renovación, empresas incluidas, usuarios, dispositivos o módulos.
3. No incluir renuncias a derechos inderogables.
4. No utilizar `100% seguro`, `inhackeable`, `cumplimiento total`, `todos los bancos`, `soporte 24/7` ni equivalentes sin evidencia y contrato.
5. Los cambios materiales deben versionarse y notificarse antes de que surtan efecto; el estándar interno de ContaGest será **30 días de aviso cuando sea razonablemente posible** para cambios contractuales planificados, sin aplicar ese plazo a una contención urgente de seguridad.
6. Precio/plan se controla por `Subscription`; `LicenseKey` es acceso técnico, no factura.
7. Términos, privacidad, cookies, uso aceptable y suspensión se aceptan separadamente por versión.
8. Las cookies estrictamente necesarias se explican como requisito técnico del servicio; analítica/marketing no debe agruparse como consentimiento obligatorio.

## 4. Configuración obligatoria antes de clientes reales

Variables requeridas:

- `LEGAL_PROVIDER_NAME`
- `LEGAL_PROVIDER_RIF`
- `LEGAL_PROVIDER_ADDRESS`
- `LEGAL_CONTACT_EMAIL`
- `LEGAL_SUPPORT_EMAIL`

En producción la API de aceptación rechaza el alta legal si siguen los placeholders.

## 5. Decisiones que requieren abogado antes de producción

- Identidad contractual exacta del prestador y capacidad para facturar.
- Ley aplicable, tribunal/arbitraje y domicilio contractual.
- Régimen actual de protección al consumidor y contratos de adhesión aplicable al modelo B2B/B2C.
- Tratamiento fiscal de suscripciones, onboarding, comisiones y servicios digitales.
- Plazos de conservación reales por documentos contables/fiscales.
- Datos médicos: confidencialidad, historia clínica, retención, acceso, incidentes y proveedores internacionales.
- Transferencias internacionales de datos y subprocesadores cuando se elija hosting definitivo.
- Límites de responsabilidad que sean válidos y no abusivos.

## 6. Evidencia técnica

- Fuente canónica runtime: `backend/src/shared/legal/legalCatalog.ts`.
- Aceptaciones: `LegalAcceptance`.
- Preferencias: `CookiePreference`.
- Gate: `requireCurrentLegalAcceptance`.
- RIF: trigger `Tenant_rif_immutable` + `tenants.routes.ts`.
- QA: `tests/v11_15_legal_rif_gate.test.mjs`, `tests/v11_15_legal_frontend.test.mjs`, `qa/legal-first-access.spec.mjs`.
