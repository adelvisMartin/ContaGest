# ContaGest-VE — FODA PRO v11.15

Este FODA no es marketing. Cada punto debe producir una decisión, dueño y gate.

## Fortalezas

| Fortaleza | Valor real | Cómo explotarla sin exagerar |
|---|---|---|
| Core contable + ventas + inventario + bancos + reportes | cubre el ciclo operativo que más valor genera | vender por resultado: control, trazabilidad y reportes; no por número de pantallas |
| Arquitectura tenant/RIF | reduce mezcla accidental de empresas | pruebas de aislamiento obligatorias en cada módulo nuevo |
| Identidad multiempresa explícita | habilita contador/firma sin unir personas solo por email | selector central y licencias separadas por RIF; enlace solo por flujo autorizado de suscripción |
| Suscripción separada de licencia | permite SaaS profesional | MRR, renovaciones, cupos, módulos y dispositivos independientes |
| PWA/mobile | útil con conectividad variable | presupuestos/consulta/control desde móvil; medir offline real antes de prometerlo |
| Localización Venezuela Bs/USD | adaptación de mercado | mantener BCV/fiscalidad como integraciones verificadas, no claims absolutos |
| Verticales opcionales | amplía mercado sin fragmentar el ERP | mantener Salud/Vet/Fitness como entitlements, no forks del producto |
| Seguridad server-side mejorada | HttpOnly, CSRF, sesión server-side, credencial de dispositivo | vender confianza respaldada por controles, nunca “inhackeable” |
| RIF inmutable en runtime | reduce fraude, error y tenant confusion | corrección excepcional solo con evidencia, doble revisión y migración/workflow controlado |
| RBAC plataforma/tenant reforzado | reduce escalamiento desde una empresa hacia backoffice SaaS | `platform.manage` explícito + allowlist API + `Role.scope`/trigger DB |
| Secretos de licencia desacoplados | continuidad del licenciamiento independiente de DB/service-role | producción exige `LICENSE_HASH_SECRET` explícito y estable |
| Portabilidad self-host | reduce lock-in/costo inicial | VPS cuando haya ingresos; managed cloud cuando el riesgo/ROI lo justifique |

## Debilidades

| Debilidad | Severidad | Acción | Gate |
|---|---:|---|---|
| Semántica histórica `Role.system` aún existe en el modelo | P1 residual | bypass críticos ya migrados a `platform.manage`; API RBAC y DB ya impiden autoescalamiento. Falta prueba HTTP tenant-admin → platform 403 y limpieza conceptual (#27) | bloquear main hasta E2E |
| Suspensión manual todavía puede expresarse por cambio genérico de estado | **P1** | `ServiceRestrictionCase`, endpoint dedicado, reasonCode/evidencia/revisión y bloquear transición restringida por PATCH (#30) | bloquear main |
| CI no reconstruye todavía toda la cadena v11.15 sobre PostgreSQL real efímero | **P1** | servicio Postgres + migraciones + pruebas RIF/maxTenants/maxUsers/RBAC/legal (#28) | bloquear main |
| Tablas SaaS/legales dependen en gran parte de SQL y no todo está reflejado en Prisma | P1/P2 | definir fuente canónica e incorporar modelos/extensiones para evitar schema drift | antes de siguiente expansión DB |
| Browser QA usa mocks para gran parte del backend | P2 | E2E API+DB real para login, aceptación, tenant switch, suscripción, suspensión y licencias | antes de primer cliente |
| Guard global de navegación usa `[data-route]` demasiado ampliamente | P2 | limitarlo a controles interactivos o separar `data-active-route`; el modal legal ya quedó aislado | siguiente refactor frontend |
| Producto sin clientes productivos ni datos de soporte/churn | comercial | piloto controlado + instrumentación | antes de escalar gasto |
| CSS/JS legacy coexistiendo con design system | P2 | nuevas vistas solo tokens/componentes; migración incremental | deuda trimestral |
| versión técnica aún aparece 11.14/11.12 en algunos manifests, health y metadata | P2 | bump coordinado al preparar release | antes de release v11.15 |
| RIF visual de Settings todavía puede depender de estado local | P2 | hidratar identidad fiscal exclusivamente desde API `/tenants` y tratar backend como fuente autoritativa | antes de cliente real |
| corrección legítima de RIF requiere procedimiento administrativo manual | P2 | workflow platform-only, expediente SENIAT/representante, doble aprobación y auditoría | antes de volumen alto |
| aceptación legal guarda IP completa | privacidad P2 | definir necesidad y retención; evaluar truncado/minimización con asesor jurídico | revisión legal |
| aceptación prueba contenido mediante versión + hash + Git, no snapshot inmutable DB | P2 | `LegalDocumentVersion` inmutable/artefacto firmado para madurez enterprise | antes de clientes enterprise |
| Salud técnicamente disponible antes de madurez regulatoria | **P1 producción** | feature gate de datos clínicos reales + addendum/revisión especializada | bloquear Salud real |
| bus factor/soporte concentrado | negocio | runbooks, knowledge base, escalamiento y accesos de emergencia | al superar primeros clientes |

## Oportunidades

| Oportunidad | Propuesta | Experimento medible |
|---|---|---|
| Contadores multiempresa | 3 RIF incluidos + adicional por empresa; mismo usuario autorizado, datos separados | 5 contadores piloto; tiempo de cambio/cierre por empresa y errores de tenant |
| PyMEs que migran de Excel | importación guiada + inventario/ventas/reportes | medir tiempo de onboarding, conciliación y correcciones |
| Vendedores/comercios | plan simple sin ruido clínico/ERP innecesario | activación <1 hora + primer reporte el mismo día |
| Partners/vendedores | comisión trazada sobre pagos confirmados | CAC por partner vs venta directa |
| Verticales | packs Salud/Vet/Fitness después de validar core | vender addon solo cuando tenga workflow y cumplimiento apropiados |
| White label | ingreso adicional | no abrir hasta estabilizar soporte/marca |
| IA | conciliación, análisis y asistencia contextual | cada función muestra fuente/limitaciones; revisión humana en fiscal/clínico |
| Operación de bajo costo | self-host financiado por onboarding | costo infraestructura / MRR bajo objetivo FinOps |
| Confianza contractual | aceptación versionada + política de suspensión proporcional | medir reclamos, activación y claridad del onboarding |

## Amenazas

| Amenaza | Impacto | Mitigación |
|---|---|---|
| Odoo y ERPs maduros ofrecen multiempresa y ecosistemas grandes | alto | especialización Venezuela, UX más simple para contador/PyME y soporte cercano; no intentar igualar todo el ecosistema |
| competidores locales especializados | alto | workflows verificables y velocidad de implementación, no guerra de claims |
| cambios fiscales/tributarios | alto | módulo normativa, versionado de reglas y disclaimer profesional |
| brecha de datos financieros/médicos | crítico | AppSec, least privilege, backup, incident response, health production gate |
| abuso de licencia/cambio de RIF | alto | RIF inmutable, SubscriptionTenant, credencial dispositivo y límites DB |
| escalamiento tenant → plataforma | crítico | allowlist RBAC, `platform.manage`, `Role.scope`, trigger DB y E2E negativo pendiente |
| conectividad venezolana | alto | PWA, caché segura y diseño tolerante; medir offline antes de prometer |
| costo de soporte > ARPA | alto | límites de soporte, onboarding pagado, knowledge base y telemetry opt-in |
| fluctuación de cloud/precios | medio/alto | Docker, VPS/managed interchangeable, FinOps gates |
| suspensión arbitraria/ambigua | alto legal/reputacional | motivo codificado, proporcionalidad, aviso, revisión, expediente y AuditLog (#30) |
| rotación accidental del secreto de licencias | alto operativo | secreto independiente/estable, gate de producción y política de custodia ya implementada |
| proveedor único/persona única | alto | backups offsite, runbooks, acceso de emergencia y documentación |

## Comparación estratégica con ERPs maduros

“Multiempresa” por sí sola no debe ser el claim principal. La diferenciación buscada es la combinación de flujo sencillo para contador/PyME venezolana, aislamiento por RIF, contabilidad/reportes relevantes, ventas/inventario y un modelo comercial modular que no obligue a pagar verticales que el cliente no usa.

## Prioridades derivadas

1. Cerrar #30: suspensión/terminación con motivo estructurado y expediente.
2. Cerrar #28: migraciones y E2E anti-tenant sobre PostgreSQL real dentro de CI.
3. Cerrar #27 mediante el test HTTP negativo real y retirar semántica residual peligrosa de `system`.
4. Hidratar RIF autoritativo desde backend y mantenerlo inmutable en todas las vistas.
5. Completar gate legal/proveedor (#29) y decidir retención de IP/evidencia legal.
6. E2E real: primer acceso → aceptación → switch tenant → operación → suspensión → reactivación.
7. Resolver schema drift SaaS/Prisma antes de expandir el dominio comercial.
8. Solo después marcar PR #20 listo para review de merge.
