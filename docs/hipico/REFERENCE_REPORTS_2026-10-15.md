# Control Hípico · informes de referencia, vista interna · 15/10/2026

## Procedencia y evidencia disponible

El propietario autorizó analizar tres enlaces de referencia con rutas `reporte_publico.php`, `historial_publico.php` y `reporte_movimientos_publico.php` bajo el mismo sitio comercial. **No se guardan los parámetros de acceso del usuario ni se reproducen en el repositorio.** También compartió cuatro imágenes de las páginas: una vista de estado personal con saldo/semana/apuestas, y vistas de historial con movimientos laterales, carreras, pizarra, jugadas y resultados.

**Limitación constatada:** las tres consultas remotas devolvieron error de acceso en el navegador de herramientas; el contenedor no pudo resolver DNS del dominio. No hubo HTML inspeccionado, scraping de DOM, ejecución de REA ni captura del comportamiento activo. Toda la implementación es **inferida de las imágenes y contrastada con las fuentes internas**, no una réplica certificada del sistema ajeno. No se simularon depósitos reales ni se importaron nombres/montos fotografiados. La CLI REA de PR #997 permanece pendiente, aislada de esta funcionalidad.

## Reutilización, sin segunda autoridad monetaria

El producto conserva las vistas `dashboard`, `race`, `whatsapp`, `advanced`, `participants`, `history`, `reports`, `polla` y `settings`. No se crea una aplicación paralela ni una BD adicional. Se agregan tres pestañas **dentro de Cierres y saldos**, accesibles únicamente después de la autenticación ordinaria de la consola:

| Vista nueva | Referencia visual | Fuente existente real |
|---|---|---|
| Estado personal | Disponible, inicio del día, semana, apuesta/jugada/caballo/resultado | `operational-ledger.js`: `participantStatement`, `participantBalanceAt`, `participantRaceDelta` |
| Movimientos del día | Historial, tipo, participante, abono/transferencia/anulación, totales | `workspace.movements`, `participantMovementDelta` |
| Carreras y resultados | Hipódromo, carrera, pizarra, jugadas y resultados | `workspace.races[].bets`, pizarra de la carrera y liquidación **ya confirmada** |

Se mantienen `reports.js` para PDF, `format.js` para formato de moneda, `ui.js` para escape de HTML, `app.js` para sesión y selección de grupo. `reference-report-projections.js` es proyección pura. `reference-report-ui.js` reutiliza UI System v4 y no realiza escrituras ni envíos. El estilo está en el owner existente `ui-system-v4-convergence.css` sin crear una nueva hoja paralela.

### Política financiera / datos
- Sólo movimientos/carreras del grupo seleccionado y fecha ISO verificada. Los datos de grupos ajenos no se representan ni se exportan.
- Una transferencia se muestra como operación única, aunque en el saldo individual afecta negativamente al emisor y positivamente al receptor. No se etiqueta falsamente como depósito externo.
- No sumar importes de USD y VES sin conversión y contrato explícito; totales de movimientos separados por `tipo + moneda`.
- Anulaciones permanecen visibles pero no aportan al resultado. Apuestas pendientes no reciben cero de liquidación: muestran `Pendiente`.
- Si aparecen referencias inválidas, los reportes generales las cuentan pero no exponen nombres/montos ajenos. El estado personal se bloquea para impedir presentar como válido un saldo derivado que aún incluye referencias incompatibles.
- El balance personal invoca el cálculo canónico local; no altera el ledger central PostgreSQL ni registra operaciones financieras.
- Todas las cadenas dinámicas se escapan antes de insertarse en HTML. No se usan valores provenientes de tokens externos.
- Capturas y archivos de evidencia pueden contener identidad/saldos de terceros y **no se versionan**.

## Funcionalidad completada y pendiente

**Implementado:** filtros de fecha, selección de participante dentro del grupo, semana de lunes a la fecha, saldo del día/inicio/disponible, apuestas/roles/resultado, pizarra, transferencias/ajustes/pozos, anuladas, copia y PDF; estado vacío, responsive en sistema v4 y tests sintéticos.

**No implementado ni verificado:** scraping real de las tres URLs; sincronización de datos del sistema remoto; páginas personales públicas fuera de la sesión; generación/revocación/expiración de tokens por cliente; conciliación real con dinero del sitio externo; lectura de base de datos del tercero; E2E visual en Chrome de sus páginas; QA físico Android; comportamiento de sus botones ajenos. El tercer enlace `reporte_movimientos_publico.php` carece además de una captura visual completa para definir detalles extras, por lo que se implementa una vista interna conservadora.

Para publicar links de cliente parecidos al original hará falta endpoint dedicado con token de alta entropía **almacenado como hash**, fecha de expiración, revocación, política RBAC/propiedad del grupo, filtrado de datos sensibles, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, rate limits y auditoría sin registrar tokens; no se debe reutilizar la URL pública de la competencia ni exponer `workspace` completo.

## QA reproducible
```bash
node --check frontend/public/hipico-control/assets/js/app.js
node --check frontend/public/hipico-control/assets/js/reference-report-projections.js
node --check frontend/public/hipico-control/assets/js/reference-report-ui.js
node --test tests/hipico_reference_report_projections.test.mjs
npm run test:hipico:visual-contract
npm run test:browser:hipico
```

El workflow `.github/workflows/hipico-reference-reports.yml` ejecuta sintaxis y unidad de forma aislada en cada PR que afecta estas rutas. Los gates globales, E2E de navegador/Android y validación de datos reales se reportan por separado; un test sintético PASS no es evidencia de una copia visual exacta de la referencia.

## Criterios siguientes
1. Ejecutar REA en equipo controlado con Chrome CDP usando `morluto/rea` revisado y capturar únicamente pantallas permitidas; el usuario puede proporcionar HTML/HAR *redactados* si el acceso remoto sigue bloqueado.
2. Comparar propiedades de interacción, criterios de filtros, truncamiento, columnas, monedas, paginación, carga, accesibilidad y estados con este módulo.
3. Diseñar acceso público tokenizado sin filtrar datos ajenos (ticket separado P1 de seguridad).
4. Validar contra datos internos sin personas reales ni operaciones en producción; hacer test 360/390/430, tablet, desktop y Android físico.
