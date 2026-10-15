# Control Hípico · Consolidador diario de saldos (2026-10-15)

## Fuente y nivel de evidencia

Referencia: documento entregado por el propietario, `CONTROL_HIPICO_REFERENCIAS_Y_PLAN_2026-10-14.md`, sección 2. El documento **informa** una observación directa de la tercera URL de Websimproco `reporte_movimientos_publico.php` (sin incluir `?t=`): vista solo lectura de 42 clientes, 21 inicialmente visibles, columnas Disponible/Jugadas Hoy/Semana/Devolución/Depósitos/Retiros/Transferencias/Aval, búsqueda, filtros por columna/signo, ocultar sin movimientos, limpiar, copiar Excel/PDF/imagen, actualizar y ordenar columnas. Esta conversación no ha ejecutado REA/CDP contra el servidor tercero ni reproducido todas esas acciones. Las afirmaciones sobre comportamiento externo más allá de lo documentado siguen **NOT_VERIFIED**.

## Alcance del PR #999

La aplicación interna de Control Hípico incorpora **Consolidador** como pestaña adicional de `Cierres y saldos` junto a reportes personales, movimientos diarios y carreras, sin crear una segunda PWA o trasladar datos a otro almacén.

| Referencia | Función propia implementada | Definición y fuente |
|---|---|---|
| Participante | Código y nombre **solo** del grupo activo | `workspace.participants` validado contra `groupId` |
| Disponible | Saldo disponible al corte | `participantAvailableAt` (balance + aval según tasa histórica) |
| Jugadas Hoy | **Neto liquidado** de apuestas del día; no volumen apostado | `participantRaceDelta` exclusivamente sobre carreras confirmadas |
| Jugadas Semana | **Neto liquidado** de apuestas desde lunes hasta fecha consultada | `participantRaceDelta` y fechas ISO |
| Devolución | Solo asientos `refund/return/devolucion` **explícitos** | Si no existe tipo identificable, mostrar **No disponible**, no 0 |
| Depósitos | Registros `deposit` explícitos, por moneda | `workspace.movements`; el flujo actual de ingreso puede no producir aún tipo `deposit` |
| Retiros | Registros `withdrawal` explícitos, por moneda | `workspace.movements`; un ajuste genérico no se reclasifica |
| Transferencias | Neto **-** emisor y **+** receptor, por moneda | Una operación transfer cuenta una vez, no dos depósitos |
| Aval | Aval al corte, expresado en moneda base | `participantAval` del motor ya existente |

**Ninguna de estas fórmulas se atribuye a Websimproco.** Son definiciones operativas del producto propio, que deberán contrastarse con reglas aprobadas.

## Funciones de uso y exportación

- Fecha ISO con **Ver** y **Hoy** Caracas; **Actualizar** reusa la consulta local/nube conservadora de los informes previos.
- Búsqueda por código o nombre; filtros positivos/negativos/cero por columna; ordenación ascendente/descendente y reordenación de columnas mediante botones utilizables con teclado.
- **Ocultar sin movimientos** considera operaciones/jugadas **del día consultado**, no elimina al participante ni modifica el saldo; valor inicial activado. Tamaño de página: **21**; la tabla indica cuántos cumplen los filtros.
- Paneles independientes: **total del grupo** sin filtros y **total de las cuentas filtradas** antes de paginar. Para operaciones monetarias, las monedas permanecen separadas por código de origen. No sumar USD+VES. Cada export contiene la **página realmente visible** y el orden visible de columnas, no las 42 cuentas ocultas.
- **Copiar Excel** genera TSV con protección contra inyección de fórmulas; **XLSX** usa `reports.js` existente; **PDF** muestra rótulo, fecha, columnas y valores por participante; **Imagen PNG** usa Canvas local, sin render remoto ni bibliotecas externas. PNG está dimensionado para una sola página de 21 filas; se trunca visualmente el ancho de celdas que no cabe, mientras XLSX/PDF conserva el valor completo.
- Sin pestañas nuevas en navegador externo, sin token compartido, sin publicar nombres ni balances fuera de sesión interna. No toca SOURCE WhatsApp, no modifica ledger, no aplica migración y no automatiza apuestas.
- Protección de saldos: antes de leer históricos, falla cerrado con IDs duplicados, jugadas o movimientos hasta el corte que hagan referencia a otro grupo. No se permite maquillar como «cero» un saldo contaminado.

## Evidencia y estado del cambio

Owner de archivos: `frontend/public/hipico-control/assets/js/reference-report-consolidator{,-ui,-image}.js`, navegación existente `app.js`, estilos en owner `ui-system-v4-convergence.css`, service worker PWA r38 y verificación Android `sync-web.mjs`.

Tests sintéticos: `tests/hipico_reference_report_consolidator.test.mjs`, incorporados en la CLI `npm run test:hipico:reference` y en `.github/workflows/hipico-reference-reports.yml`. Separan 42/21, grupo externo, paginación, saldos, monetario, filtro por signo, totales globales/filtrados, devolución explícita, anulación, reordenación, TSV anti-formula y paridad offline.

```bash
npm run test:hipico:reference
node --check frontend/public/hipico-control/assets/js/app.js
node --check frontend/public/hipico-control/assets/js/reference-report-consolidator.js
node --check frontend/public/hipico-control/assets/js/reference-report-consolidator-ui.js
node --check frontend/public/hipico-control/assets/js/reference-report-consolidator-image.js
```

**Sin confundir resultados**: los tests de Node/CI se deben inspeccionar en el SHA exacto de PR #999. E2E visual 360/390/430/768/1440, Android físico, base PostgreSQL real, iconografía/exportes en móviles y paridad con sitio ajeno **no se consideran aprobados por la existencia del código**. QA externo permanece al final conforme a la secuencia acordada por el propietario.

## Fases posteriores, sin superposición

1. Conciliar la fuente local `workspace` con `hipico_money_ledger_entries` PostgreSQL y pruebas de roles/propiedad antes de emitir consolidadores por enlace.
2. Definir en contratos de dominio los eventos depósito/aval/retiro/devolución/reverso, con trazabilidad, permisos y estados propios; actualmente las opciones de carga manual son Transferencia/Pozo/Ajuste, por lo que **no debe afirmarse un flujo de depósito aprobado/eliminado**.
3. Reconciliar #1000 (API pública tokenizada), dependiente de la versión anterior del PR #999, e incluir explícitamente el alcance `group` sólo bajo autorización independiente.
4. No comenzar subasta de LatamTurf sin decisión de producto, ADR y nuevos contratos financieros. Su caja/remate constituye un dominio opcional independiente.
5. En una fase REA/Codex posterior: capturar controles activos de la tercera referencia, su semántica de totales bajo filtros, exportes e interacción; no copiar token ni datos personales.

**Rollback:** revertir cambios del PR #999 sin modificar cuentas ni datos históricos. No hay migración de base de datos ni acciones irreversibles.
