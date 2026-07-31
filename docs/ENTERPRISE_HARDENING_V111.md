# ContaGest-VE · Matriz de endurecimiento empresarial v11.11

## Objetivo

Este documento registra la diferencia entre una pantalla demostrativa y un módulo listo para producción. La etiqueta interna `core` o `advanced` no se considera evidencia suficiente. Cada módulo se evalúa por:

1. persistencia autoritativa;
2. aislamiento por tenant y RBAC;
3. trazabilidad y auditoría;
4. validaciones y manejo de errores;
5. procesos de aprobación;
6. responsive y accesibilidad;
7. rendimiento y paginación;
8. pruebas unitarias, API y navegador;
9. estados vacíos, loading, éxito y error;
10. recuperación y reversión.

## Referencias funcionales estudiadas

| Rubro | Referencias | Patrones tomados |
|---|---|---|
| Contabilidad / ERP | Zoho Books | conciliación bancaria, reportes configurables, aprobaciones, inventario enlazado, automatización y exportación |
| Veterinaria | ezyVet, ACVet, QVET | expediente clínico configurable, agenda, laboratorio, hospitalización, recordatorios, inventario y captura de cargos clínicos |
| Gimnasios | Mindbody | perfiles de clientes, membresías, pagos recurrentes, reservas, asistencia, progreso y operación móvil |
| Trabajo y tareas | Asana | responsables, fechas de inicio/vencimiento, dependencias, recurrencia, formularios, reglas y vistas compartibles |
| Última milla | Onfleet | secuenciación de rutas, conductor, ETA, notificaciones, tracking y prueba de entrega |
| Diseño de producto | Material UI | componentes accesibles, estados consistentes, densidad empresarial, formularios, menús, modales y diseño responsive |

## Cambios aplicados en esta fase

### Arquitectura transversal

- Se restauró el ciclo completo del shell: seguridad, licencias, navegación, temas, analítica, BCV, sincronización y PWA.
- Las actualizaciones auxiliares del Store ya no desmontan el workspace React veterinario cuando la ruta y el shell no cambian.
- Query params seguros para módulo, pestaña, vista, búsqueda, estado, fechas, paginación y entidad seleccionada.
- Material UI local para campos reutilizables `Field`, `Textarea` y `Select`, conservando `FormData` y validación.
- `react-hot-toast` como capa visual de notificaciones.
- Política central de integridad: producción no crea copias locales silenciosas cuando falla el backend.
- Credenciales de seed eliminadas del login público.

### Módulos fortalecidos

| Módulo | Aplicado |
|---|---|
| Veterinaria | MUI, mascotas/tutores, agenda, SOAP, recetas, consentimientos, laboratorio, estudios, hospitalización, procedimientos, comunicaciones, RLS y deep links |
| Tareas | responsables, descripción, inicio/vencimiento, prioridades, dependencias, recurrencia, lista/tablero y filtros URL |
| Bancos | cuentas, saldo inicial, movimientos, referencias, importación/exportación CSV, conciliación y filtros |
| Nómina | empleados, cargos, departamentos, períodos, incidencias, aportes patronales, revisión/aprobación y exportación |
| Reportes | períodos, comparación anterior, finanzas/operaciones/clientes, drill-down, impresión y CSV |
| Delivery | dirección, conductor, secuencia, geocodificación, ETA, navegación y filtros |
| Tracking | estados, ETA, enlace compartible, WhatsApp, eventos y prueba de entrega |
| Ventas / inventario / clientes / compras / proveedores | persistencia autoritativa en producción; fallback solo de desarrollo y explícitamente marcado |
| Login | copy reducido, CAPTCHA, modo interno/licencia, MFA, estados accesibles y sin contraseñas publicadas |

## Pendientes priorizados

### P0 · Bloqueantes antes de producción

- [ ] CI completo en verde: TypeScript, pruebas, frontend, backend y auditoría.
- [ ] Browser QA en 375×812, 768×1024 y 1440×900.
- [ ] Validar envío y reset de cada formulario convertido a MUI.
- [ ] Validar login, CAPTCHA, licencia, MFA, roles y revocación.
- [ ] Confirmar que Veterinaria conserva `tab` y `patient` después de actualizaciones del Store.
- [ ] Eliminar archivos/workflows temporales de diagnóstico.
- [ ] Probar preview Vercel y revisar errores de runtime.

### P1 · Persistencia y procesos empresariales

- [ ] Crear tablas/API autoritativas para tareas, bancos, nómina y analítica; actualmente la UI enriquecida de estos módulos conserva parte de su estado en Store.
- [ ] Implementar idempotencia, control de versión y conflictos para ventas, inventario, compras y clientes.
- [ ] Sustituir eliminación inmediata por archivado/soft delete donde exista trazabilidad legal.
- [ ] Añadir aprobaciones por rol para conciliación, nómina, pagos, asientos y cierres.
- [ ] Añadir bitácora server-side de cambios antes/después.
- [ ] Añadir bloqueo de períodos contables y reversos formales.

### P1 · Seguridad

- [ ] Rotar credenciales de demostración existentes y entregar accesos temporales desde Licencias.
- [ ] Añadir sesiones/dispositivos visibles al usuario y revocación individual.
- [ ] Añadir recuperación segura de contraseña y verificación de correo.
- [ ] Añadir CSP estricta, nonce y revisión de dependencias frontend.
- [ ] Añadir protección antifuerza bruta centralizada en servidor/Redis; el bloqueo local del CAPTCHA no basta por sí solo.
- [ ] Añadir exportación de auditoría por tenant y alertas de accesos anómalos.

### P1 · Veterinaria y salud

- [ ] Captura automática de cargos desde procedimientos, laboratorio, recetas e internación hacia ventas/facturación.
- [ ] Adjuntos DICOM/PDF/imagen con clasificación clínica, consentimiento y retención.
- [ ] Firma clínica, bloqueo y adenda de historias firmadas.
- [ ] Protocolos de vacunación y recordatorios programados.
- [ ] Hospitalización con hoja horaria, medicación administrada y balance hídrico.
- [ ] Referencias/interconsultas y portal del tutor/paciente.
- [ ] Plantillas clínicas configurables por especialidad.

### P1 · Gimnasio

- [ ] Persistencia server-side de socios, accesos, rutinas, pagos y evaluaciones.
- [ ] Cobros recurrentes, reintentos, deuda, congelamientos y renovaciones.
- [ ] Cupos, lista de espera, cancelación tardía y reservas móviles.
- [ ] Gráficas de progreso y comparación de evaluaciones.
- [ ] Separar claramente operación, rutinas y nutrición en rutas/componentes especializados compartiendo servicios.
- [ ] Consentimientos PAR-Q y alertas de salud.

### P2 · Analítica e IA

- [ ] Métricas server-side, rendimiento por ruta, errores, embudos y cohortes.
- [ ] Reportes programados y envío por correo.
- [ ] Asistente IA con citas a registros, permisos por herramienta y acciones sujetas a aprobación.
- [ ] Streaming y cancelación de respuestas.
- [ ] Evaluaciones de prompts, protección contra inyección y auditoría de cada herramienta invocada.

### P2 · UX, diseño y accesibilidad

- [ ] Sustituir modales/prompt nativos restantes por Dialog MUI.
- [ ] Homogeneizar tablas con orden, columnas, densidad, paginación y estados skeleton.
- [ ] Diseñar formularios por pasos cuando superen 8 campos.
- [ ] Completar navegación por teclado, foco visible y lector de pantalla.
- [ ] Confirmar contraste WCAG AA en todos los temas.
- [ ] Crear EmptyState, ErrorState, Skeleton y ConfirmDialog comunes para todos los módulos.
- [ ] Añadir guardado de borradores y prevención de pérdida de cambios.

### P2 · Rendimiento y mantenimiento

- [ ] Generar lockfile reproducible y usar `npm ci`.
- [ ] Dividir bundle por rutas y cargar verticales bajo demanda.
- [ ] Migrar Prisma de configuración de `package.json` a `prisma.config.ts` antes de Prisma 7.
- [ ] Actualizar dependencias obsoletas de forma controlada.
- [ ] Paginación server-side, caché por consulta e invalidación explícita.
- [ ] Presupuesto de rendimiento Lighthouse y tamaño de bundle en CI.

## Criterio de salida

La versión puede promoverse cuando:

- CI y browser QA están verdes;
- no hay errores 5xx en preview;
- login/CAPTCHA/licencia/MFA pasan;
- CRUD crítico confirma persistencia tras recarga;
- roles y tenant isolation pasan;
- no hay overflow en los tres viewports;
- el plan de reversión apunta al deployment estable anterior;
- las limitaciones que continúan locales están etiquetadas y no se presentan como procesos autoritativos.
