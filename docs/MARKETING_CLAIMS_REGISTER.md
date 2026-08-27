# ContaGest — Registro de claims de marketing

Toda página, propuesta o anuncio debe usar claims verificables. Este documento es la fuente de verdad editorial del sitio comercial público.

## Estados públicos (Issue #25)

Cada claim visible debe encajar en uno de estos estados:

- **Disponible:** existe implementación comprobable en el producto y el texto no promete más que esa implementación.
- **Condicional:** requiere proveedor, canal, configuración o ambiente concreto. Nunca presentarlo como universal.
- **Planificado/Beta:** existe objetivo, prototipo o trabajo parcial, pero no evidencia suficiente para venderlo como disponibilidad general.
- **Prohibido sin evidencia:** garantía absoluta, certificación o integración que el repositorio/ambiente no puede demostrar.

El sitio público puede explicar por qué una capacidad está Planificada o Condicional. Esa explicación no convierte el claim en disponible.

## Permitidos hoy

- ERP modular con ventas, inventario, contabilidad, bancos y reportes según módulos habilitados.
- Aislamiento lógico por empresa/tenant en backend y políticas implementadas en tablas protegidas, sin convertirlo en una garantía absoluta de seguridad.
- Roles y permisos por usuario.
- Licencias ligadas a empresa, usuario, vigencia, módulos y activaciones.
- PWA instalable y responsive.
- Soporte de importes/tasas VES/USD dentro del producto.
- Vertical de salud con pacientes, profesionales, agenda, historia clínica, mediciones y seguimiento según módulos habilitados.
- Vertical veterinaria con expedientes animales, tutores, consultas, prescripciones, laboratorios/estudios y flujos de hospitalización/procedimientos según módulos habilitados.
- Vertical de gimnasio con clientes, membresías, check-in, clases, instructores, evaluaciones, rutinas y nutrición según módulos habilitados.
- Administración comercial de clientes/suscripciones, empresas cubiertas, módulos, pagos, renovaciones y comisiones cuando el despliegue que se promociona contiene la versión correspondiente.

## Permitidos después de liberar y verificar el ambiente correspondiente

- Sesión web con cookies HttpOnly/Secure/SameSite y refresh rotatorio.
- Protección CSRF para operaciones autenticadas por cookie.
- Credencial de dispositivo emitida por servidor.
- Administración multiempresa por membresías/suscripciones autorizadas en el ambiente comercial que se esté promocionando.

No asumir que un merge equivale a despliegue productivo verificado. Cuando un claim dependa del ambiente, validar ese ambiente antes de una campaña pública.

## Condicionales

- IA: indicar proveedor/configuración; distinguir motor operativo/offline.
- WhatsApp/SMS/email: solo si proveedor/canal está contratado y configurado.
- Backup externo/retención inmutable: solo donde esté configurado y se haya probado restore.
- Tasa BCV automática: solo si fuente/configuración productiva está activa y monitoreada.
- Migraciones, importaciones e integraciones especiales: cotizar según alcance; no tratarlas como incluidas por defecto.

## Planificados / Beta hasta evidencia productiva

- Validación SENIAT en tiempo real.
- Conciliación automática con bancos nacionales de forma general.
- Cualquier canal o integración que exista solo como configuración, placeholder, prototipo o contrato sin proveedor operativo.

El sitio puede mostrarlos con etiqueta **Planificado** o **Beta** únicamente si el texto deja claro que no forman parte de la disponibilidad general actual.

## Prohibidos sin evidencia adicional

- "Inhackeable", "100% seguro", "seguridad blindada".
- "Cifrado de extremo a extremo" para toda la app: TLS, cifrado en tránsito y hashing no equivalen a E2EE.
- "Cumplimiento fiscal garantizado" o "100% SENIAT".
- "Validación SENIAT en tiempo real" como capacidad disponible sin integración activa/testeada.
- "Conciliación automática con todos los bancos nacionales" sin conectores reales.
- "Backups cada hora" si el entorno no lo hace y monitorea.
- "Soporte 24/7" sin guardia/SLA.
- "HIPAA/GDPR/ISO/SOC 2" sin alcance y auditoría correspondiente.
- Testimonios, ratings, número de clientes, ahorro porcentual o resultados cuantificados que no tengan evidencia trazable.

## Precios

La fuente editorial es `docs/COMMERCIAL_PRICING_V1.md`.

- Los importes públicos se etiquetan como **referencia** o **precio objetivo** mientras `Subscription.amount`, ciclo, límites y contrato sean la fuente comercial real.
- No convertir el descuento fundador, add-ons u onboarding en una garantía universal.
- Los verticales de salud/veterinaria/gimnasio usan la referencia inicial documentada de USD 10–20/mes sobre un plan compatible hasta contar con datos reales de soporte.

## Assets de marca

Assets canónicos v11.15:

- icono de aplicación: `/icons/contagest-app.svg`
- logotipo principal: `/brand/contagest-logo.svg`

No duplicar identidades por vertical ni reutilizar logos heredados en páginas comerciales nuevas.

## Frontera SEO / privacidad

- La **aplicación privada** vive en `/` y usa navegación por `?module=...`; debe permanecer `noindex,nofollow`.
- Login y cualquier módulo autenticado no forman parte del sitemap comercial.
- La **superficie pública indexable** vive bajo `/soluciones/`.
- `robots.txt` y `sitemap.xml` sólo sirven como ayudas de crawling; el control de noindex de la app también debe existir en HTML/headers.

## Trazabilidad

Cada claim público debe tener dueño, evidencia, ambientes donde aplica, fecha de revisión y texto permitido. Claims regulatorios, médicos, fiscales o de seguridad requieren revisión de producto + dominio + legal cuando corresponda.

Ante duda, bajar el claim a **Condicional/Planificado** o retirarlo; nunca elevar una inferencia a promesa comercial.
