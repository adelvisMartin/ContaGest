# Auditoría correctiva de flujos y controles · Referencias Hípico · 2026-10-15

## Estado de evidencia (obligatorio)

- **Capturas proporcionadas por el propietario:** 4 imágenes. Cubren estado personal y fragmentos de historial/carreras/transferencias. No demuestran el efecto de pulsar botones.
- **Tres URLs aportadas por el propietario:** `reporte_publico.php`, `historial_publico.php`, `reporte_movimientos_publico.php` en el mismo dominio. Los tokens de URL **NO se registran aquí**.
- **Consulta directa de las URLs:** **BLOCKED**. La herramienta web devolvió `DisabledError` para las tres; DNS del contenedor no pudo resolver el dominio. Búsqueda por las rutas públicas sin token: sin resultados.
- **REA/CDP:** **NOT_EXECUTED**. La skill/CLI se preparó en el **PR #997**, todavía abierto y no merged. Ni esa branch ni el instalador son evidencia de haber abierto el navegador, inspeccionado DOM o usado REA. No se afirma scraping o clonación verificada.
- **PR #999:** implementación interna de reportes basada en capturas y fuentes del workspace; los contratos sintéticos están verdes. **No es la auditoría del producto externo**.
- **PR #1000:** API de enlaces por grupo/participante preparada y no desplegada; pruebas/RLS reales todavía requieren verificación. No confundir token opaco con ID de grupo.

## Regla de interpretación de `?t=`

El valor de `t` es idéntico en las URLs de historial público y movimientos público, y distinto en el reporte personal. Esto demuestra **reutilización aparente de una credencial opaca entre dos vistas**, no que `t` sea el identificador del club o grupo. Alternativas posibles: bearer token por enlace, por grupo, por audiencia, por conjunto de permisos, o combinación. Sin inspección de backend/DOM/red no se puede fijar su semántica.

En Control Hípico mantener **tres entidades separadas**: `groupKey` interno, permisos y audiencia de la vista, y token aleatorio revocable. No copiar el token del tercero, no codificar identificadores internos en el secreto y nunca guardar tokens en repositorio/logs.

## Matriz de tres vistas (captura comprobada versus comportamiento real)

| Vista | Elementos realmente visibles en las imágenes | Interacciones que **deben investigarse in situ** | Estado del PR #999/#1000 |
|---|---|---|---|
| Reporte personal | Encabezado club y participante; «Saldo Disponible» y «Saldo Final»; selector fecha y botón **Ver**; «Resumen semanal» con días; «Saldo Inicial del Día»; apuestas por pista/carrera; pizarra; rol, jugada, caballo, monto y resultado; «Total apuestas» | ¿Ver ejecuta navegación o fetch? ¿Fecha cambia apertura/semana/saldo de forma consistente? ¿Saldo disponible incluye aval? ¿Qué pasa con carrera anulada o no liquidada? ¿Qué permite copiar/descargar/imprimir? ¿Cómo se restringe el participante? | Vista interna parcial (fecha/semana/saldos/carreras); **no hay reproducción comprobada de interacción del sitio externo**. |
| Historial de transacciones + carreras | Barra fija club/fecha con calendario y botones **Hoy**, **Actualizar**, **Movimientos**; resumen de **Depósitos**, **Retiros**, **Transferencias**; columna de eventos por hora/tipo/cliente/monto; ejemplos de «DEP AVAL», «DEP X / ELIMINADO», «TRF» y su recepción; contador de transacciones y actualización; panel de «CARRERAS REGISTRADAS HOY» y contador; tarjetas por hipódromo/carrera, badge de resultado, pizarra, líneas de jugadas, resultados por participante y **Copiar** en cada tarjeta; totales al pie | ¿Hoy modifica fecha y recarga? ¿Actualizar fuerza nueva consulta sin perder fecha/desplazamiento? ¿Movimientos abre tercera vista preservando token/fecha? ¿Copiar entrega jugadas, resultados o ambos, con qué estructura? ¿Las tarjetas se colapsan? ¿Transferencia emisor/receptor son dos filas de una operación? ¿Cómo se tratan anulaciones y avales? ¿Carga más/paginación/actualización automática? | PR #999 lista movimientos y carreras en pestañas separadas, pero **faltan Hoy, Actualizar, Movimientos como navegación cruzada, Copiar por carrera, dos caras de transferencia y representación específica del estado de depósitos**. |
| Reporte diario de movimientos `reporte_movimientos_publico.php` | **No hay captura atribuible de forma inequívoca a esta tercera página.** Solo el URL y título deducible de ruta | Hay que inspeccionar directamente cada control, filtros, totales, exportación, calendario, balances, agrupaciones, mensajes, accesibilidad, móviles y navegación hacia/desde historial. No inferir botones a partir de la segunda vista. | PR #1000 expone un reporte propio, pero **no se ha comparado la interfaz ni los flujos del original**. |

Los botones «Hoy», «Actualizar», «Movimientos», «Copiar» y «Ver» **están observados visualmente**. Su resultado, redireccionamiento, actualización de estado, carga, errores y permisos son **HIPÓTESIS** hasta ejecutar interacción real. «Otorgar aval» en una celda de evento es texto visible; no llamarlo botón sin inspección DOM.

## Brechas implementables de Control Hípico, priorizadas

| Prioridad | Brecha/flujo | Aceptación profesional | Evidencia necesaria |
|---|---|---|---|
| P0 | Capturar DOM/network/acciones en las 3 páginas | Identificar selectors semánticos, método/URL sin secreto, respuesta, carga/error, navegación, responsive, importes y captions de cada botón; matriz BEFORE/AFTER redactada | Chrome CDP + REA ejecutados y capturas autorizadas; sin tokens ni PII en Git |
| P0 | Modelo de seguridad de enlaces | Para cada vista: alcance servidor por grupo/participante, expiración/revocación, no-store/no-referrer, rate limiting, logs sin query `t`, negative tests cross-group | DB RLS en PostgreSQL real y pruebas HTTP por actores |
| P1 | **Hoy** y **Ver** con estado controlado | Una fecha válida actualiza todos los paneles atómicamente, resetea solo lo esperado, distingue sin resultados; zona horaria Caracas; persistencia de filtro según UX comprobada | E2E y captura DOM |
| P1 | **Actualizar** | Refresh manual no duplica movimientos ni modifica ledger; loading/error/retry/last-sync y request cancel; no datos obsoletos como nuevos | API/Playwright + pruebas de reconexión/offline |
| P1 | **Movimientos** | Navegar historial↔diario conservando token/scope y fecha; opción volver; no mostrar identidad de otro participante | E2E móvil y desktop + IDOR negativos |
| P1 | **Copiar** por carrera | Exportar SOLO carreras autorizadas; contenido exacto y formato obtenido in situ, timestamp; feedback/clipboard denial; accesibilidad teclado/tacto | Snapshot redacted del resultado del original y test E2E |
| P1 | Depósitos, retiros, avales, eliminados y transferencias | Tipos y reversos no suman dos veces; transferencias internas no se convierten en depósito externo; preservar audit trail; totales por moneda exacta | Fixture de doble asiento/reversal, integración PostgreSQL |
| P1 | Resultados por carrera | Vincular resultados, pizarra, estado liquidado/pendiente/anulado a carrera correcta; nunca asignar dinero usando una pizarra como fuente de saldo | Contratos de carreras, liquidaciones, bloqueo al reconciliar |
| P2 | Tablas densas y número elevado de carreras | Scroll, paneles, columnas, botones tap-target, ancho 360/390/430/768/1440, sticky header, navegación, formato locales | Pixel snapshots y pruebas manuales |
| P2 | Historial paginado/exportable | Render de muchos eventos/carreras sin pérdida, estado vacío, paginado y formatos PDF/CSV **solo si el original lo admite o el producto lo requiere** | Bench de dataset sintético y pruebas de export |
| P2 | Lectura offline y Android | Los 3 informes funcionan con el snapshot realmente disponible; etiquetas claras de «offline/desactualizado»; sin leer datos de otro grupo | PWA SW y sincronización Android/Playwright |

## Inventario verificable de botones y obligaciones

| Control visto | Vista | Estado en código PR #999 | Reglas mínimas pendientes |
|---|---|---|---|
| Calendario + **Ver** | Personal | Campo fecha + «Ver informe» interno; **PARCIAL** | Captura real de navegación/filtrado, reloj y validación |
| **Hoy** | Historial | **AUSENTE en los nuevos paneles** | Reset de fecha a «hoy» Caracas, recarga consistente |
| **Actualizar** | Historial | **AUSENTE en los nuevos paneles** | Refresh sin duplicado, loading/error, estados offline |
| **Movimientos** | Historial | Pestaña interna no equivalente a botón de enlace; **PARCIAL** | Rutas ida/vuelta con preservación de scope y fecha |
| **Copiar** | Cada carrera | «Copiar resumen» general, **NO equivalente** | Botón independiente por carrera, texto real verificado, seguridad del portapapeles |
| «DEP AVAL» / «DEP X» | Historial | Movimiento genérico, **NO equivalente** | Estado, reversal, relación aval/deposito y cálculo correcto |
| Total del día | Historial | Sumas clasificadas por tipo+moneda; **PARCIAL** | Derivación exacta de fuente canónica, conciliación y estados |

## No confundir evidencia con implementación

Un PR que crea un botón no demuestra que reproduce el comportamiento del software de referencia. Los datos de una imagen tampoco prueban que la suma provenga del ledger. Un token compartido en dos URLs no demuestra que identifique al grupo. **No cerrar el ticket de benchmarking ni mergear «réplica completada» hasta tener capturas de interacción reales y casos de aceptación E2E.**

### Captura autorizada, reversible y sin secretos

1. Abrir cada URL en navegador del operador, con perfil nuevo aislado, no usar sesiones personales.
2. Tomar capturas de los tres estados iniciales, con datos personales ocultos.
3. Pulsar **Ver**, **Hoy**, **Actualizar**, **Movimientos**, **Copiar** y documentar cambios observables, rutas **sin query values**, cambios de DOM e interacciones. Guardar únicamente HAR saneado, sin cookies, authorization, `t`, cuentas ni PII.
4. Si se instala REA desde el PR #997, comprobar versión Node, CLI y CDP antes de afirmar «REA verificado». REA no sustituye pruebas QA ni permisos.
5. Alimentar el informe REA con evidencia revisada (hash) y generar issues individuales por flujo. El scraping solo cubre páginas públicas/autorizadas.

## Cómo desbloquearlo

Usar ChatGPT **Work** con navegador en la nube para visitar las páginas, o un Chrome local del propietario conectado a REA por CDP en loopback, siempre que el entorno permita entrar a los enlaces. Compartir únicamente exportaciones/HTML/HAR previamente saneados. Hasta entonces, todas las funcionalidades no observables permanecen **NOT_VERIFIED**.
