# Control Hípico — ticket de implementación: remates/subastas de caballos

**Épica padre:** [#837 Control Hípico 100%](https://github.com/adelvisMartin/ContaGest/issues/837). **Referencias:** LatamTurf vendedor/remate y [HipNumber](https://hipnum.com/). Las páginas externas son evidencia de producto, no especificación ni código para copiar.

## Objetivo
Caracterizar y, si el owner confirma que remates son parte del producto Hípico, entregar un módulo opcional de remates con catálogo, recepción de ofertas/pujas, adjudicación, ticket y liquidación/cuadre auditable. Debe permanecer separado de apuestas, saldos de participantes y reportes compartidos.

## Contexto y límite de observación

En la referencia LatamTurf se observaron una selección de carrera, número de pizarras, porcentaje de casa, incentivo y un cuadro con subastado, retención, incentivo, devolución de retirados y total de casa. La página declaraba modo “solo tickets”. HipNumber se usa como referencia pública para catálogo de ejemplares, medios/pedigree, aprobación de compradores, coordinación de sala+online y liquidaciones. Ninguna observación confirma reglas legales, fórmulas monetarias correctas, integridad del backend ni autorización para copiar código/diseño. Validar requisitos con el owner y usuarios reales antes de una migración.

## Alcance

1. **Descubrimiento y autoridad**
   - Documentar personas/roles: administrador, consignador/vendedor, martillero, cajero, comprador y auditor.
   - Confirmar si el negocio es remate/venta de caballos, subasta de otra mercancía o ambos; no mezclar con apuestas hípicas.
   - ADR de bounded context, datos personales/documentos necesarios y relación con identidad Hípico existente.
   - Definir moneda, impuestos, comisión, incentivo, redondeo, depósitos/garantías, retiros, anulaciones y liquidación con asesoría de negocio/contable. No importar porcentajes/formulas del competidor.

2. **Catálogo y eventos**
   - evento/remate, lote, ejemplar (referencia/caballo), consignador, comprador aprobado, hipódromo/local, sesión/pizarra, medios autorizados y documentos.
   - Estados: `draft → published → open → closed → awarded → settled`; vías explícitas `withdrawn|cancelled|disputed` con motivo y actor.
   - Catalogación/publicación con historial, validación de lote duplicado y controles de acceso.

3. **Pujas y adjudicación**
   - ofertas con importe exacto Decimal, moneda, actor, reloj servidor, orden, pizarra y evento; ninguna puja se acepta tras cierre.
   - Adjudicación atómica por lote; un solo ganador. Concurrencia optimista/lock, idempotency key, rechazo observable y bitácora append-only.
   - No habilitar puja offline hasta diseñar orden fiable y resolución de conflicto; si se corta red, bloquear y mostrar estado real.
   - Hacer pruebas de sala+operador simultáneo, reintento tras timeout, cierre, retiro y empate/disputa según reglas aprobadas.

4. **Tickets, pagos y liquidación**
   - Numeración no reciclable; ticket de comprador/consignador incluye evento, lote, moneda, precio, cargos aprobados, actor y corte temporal.
   - Liquidación por consignador/comprador con importes reconstruibles desde eventos; comisión, incentivo, retención y devolución son reglas configuradas/revisadas, no constantes UI.
   - Registrar pago, saldo pendiente y reembolso mediante ledger autoritativo del producto si existe; ADR debe decidir autoridad contable antes de implementar efectos económicos.
   - Caja/turno, anulaciones/reversos y cierre de remate reconciliables; imprimir/exportar solo datos autorizados.
   - **No** integrar apuestas de carrera, saldos de apostadores o la fórmula del cuadre ajeno a esta autoridad.

5. **UX y permisos**
   - Lista de eventos y estados; catálogo móvil; vista del martillero con controles grandes; tablero/cola en vivo; adjudicación confirmable; cuadre con drill-down; estados loading/empty/error/offline.
   - RBAC explícito para publicar, aceptar pujas, adjudicar, corregir, reembolsar, cerrar y exportar.
   - Aislamiento por owner/organización y auditoría de lectura/exportación donde aplique.

## Fuera de alcance

- Copiar/raspar datos privados de LatamTurf/HipNumber, sus assets, código, perfiles o endpoints.
- Reemplazar el ledger hípico o implementar una segunda autoridad financiera.
- Ingreso de apuestas/venta de tickets de carreras, automatización WhatsApp o resultado oficial de carrera.
- Bids/ventas contra datos de producción durante QA.
- Marcar cumplimiento fiscal/legal sin revisión y evidencia profesional.

## Criterios de aceptación

- [ ] ADR aprobado por owner con necesidad, roles, términos de negocio, moneda y authority de dinero, antes de DDL.
- [ ] Modelo versionado y tenant/owner-scoped; autorización server-side y constraints DB contra doble adjudicación.
- [ ] Máquina de estados y comandos idempotentes cubren abierto/cerrado/retirado/anulado/disputado/adjudicado/liquidado.
- [ ] Importes Decimal, sin suma entre monedas; reglas y redondeo versionados/reconstruibles; total concilia con cada ticket/liquidación.
- [ ] Dos operadores no adjudican doble y retry/reconnect no crea dos pujas, tickets o efectos financieros.
- [ ] Ticket secuencial no reciclable, reimpresión identificada, anulación y reembolso auditables.
- [ ] RBAC, aislamiento A/B, IDOR, exportación y XSS negativos.
- [ ] QA con PostgreSQL aislado, migración from-zero/upgrade, fixtures de carrera/remate, concurrencia, browser mobile/desktop, teclado y auditoría.
- [ ] Smoke de flujo completo draft→publish→open→bid→award→settlement→close solo con datos sintéticos.
- [ ] Gate/release evidence ligada al SHA exacto; rollback documentado. Producción requiere autorización separada.

## Dependencias

- #837 (scope y release Hípico), arquitectura/persistence authority Hípico, seguridad tenant/RBAC y recuperación #842.
- Comprobar tickets abiertos de ledger/contabilidad antes de definir pago/liquidación.

## Prioridad sugerida

`P1` tras confirmar alcance con el owner; no es gate para el bot LAB ni para reportes actuales. Si el negocio no ofrece remates, cerrar como `NOT_APPLICABLE` con evidencia y no construir.
