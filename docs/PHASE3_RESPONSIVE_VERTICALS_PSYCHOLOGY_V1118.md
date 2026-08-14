# ContaGest-VE Phase 3 — Responsive shell, verticales y agenda profesional v11.18

## Objetivo

Esta fase corrige el contrato de viewport observado después del merge de PR #44 y continúa la migración ERPUI sin alterar contratos contables/fiscales. El lote se publica en un solo commit para generar un único despliegue de preview.

## Shell responsive

El shell pasa a un único contrato geométrico:

- sidebar desktop: `248px`;
- drawer móvil: hasta `264px` / 86vw;
- header desktop: `64px`;
- header móvil: `56px`;
- el borde derecho del sidebar coincide con el borde izquierdo del contenido cuando está abierto;
- al colapsar sidebar, header y contenido recuperan `100vw`;
- ningún módulo puede ampliar el ancho del documento; tablas conservan scroll horizontal propio.

El header deja de repetir el nombre del producto. El sidebar mantiene **ContaGest-VE** completo y el header utiliza solo el isotipo compacto. Los botones grandes de cierre se sustituyen por un control lateral de contracción y un menú hamburguesa contextual.

La tasa BCV queda en una sola cápsula compacta con valor + fuente. Se eliminan los dos bloques `Tasa del día` / `Fuente` y los selectores de modo/idioma del header; esas preferencias viven en Configuración y en el menú de usuario.

## KPIs y popovers

La tira KPI usa grid adaptable y permite wrap de importes/subvalores. Los valores no deben recurrir a `text-overflow: ellipsis` para ocultar cifras financieras.

El menú de usuario se posiciona contra el viewport, tiene altura máxima basada en `100dvh` y scroll interno únicamente cuando es realmente necesario.

## Soporte WhatsApp

Nueva preferencia global `supportWidget`:

- `peek`: valor predeterminado; el botón queda parcialmente oculto en el borde y aparece completo al hover/focus;
- `visible`: botón completo;
- `hidden`: sin flotante.

El canal sigue disponible desde Soporte aunque el flotante esté oculto.

## Temas

`frontend/src/data/themeCatalog.js` pasa a ser el catálogo global para header/configuración:

- Adaptativo por sector;
- Claro empresarial;
- Oscuro empresarial;
- Azul cielo;
- Azul suave;
- Espectro;
- Ejecutivo;
- Finanzas;
- Enterprise oscuro.

Las paletas por vertical siguen ajustando los tokens globales en `vertical-contexts.css`. Este mismo archivo actúa como extensión contextual/responsive cargada por el único entrypoint de compatibilidad (`compact-enterprise-v1110.css`), evitando crear otra hoja versionada u otro stack de overrides.

## Idiomas

Se añade Portugués (`pt`, locale `pt-BR`) al sistema global existente. La selección queda disponible en Configuración y menú de usuario.

Idiomas soportados en esta fase:

1. Español
2. English
3. Português
4. 中文
5. हिन्दी
6. العربية

Las cadenas todavía no migradas semánticamente conservan el fallback español en vez de mostrar claves técnicas.

## Perfiles pequeños: clínica, veterinaria y venta

`role-clinica` y `role-veterinaria` dejan de recibir Nómina/RRHH por defecto. La decisión busca que médicos particulares, veterinarios independientes y PYMES vean primero el flujo que usan diariamente.

Los módulos de RRHH **no se eliminan**: administrador/RBAC puede habilitarlos cuando la organización tenga empleados. `role-vendedor` ya estaba enfocado en CRM, ventas, POS y pedidos y continúa sin RRHH por defecto.

## Nueva vertical Psicología

Se incorpora:

- modo `psicologia`;
- ruta `psicologia`;
- permiso backend canónico `health.manage` (compartido por clínica, veterinaria y psicología), manteniendo aliases frontend legacy durante la transición;
- rol `role-psicologia`;
- paleta calmada violeta/teal;
- página `PsychologyPracticePage`.

El MVP profesional incluye:

- pacientes para agenda;
- citas;
- conteo de citas del día y de la semana;
- citas pendientes de confirmación;
- recordatorios próximos según una ventana configurable;
- accesos de confirmación a Google Calendar, correo y WhatsApp;
- diseño mobile-first.

La primera versión **no almacena notas de psicoterapia, diagnósticos ni contenido clínico sensible en almacenamiento local**. La ficha clínica privada se abordará como flujo separado con controles de privacidad y consentimiento.

## Integraciones de citas

`AppointmentReminderService` es global para que luego pueda ser reutilizado por clínica, veterinaria y psicología.

En esta fase las acciones son iniciadas por el profesional:

- Google Calendar abre un borrador de evento;
- correo abre un mensaje de confirmación;
- WhatsApp abre el chat con mensaje prellenado.

Esto funciona sin exponer secretos.

La automatización real de creación de eventos y envío de correo se debe ejecutar en backend con autorización OAuth de Google; no se simula como implementada en esta fase. Configuración solo almacena identificadores no secretos como Calendar ID, correo operativo y ventana de recordatorio.

## Migración controlada adicional

`OrderTrackingPage` migra sus KPIs al kit ERPUI y sustituye la selección Tailwind específica por un estado canónico `is-selected`. Sus contratos de avance, compartir, WhatsApp y prueba de entrega se conservan.

No se modifica en este lote la matemática contable, fiscal, de nómina ni de inventario ya caracterizada.

## Gates

Se añaden/actualizan:

- `tests/phase3_shell_psychology_i18n.test.mjs`;
- `tests/phase2_i18n_verticals.test.mjs` para seis idiomas;
- `qa/phase3-shell-psychology.spec.mjs`;
- `qa/phase2-i18n-verticals.spec.mjs` para Portugués.

Browser QA verifica desktop 1024/1366/1440, sidebar abierto/cerrado, popover dentro del viewport, KPI sin clipping, mobile 390px y nueva vertical Psicología.

## Alineación RBAC fullstack

El catálogo RBAC backend ahora incluye `health.manage`, `gym.manage` y `communications.manage`, las mismas fronteras que exigen las rutas verticales. Se agregan blueprints para Clínica / Consultorio, Clínica veterinaria, Psicología / Consultorio y Gimnasio / Fitness. Los perfiles clínica/veterinaria/psicología no incluyen `payroll.manage` por defecto. El nombre interno `Demo limitado` se conserva para compatibilidad de API, aunque el copy visible continúa normalizado como acceso comercial/temporal.
