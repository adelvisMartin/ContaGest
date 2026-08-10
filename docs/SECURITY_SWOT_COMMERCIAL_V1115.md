# ContaGest v11.15 — Seguridad, FODA y modelo comercial

Fecha del análisis: 2026-08-09.

## Resumen ejecutivo

ContaGest ya dispone de aislamiento por tenant, JWT, bcrypt, MFA por tarjeta de coordenadas, CAPTCHA firmado, RBAC de backend, rate limiting, auditoría y licencias por empresa/usuario/dispositivo. El riesgo principal no está en “ofuscar” JavaScript sino en reducir superficies de acceso, separar correctamente secretos y profesionalizar suscripciones/licencias.

## Hallazgos de seguridad

### P0/P1

1. **Acceso PostgREST innecesario a tablas ContaGest.** Aunque RLS limitaba por tenant, `anon` y `authenticated` conservaban grants amplios. La aplicación web no usa `supabase-js`; opera mediante `BackendApi`. Se aplicó la migración `contagest_revoke_direct_rest_access` para retirar esos grants de las tablas ContaGest sin tocar Budget Wallet ni Hípico.
2. **Duplicación de secreto de licencias.** `licenses.routes.ts` deriva hash de clave/dispositivo con `JWT_SECRET`, mientras `licenseGuard.ts` usa `LICENSE_HASH_SECRET`. Antes de emitir licencias reales debe existir una única implementación compartida para hash/verificación y una prueba de regresión que impida divergencia.
3. **Fingerprint de dispositivo no es identidad fuerte.** Un `deviceId` copiado puede ser replicado. Evolución recomendada: credencial de activación emitida por servidor, secreto por dispositivo rotatorio y, para clientes sensibles, WebAuthn/passkey.

### P1/P2

4. **APIs raw SQL marcadas como unsafe.** Los usos actuales emplean parámetros `$1`, pero deben migrarse a `$queryRaw`/`$executeRaw` tipados o Prisma SQL para reducir riesgo de futuras interpolaciones inseguras.
5. **Supabase Auth leaked-password protection deshabilitado.** Hoy ContaGest usa autenticación propia, pero el proyecto Supabase compartido tiene Auth activo para otros productos. Activarlo reduce riesgo general del proyecto.
6. **Proyecto Supabase compartido.** ContaGest, Budget Wallet e Hípico comparten proyecto. Es económico en etapa beta, pero aumenta blast radius, complejidad de advisors y riesgo operacional. Producción comercial debería tener proyecto/organización separados o, como mínimo, políticas, secretos y backups independientes.
7. **Backups Free insuficientes.** Free no aporta backups automáticos y puede pausarse. Para clientes de pago se recomienda Supabase Pro como mínimo y backup lógico externo periódico.
8. **Claims de marketing heredados.** La guía de marca previa afirmaba integraciones/cifrado que no deben anunciarse sin evidencia. Marketing debe reflejar estados reales: disponible, beta o planificado.

## Controles recomendados

- Rotación semestral/anual de `JWT_SECRET` y `LICENSE_HASH_SECRET` con procedimiento documentado.
- Secretos distintos por producción/preview/desarrollo.
- `ALLOW_PUBLIC_REGISTER=false` en producción.
- WAF con reglas para `/api/v1/auth/*`, `/api/v1/licenses/*` y endpoints administrativos.
- MFA obligatorio para administradores y perfiles contables/médicos sensibles.
- Retención de logs de auditoría y alertas de cambios de rol, contraseña, licencia y dispositivo.
- Export/backups fuera del mismo proveedor.
- Cifrado de campos de alta sensibilidad a nivel de aplicación cuando el caso lo requiera (por ejemplo datos médicos especialmente sensibles), además del cifrado de infraestructura.
- Política de mínimo privilegio: clientes nunca reciben credenciales de base, service role ni secretos de licencia.
- Pruebas recurrentes de IDOR, escalación horizontal/vertical, mass assignment, SQLi, XSS, CSRF/Fetch Metadata, rate limit y abuso de licencias.

## FODA

### Fortalezas

- Producto modular con ventas, inventario, compras, contabilidad, bancos, nómina, salud/veterinaria, gimnasio, analítica e IA.
- Enfoque venezolano/multimoneda y posibilidad de especialización fiscal.
- PWA y operación desde móvil sin depender de tiendas de apps.
- Tenant isolation + RBAC + licenciamiento modular.
- Capacidad de competir por precio por empresa, no necesariamente por usuario.

### Oportunidades

- PyMEs venezolanas que aún trabajan con Excel/cuadernos.
- Verticales con mayor ticket: consultorios, veterinarias, gimnasios, contadores y comercios multi-sede.
- Canal de vendedores, contadores y asesores como revendedores.
- Paquetes por vertical y add-ons de IA/WhatsApp/importación/migración.
- Diferenciación frente a Odoo: menor complejidad y precio predecible; frente a Fina: mayor profundidad contable/vertical.

### Debilidades

- Varias capas CSS/legacy todavía conviven y elevan deuda visual.
- Multiempresa actual es tenant por tenant; falta identidad central que permita cambiar de empresa con una sola cuenta.
- Gestión comercial de suscripciones todavía está acoplada a la licencia técnica.
- Soporte/implementación dependerán inicialmente de pocas personas.
- No existe todavía historial comercial suficiente para estimar CAC, churn y carga de soporte.

### Amenazas

- Fina ya declara más de 4.000 negocios y soporte local.
- Odoo posee ecosistema, cientos de apps y red de partners.
- Cambios fiscales/regulatorios venezolanos pueden requerir releases urgentes.
- Un incidente de seguridad con datos financieros o médicos dañaría fuertemente la marca.
- Dependencia de proveedores cloud, variación de costos y conectividad local.

## Arquitectura comercial recomendada

No convertir `LicenseKey` en una factura. Separar:

1. `CustomerAccount`: cliente comercial y contactos de facturación.
2. `Subscription`: plan, ciclo, precio, moneda, inicio, renovación, gracia y estado.
3. `SubscriptionTenant`: empresas/RIF cubiertas por la suscripción.
4. `ModuleEntitlement`: módulos/add-ons contratados.
5. `LicenseKey`: credencial técnica, vencimiento y límites.
6. `LicenseActivation`: dispositivos y sesiones activadas.
7. `SalesAgent`: vendedor/reseller.
8. `Commission`: comisión devengada/pagada.
9. `SubscriptionPayment`: pago, referencia, período y conciliación.

Así una renovación o cambio de precio no obliga a reemplazar el diseño de seguridad de la licencia.

## Estrategia de planes propuesta para validación comercial

- **Demo**: 14–15 días, 1 empresa, datos de prueba o límites operativos.
- **Emprende**: USD 15–19/mes por empresa. Ventas, clientes, inventario básico y reportes.
- **PyME**: USD 25–29/mes por empresa. Compras, bancos, cuentas por cobrar/pagar, reportes ampliados y más dispositivos.
- **Profesional**: USD 39–49/mes por empresa. Contabilidad, nómina, automatizaciones y soporte prioritario.
- **Vertical Salud/Gym/Veterinaria**: USD 45–59/mes según vertical y soporte.
- **Multiempresa**: desde USD 69–89/mes para hasta 3 empresas; empresa adicional con recargo fijo.
- **IA/WhatsApp/SMS**: add-on o consumo separado para evitar que el costo variable destruya margen.

Los precios son propuesta interna; deben validarse con 10–20 prospectos antes de publicarse.

## Indicadores SaaS a medir desde el primer cliente

- MRR / ARR.
- Churn mensual.
- ARPA por empresa.
- CAC por canal/vendedor.
- Payback de CAC.
- Tickets de soporte por cliente/mes.
- Uso por módulo.
- Activaciones por licencia y dispositivos activos.
- Renovaciones próximas a 30/15/7 días.
- Morosidad y período de gracia.
