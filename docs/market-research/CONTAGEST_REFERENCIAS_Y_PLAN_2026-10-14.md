# ContaGest VE — referencias de mercado y plan de consolidación

**Corte:** 14 de octubre de 2026, hora de Bogotá. **Producto:** ERP contable venezolano multiempresa. **Naturaleza:** auditoría de referencias visibles y plan de implementación; no certifica producción, cumplimiento fiscal ni paridad funcional.

## 1. Resumen ejecutivo

El enlace de X describe **Wink POS**, un competidor de entrada gratuito para comercios venezolanos. Su promesa concreta es vender desde el teléfono con USD/Bs, vuelto, inventario descontado por documentos, gastos, roles e informes. Su propio sitio aclara que emite recibos, **no facturas fiscales SENIAT**. ContaGest debe medir la facilidad del primer día y del cobro contra Wink, y construir su diferencia en contabilidad formal, trazabilidad fiscal verificable, conciliación, controles multiempresa y recuperación. No se debe prometer homologación hasta contar con revisión profesional y evidencia.

El repositorio ya define un ERP con frontend Vite, API Node/TypeScript, Prisma/PostgreSQL, 58 rutas registradas, seis propietarios CSS y reglas estrictas de tenant, RBAC y contabilidad. Existen backlogs canónicos [#835](https://github.com/adelvisMartin/ContaGest/issues/835), [#707](https://github.com/adelvisMartin/ContaGest/issues/707) y cobertura funcional [#659](https://github.com/adelvisMartin/ContaGest/issues/659); una comparación nueva debe alimentar esos dueños, no abrir un ERP paralelo.

**Identidad observada:** GitHub `main` estaba en `5523608b3ca7f98727d043902ae7d47dd09880c5` durante esta revisión. La carpeta local compartida no tiene `HEAD` propio y todo su contenido aparece sin seguimiento; por ello la inspección local es contexto, no evidencia exacta del `main` publicado. El [PR #997 de REA](https://github.com/adelvisMartin/ContaGest/pull/997) está **abierto** en `f4655d9ab97aa87962290fb27b304e2eca72cd40`: prepara `rea-agents@6.5.0`, matrices y un instalador local optativo, pero no demuestra que la CLI esté instalada en este equipo ni que se haya ejecutado una captura REA.

**Actualización de estado (15-10-2026):** la auditoría anterior conserva su SHA como corte histórico. En esta continuación el clon Git verificable tiene `origin/main` en `0d93a03ad43dfb81036900b6948a3c5328bdf32c`; PR #997 sigue abierto y su resolución/conflictos deben revalidarse con el head vigente. La documentación de benchmark de esta carpeta se prepara como guía; no declara que REA haya auditado toda la web ni que sus capturas se hayan ejecutado.

## 2. Evidencia externa y alcance

| Fuente | Lo observado o declarado por fuente primaria | Lectura para ContaGest | Límite |
| --- | --- | --- | --- |
| [Post de Wink POS en X](https://x.com/metavarce/status/2110046379477434839) y [sitio de Wink POS](https://wink-pos.com/) | Promesa gratuita, cobro bimoneda con vuelto, inventario ligado a movimientos, gastos, informes, cuatro roles, importación Excel, recibos 58/80 mm/carta/PDF. | Benchmark de rapidez, claridad de cifras y barrera de entrada; comparar POS móvil y onboarding. | Post y web son afirmaciones del proveedor; no se verificó una venta real ni el backend. Su web declara que no emite facturas fiscales. |
| [Alegra Venezuela](https://www.alegra.com/venezuela/) y [ayuda contable](https://ayuda.alegra.com/ven/alegra-contabilidad) | Venta, compras, inventario, bancos, contabilidad, informes y multimoneda; página de Venezuela advierte que su beta aún no incluye facturación fiscal homologada. | Comparar navegación contable, importación, conciliación y tareas del contador. | La oferta y el alcance cambian; confirmar fecha y plan antes de cada decisión. |
| [Odoo Accounting](https://www.odoo.com/app/accounting-features) | Importación bancaria, conciliación sugerida, cierre de períodos, documentos digitalizados, multiempresa. | Patrones para bandeja de excepciones y rastreo de origen; no importar reglas tributarias de otra jurisdicción. | Capacidades por versión, localización y licencia varían. |
| [ERPNext](https://docs.erpnext.com/index) y [Dolibarr](https://www.dolibarr.org/) | ERP modular con contabilidad, inventario, compras, ventas, CRM y reportes. | Referencias de flujo documento a documento, módulos y portabilidad. | El issue #707 exige `SOURCE_REUSE=NONE` por defecto y revisión de licencia antes de cualquier reutilización de código. |

**Cobertura de mercado:** esta es una muestra dirigida de competidores relevantes, no un rastreo de “todos” los sistemas contables de la web. Cada nueva referencia debe entrar al registro de #707 con URL, fecha, versión, captura, licencia, función y nivel de confianza. REA aporta observación de pantallas; no revela la lógica invisible ni sustituye tests del producto propio.

## 3. Matriz producto/mercado que ChatGPT debe mantener

Usar para cada capacidad las columnas `Necesidad del usuario`, `Referencia observable`, `Ruta/servicio/tabla propios`, `Evidencia del flujo`, `Estado`, `Brecha`, `Issue dueño`, `Prioridad`, `Criterio de aceptación` y `SHA`. Los estados de capacidad son `VERIFIED`, `PARTIAL`, `NOT_VERIFIED` o `NOT_APPLICABLE`. Un archivo o botón existente no permite marcar `VERIFIED`.

| Flujo | Referencia | Autoridad ContaGest | Tarea concreta de consolidación |
| --- | --- | --- | --- |
| Alta de empresa, primer producto y primera venta | Wink POS, Alegra | Tenant/RBAC, productos, POS | Cronometrar desde alta hasta recibo usando datos sintéticos; reducir pasos y explicar tasa, moneda y permisos en lenguaje de negocio. |
| Cobro USD/Bs y vuelto | Wink POS | POS, dinero de dominio, tasa por transacción | Mostrar total, recibido y vuelto por moneda; fijar tasa y fuente en documento; redondeo Decimal; varias formas de pago; refund con reverso. |
| Inventario vinculado a documentos | Wink POS, Odoo, Dolibarr | Reserva #738; #755/#756/#763/#765 | Ninguna existencia cambia sin venta/compra/ajuste identificado; probar cancelación, devolución, concurrencia, depósitos y coste. |
| Cotización a cobro | ERPNext, Dolibarr, Alegra | #753/#754/#757/#856/#857 | Caracterizar `cotización → pedido → entrega → factura → cobro`, estados, secuencias, roles, API y persistencia; no duplicar precios/sedes. |
| Contabilidad y tesorería | Alegra, Odoo | #743/#744/#785/#769 | Libro diario/mayor, auxiliares, conciliación de banco/caja, cierre y reversos; cada KPI llega al asiento/documento original. |
| Venezuela fiscal | Fuentes legales vigentes, nunca la UI de otro ERP | #751/#774/#775/#776/#778/#780/#781/#782/#783 | Reglas versionadas con fuente oficial, vigencia, revisor y tests; separar factura comercial de emisión fiscal homologada. |
| Importación y salida | Wink POS, Alegra, Dolibarr | #770 | Vista previa, mapeo, validación, dedupe, dry-run, reporte de errores y exportación completa por tenant. |
| Informes de dueño/contador | Wink POS, Alegra, Odoo | #771/#745 | “Vendí”, “cobré”, “gané”, “debo” y “tengo” definidos por origen y período; conciliación entre tablero, reportes y libro. |
| Uso por equipo | Wink POS, Alegra | IAM/RBAC/entitlements | Cajero no ve margen; contador puede revisar sin poderes de plataforma; negativos tenant A→B y B→A. |

## 4. Trabajo priorizado por separado de la referencia

### P0 — integridad y autoridad antes de paridad visual

1. Resolver y probar las autoridades de tenant, sesión, RLS, dinero, secuencias y cierre. Toda mutación financiera debe conservar `Σ Debe = Σ Haber`, Decimal, moneda/tasa, período, actor, origen e idempotencia. Documentos contabilizados se corrigen con reversos o ajustes; un período cerrado rechaza cambios en servidor.
2. Ejecutar el flujo real `UI → cliente/estado → API → servicio → PostgreSQL → respuesta → UI` por capacidad crítica; identificar botones huérfanos. Mantener el inventario de las 58 rutas. El cierre del issue #659 no reemplaza evidencia nueva en el SHA candidato.
3. Sustentar cada norma/tasa venezolana con procedencia, vigencia, revisión y pruebas. No adoptar una tasa o texto fiscal de un competidor.
4. Comprobar backup y **restore** en PostgreSQL aislado, incluyendo roles/RLS, auditoría y secuencias. Un archivo de backup sin restauración probada no es continuidad.

### P1 — producto comercial competitivo

1. POS rápido móvil: búsqueda, lector si existe hardware compatible, carrito, cobro mixto, vuelto, recibo e historial. Validar error, reconexión, duplicación de toque, devolución y turno de caja. Medir tiempo/acciones contra el ejemplo de Wink sin copiar su diseño.
2. Flujo documental completo de ventas y compras, precios/sedes compartidos, inventario por almacén, recepción parcial, cuentas por cobrar/pagar y conciliación bancaria con excepciones revisables.
3. Migración guiada desde Excel/CSV con previsualización y reversión del lote; exportes con alcance por tenant y prevención de fórmulas peligrosas.
4. Colaboración dueño–contador: tareas, solicitudes de soporte, aprobación de documentos y pista de cambios sin elevar permisos al nivel `platform.*`.

### P2 — ventajas de uso y crecimiento

1. Inicio contextual por rol, accesos a pendientes, búsqueda transversal autorizada, explicación de cifras y atajos de operación. No inyectar una tira de KPI global en cada módulo.
2. Automatizaciones de recordatorios/tareas mediante #853/#854 y adaptadores #772; colas, reintentos, idempotencia, baja/consentimiento y trazas. No crear un segundo motor de notificaciones.
3. Comparar móvil, 320/375/414/768/1024/1440, teclado, foco visible, contraste, zoom, estados vacío/error/carga y tema claro/oscuro. Reusar los seis estilos dueños y componentes establecidos.

## 5. Qué puede y qué no puede concluir REA

El [runbook propuesto en el PR #997](https://github.com/adelvisMartin/ContaGest/blob/feat/rea-competitive-audit-20261014/docs/REA_BENCHMARK_AUDIT.md) fija versión, captura pasiva CDP, SHA-256 y un informe local por producto. Cuando esté integrado y ejecutado, ChatGPT debe guardar solo capturas autorizadas y saneadas, comparar contra el `HEAD` exacto, clasificar `GAP_CANDIDATE`, `COVERAGE_CANDIDATE` o `NEEDS_VERIFICATION`, y confirmar cada candidato mediante código y recorrido propio. No subir DOM/HAR con cookies, URLs secretas, contactos o datos financieros. El scraping a escala no forma parte de esa CLI; programar una investigación dirigida y legalmente revisada por producto.

## 6. Instrucción operativa para ChatGPT

> Trabaja **solo en ContaGest VE**. Lee `AGENTS.md`, el skill orquestador y los skills de riesgo. Verifica `remote`, rama, SHA y PR antes de editar. Consulta primero #835 y #707, y revisa PRs abiertos para no duplicar trabajo. Construye la matriz del apartado 3 con evidencia verificable y cita cada observación externa. Para cada brecha confirmada escribe historia de usuario, proceso actual, referencia, límites de observación, diseño propio, modelo de datos, API, RBAC/tenant, reglas contables, tests y rollback. Implementa por dependencias en ramas dedicadas. Ejecuta `npm run agent:gates -- --base main` antes de un cambio no trivial, las pruebas dirigidas, tipo/lint/build y los gates de 58 rutas cuando corresponda. Reporta `PASS`, `FAIL`, `BLOCKED` o `NOT_EXECUTED` con SHA exacto. No hagas merge, despliegue ni migración de producción sin autorización del propietario.

### Entregables exigibles por iteración

- Ficha de referencia con fuente, fecha, captura permitida, límites y licencia.
- Matriz de capacidad con código propio y evidencia del flujo; un issue dueño por brecha real.
- PR pequeño con contrato, tests, revisión independiente en P0/P1 y checklist de accesibilidad.
- Evidencia de PostgreSQL real aislado para finanzas/RLS, browser para UX y restore para DR.
- Lista de riesgos residuales y forma concreta de revertir.

## 7. Estado de verificación de este documento

| Afirmación | Estado |
| --- | --- |
| Se abrieron y leyeron el post de X y páginas oficiales citadas | `PASS` como investigación de referencia, no QA funcional de sus productos. |
| REA instalado y ejecutado contra competidores | `NOT_EXECUTED`; PR #997 abierto. |
| ContaGest probado extremo a extremo en 58 rutas y PostgreSQL contra este plan | `NOT_EXECUTED`. |
| Cumplimiento fiscal y preparación de producción | `NOT_EXECUTED`; requieren gates y revisión profesional. |
