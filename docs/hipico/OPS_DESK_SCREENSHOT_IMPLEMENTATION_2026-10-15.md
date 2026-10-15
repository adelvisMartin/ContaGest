# Control Hípico · escritorio operativo basado en cuatro capturas (15/10/2026)

## Alcance honesto: capturas, NO HTML ni scraping real

Se recibieron cuatro imágenes de una solución de referencia del Club Hípico Triple Crown: una pantalla personal, dos segmentos del historial con carreras y movimientos, y una captura de encabezado. Esas imágenes **no permiten verificar** comportamiento DOM, peticiones de red, composición del token de URL, políticas de liquidación, backend ni clics efectivos. REA no inspeccionó el sitio; su preparación permanece en PR #997 sin merge. Este documento distingue **controles visibles** de **reglas implementadas para Control Hípico**.

El PR #999 lleva la UI **interna** y offline, con fuente `workspace` ya autenticada. El PR #1000, dependiente, lleva capacidades compartibles desde PostgreSQL y **no** se mezcla para simular una réplica externa.

## 1. Pantalla personal (captura 1)

| Región de la imagen | Dato o función observado | Implementación interna | Restricción |
|---|---|---|---|
| Cabecera en gradiente con club y seudónimo de cuenta | Nombre de club y destinatario; saldo disponible/final | Datos del grupo activo, participante elegido, disponible con aval y final sin aval | No asumir que disponible = final; el aval puede distinguirlos |
| Fecha y botón **Ver** | Fecha operativa explícita | Formato AAAA-MM-DD, validación de calendario y reconstrucción del modelo al confirmar | La fecha no modifica movimientos de la BD |
| Resumen semanal por día | Filas de fechas, importes con signo y cambio del día | `participantStatement(...).dailyRows` y `weekTotal` canónicos | No asumir que todo importe del resumen proviene solo de apuestas |
| Saldo inicial del día | Saldo al comienzo de la jornada | `participantBalanceAt` a la fecha anterior | No confundir saldo base con aval |
| Una tarjeta por carrera | Nombre, número, pizarra, rol, jugada, caballo, monto y resultado | Historial filtrado por grupo/fecha/participante; muestra Jugador y Consigue y estado `pending|settled|cancelled` | Apuesta anulada nunca significa resultado cero |
| Total apuestas | Un resultado verde o rojo por jornada | «Resultado liquidado en carreras» suma únicamente `participantRaceDelta` de carreras del día | No equivale necesariamente a «beneficio del club» |
| Enlace privado | Texto del pie visible | En la consola interna NO se muestra token; PR #1000 provee otro diseño seguro | No copiar el token remoto |

## 2. Historial de transacciones + carreras (capturas 2 y 3)

La segunda captura muestra una composición simultánea:

- Barra de cabecera con grupo, calendario y **Hoy / Actualizar / Movimientos**. Los dos paneles consultan **una misma fecha**. «Hoy» selecciona el día actual de **America/Caracas**, incluso durante la madrugada UTC. «Movimientos» abre el detalle de transacciones preservando la fecha seleccionada. «Actualizar» consulta el almacenamiento local; si existe sesión de nube y está en línea, intenta recuperar/conciliar el workspace sin sobrescribir una cola de cambios locales pendiente. El estado explica si los datos siguen offline o si hubo consulta remota; nunca inventa un “live” exitoso.
- Franja de totales: **Depósitos, Retiros, Transferencias** con recuento cero explícito. Los importes se agrupan por moneda, no se suman USD con VES. La transferencia cuenta **una** operación aunque se representen **dos filas** (envío negativo y recepción positiva).
- Columna izquierda: horas en Caracas, tipo de movimiento, participante, destinatario, importe y estado. Las cancelaciones permanecen visibles con el estado «Anulada», pero no aumentan los totales. La etiqueta `DEP AVAL` de referencia no se inventa a partir de cualquier `adjustment`: hará falta un dato de origen o tipo explícito en el modelo.
- Columna derecha: contador de carreras; tarjetas ordenadas por actividad registrada más reciente, cada una con hipódromo y número, pizarra, jugadas, caballo, rol, estados y panel independiente de resultados liquidados por participante. Cada tarjeta tiene su propio **Copiar**. El texto generado muestra fecha, grupo, carrera, pizarra, líneas autorizadas, anulaciones, pendientes y resultados confirmados; se niega a copiar cuando hay referencias entre grupos.
- Distinción financiera necesaria: el número destacado calculado en la tarjeta es **«saldo neto liquidado entre los participantes»**, NO beneficio, utilidad, caja ni recaudación de la casa. No es posible determinar la fórmula exacta del badge verde del sitio de referencia sin el sistema real y sus contratos.
- Layout responsive: dos columnas a ancho amplio; apilado en tablet/móvil; tabla horizontal cuando sea necesario; zonas de toque de tamaño cómodo, estado de carga/texto, sin dependencias CSS paralelas.

## 3. Reporte diario de movimientos (tercera URL)

**NO VERIFICADO VISUALMENTE:** el enlace indica una ruta de reporte de movimientos pero no se proporcionó una captura que atribuya inequívocamente a esa tercera página su contenido. La versión interna ofrece un listado por fecha, total por tipo y moneda, estado/anulación, participante y copia/PDF. **No se afirma que la tercera página externa tenga los mismos botones, columnas o reglas.**

## 4. Matriz de controles implementados en el PR #999

| Control | Acción interna concreta | Invariantes | Verificación |
|---|---|---|---|
| **Ver** | Valida fecha y participante en el grupo activo; recalcula los tres modelos | Solo lectura; no cambio de carrera/ledger | Test fecha, XSS, cross-group y saldo |
| **Hoy** | Restablece fecha a Caracas sin mutar workspace | No simula descarga de la nube | Test de borde UTC↔Caracas |
| **Actualizar** | Flushea escrituras pendientes; intenta fetch+merge de la nube si modo cloud, sesión y conectividad; preserva workspace si outbox pendiente o red falla | No duplica movimientos ni escribe al ledger por abrir informe | Tests de modelo; **E2E con nube real PENDIENTE** |
| **Movimientos / Carreras** | Cambia pestaña `daily-movements↔race-history`, conserva fecha/grupo | No cruza participantes ni acepta URL token ajeno | Contratos de DOM/datos |
| **Copiar** por carrera | Filtra la carrera por ID, grupo, fecha; limita resultados al participante si procede | Peligro de copia rechazada si hay referencias cross-group; sin escritura de datos | Tests de acceso/cancelaciones |
| **Copiar resumen / PDF** | Exportación interna existente, reusando `reports.js` | Privado; no enviar por WhatsApp automáticamente | Tests de modelo y PDF previa |
| Recalcular estados | Solo apuesta `settled` con liquidación tiene resultado económico | Pending ≠ 0, cancelled ≠ settled | Test de badges y outcomes |

## Brechas posteriores que NO se han cerrado

- Captura REA real, HTML/DOM y funcionamiento verdadero de los botones de la web externa; será trabajo posterior con Codex o Chrome CDP autorizado.
- Conciliación entre `workspace` local y `hipico_money_ledger_entries` PostgreSQL. Los dos son sistemas de lectura distintos hoy; no declarar equivalencia hasta pruebas de doble entrada, avales y cierre de fecha.
- Depósitos aprobados/eliminados, avales y retiros con tipos/evidencia de aprobación dentro del dominio de movimientos; texto parecido en UI no es evidencia de la política original.
- Refresco HTTP real, tiempos de actualización, polling automático, errores y estado de red del tercero; pruebas de concurrencia/offline, Android real y Playwright visual.
- «Hoy» y «Actualizar» de las páginas externas podrían tener comportamientos distintos. Los controles internos aquí tienen semántica propia documentada y reversible.

## Puertas de calidad y retroceso

```bash
npm run test:hipico:reference
node --check frontend/public/hipico-control/assets/js/app.js
node --check frontend/public/hipico-control/assets/js/reference-report-operations.js
node --check frontend/public/hipico-control/assets/js/reference-report-ui.js
npm run test:hipico:visual-contract
npm run test:browser:hipico
```

El workflow `Control Hípico reference reports — synthetic contracts` ejecuta los dos suites sintéticos en Node 22, junto a sintaxis de módulos. Distinguir esas pruebas de Playwright y pruebas físicas que hará el propietario al cerrar los tickets. El cache PWA se rotó de r36 a r37 y Android requiere el nuevo módulo `reference-report-operations.js`. No hay cambios DB, WhatsApp SOURCE, ni escrituras financieras. Rollback mediante revert del PR.
