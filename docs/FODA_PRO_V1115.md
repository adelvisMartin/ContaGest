# ContaGest-VE — FODA PRO v11.15

Este FODA no es marketing. Cada punto debe producir una decisión, dueño y gate.

## Fortalezas

| Fortaleza | Valor real | Cómo explotarla sin exagerar |
|---|---|---|
| Core contable + ventas + inventario + bancos + reportes | cubre el ciclo operativo que más valor genera | vender por resultado: control, trazabilidad y reportes; no por número de pantallas |
| Arquitectura tenant/RIF | reduce mezcla accidental de empresas | pruebas de aislamiento obligatorias en cada módulo nuevo |
| Identidad multiempresa | habilita contador/firma sin duplicar identidad | selector central y licencias separadas por RIF |
| Suscripción separada de licencia | permite SaaS profesional | MRR, renovaciones, cupos, módulos y dispositivos independientes |
| PWA/mobile | útil con conectividad variable | presupuestos/consulta/control desde móvil; medir offline real antes de prometerlo |
| Localización Venezuela Bs/USD | adaptación de mercado | mantener BCV/fiscalidad como integraciones verificadas, no claims absolutos |
| Verticales opcionales | amplía mercado sin fragmentar el ERP | mantener Salud/Vet/Fitness como entitlements, no forks del producto |
| Seguridad server-side mejorada | HttpOnly, CSRF, sesión server-side, credencial dispositivo | vender confianza respaldada por controles, nunca “inhackeable” |
| Portabilidad self-host | reduce lock-in/costo inicial | VPS cuando haya ingresos; managed cloud cuando el riesgo/ROI lo justifique |

## Debilidades

| Debilidad | Severidad | Acción | Gate |
|---|---:|---|---|
| `Role.system` mezcla rol de negocio con noción de usuario interno | **P1** | crear bandera/rol de plataforma inequívoco; tenant admin no debe saltar licencia/suscripción | bloquear main |
| Tablas SaaS v11.15 creadas por SQL pero no todas modeladas en Prisma | P1/P2 | decidir modelo canónico y eliminar schema drift | antes de siguiente expansión DB |
| CI valida mucho código pero no ejecuta todas las migraciones contra PostgreSQL real | **P1** | servicio Postgres efímero + migrate deploy + pruebas de triggers/constraints | bloquear producción; ideal antes de main |
| Browser QA usa mocks para gran parte del backend | P2 | E2E API+DB real para login, aceptación, tenant switch, suscripción y licencias | antes de primer cliente |
| Producto sin clientes productivos ni datos de soporte/churn | comercial | piloto controlado + instrumentación | antes de escalar gasto |
| CSS/JS legacy coexistiendo con design system | P2 | regla: nuevas vistas solo tokens/componentes; migración incremental | deuda trimestral |
| versión técnica aún aparece 11.14 en varios manifests/health | P2 | bump coordinado al preparar release | antes de release v11.15 |
| RIF local de Settings puede quedar desincronizado del tenant autoritativo | P2 | hidratar identidad fiscal exclusivamente desde API de tenant | antes de cliente real |
| corrección de RIF ahora exige migración manual | P2 | workflow platform-only con doble aprobación y evidencia | antes de volumen alto |
| aceptación legal guarda IP completa | privacidad P2 | definir retención; evaluar hash/truncado sin perder evidencia necesaria | revisión legal |
| documento aceptado se prueba por hash + Git, no snapshot DB de texto | P2 | `LegalDocumentVersion` inmutable o artefacto firmado | antes de madurez enterprise |
| Salud técnicamente disponible antes de madurez regulatoria | **P1 producción** | feature gate de datos clínicos reales | bloquear clientes de salud |
| bus factor/soporte concentrado | negocio | runbooks, knowledge base, roles y escalamiento | al superar primeros clientes |

## Oportunidades

| Oportunidad | Propuesta | Experimento medible |
|---|---|---|
| Contadores multiempresa | 3 RIF incluidos + adicional por empresa; mismo usuario, datos separados | 5 contadores piloto; tiempo de cambio y cierre por empresa |
| PyMEs que migran de Excel | importación guiada + inventario/ventas/reportes | medir tiempo de onboarding y errores |
| Vendedores/comercios | plan simple sin ruido clínico/ERP innecesario | activación <1 hora + primer reporte el mismo día |
| Partners/vendedores | comisión trazada sobre pagos confirmados | CAC por partner vs venta directa |
| Verticales | packs Salud/Vet/Fitness después de validar core | vender addon solo cuando tenga workflow completo |
| White label | ingreso adicional | no abrir hasta estabilizar soporte/marca |
| IA | conciliación, análisis y asistencia contextual | cada función debe mostrar fuente/limitaciones; no automatizar decisiones fiscales/clínicas sin revisión |
| Operación de bajo costo | self-host financiado por onboarding | costo infraestructura / MRR < objetivo FinOps |

## Amenazas

| Amenaza | Impacto | Mitigación |
|---|---|---|
| Odoo y ERPs maduros ya ofrecen multiempresa y ecosistemas grandes | alto | especialización Venezuela, UX más simple para contador/PyME y soporte cercano; no intentar igualar todo Odoo |
| competidores locales especializados | alto | foco en workflows verificables y velocidad de implementación, no guerra de claims |
| cambios fiscales/tributarios | alto | módulo normativa, versionado de reglas y disclaimer profesional |
| brecha de datos financieros/médicos | crítico | AppSec, least privilege, backup, incident response, health production gate |
| abuso de licencia/cambio de RIF | alto | RIF inmutable, SubscriptionTenant, credencial dispositivo y límites DB |
| conectividad venezolana | alto | PWA, caché segura y diseño tolerante; medir offline antes de prometer |
| costo de soporte > ARPA | alto | límites de soporte, onboarding pagado, knowledge base y telemetry opt-in |
| fluctuación de cloud/precios | medio/alto | Docker, VPS/managed interchangeable, FinOps gates |
| contrato o política de suspensión abusiva/ambigua | alto legal/reputacional | motivos codificados, proporcionalidad, aviso, revisión y audit log |
| proveedor único/persona única | alto | backups offsite, runbooks, acceso de emergencia y documentación |

## Comparación estratégica con Odoo

Odoo documenta multiempresa, selector de empresas, datos compartidos/específicos y reporting agregado. Por tanto **“tenemos multiempresa” no es diferenciador suficiente**. La oportunidad de ContaGest es hacer ese flujo más sencillo para un contador venezolano, con aislamiento RIF, módulos contables/reportes relevantes y un modelo comercial entendible. No competir por amplitud de ecosistema en esta fase.

## Prioridades derivadas

1. Cerrar P1 de identidad interna vs tenant admin.
2. Ejecutar migraciones en PostgreSQL real dentro de CI.
3. Hidratar RIF autoritativo desde backend y mantenerlo inmutable.
4. Completar gate legal/proveedor.
5. E2E real: primer acceso → aceptación → switch tenant → operación → suspensión → reactivación.
6. Solo después marcar PR #20 listo para review de merge.
