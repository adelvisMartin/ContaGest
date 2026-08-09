# ContaGest — Matriz comercial v1

> Referencia comercial, no precio hardcodeado. `Subscription.amount`, ciclo y límites son la fuente contractual real. Revisar trimestralmente con datos de ventas/soporte.

## Objetivo
Entrar al mercado sin destruir margen ni obligar al fundador a financiar infraestructura antes de cobrar. El núcleo de valor es contabilidad/reportes + control operativo. Las verticales y canales son opcionales.

| Plan | Precio objetivo mensual | Precio fundador temporal | Empresas incluidas | Usuarios distintos | Soporte | Núcleo |
|---|---:|---:|---:|---:|---|---|
| Profesional | USD 19 | USD 15 | 1 | 2 | estándar | clientes, cotización, ventas, reportes |
| Vendedor / Comercio | USD 22 | USD 18 | 1 | 3 | estándar | ventas, clientes, inventario, kardex, reportes |
| PyME Integral | USD 32 | USD 27 | 1 | 5 | estándar | ventas, compras, inventario, bancos, contabilidad, reportes |
| Contador Multiempresa | USD 45 | USD 39 | 3 | 3 | prioritario | contabilidad completa, bancos, tributos y reportes multiempresa |

### Empresa adicional
Referencia: **USD 12/mes por RIF adicional** en el plan Contador. El contrato puede cambiar este monto; el backend almacena límites/entitlements y no presupone que editar un RIF habilita una empresa.

### Verticales opcionales
No obligatorias para PyME, vendedor ni contador:
- Salud/práctica médica: cotizar como add-on según alcance y soporte.
- Veterinaria: add-on.
- Fitness/gimnasio: add-on.
- Restaurante/POS: add-on.

Hasta tener datos reales de soporte, una referencia prudente es **USD 10–20/mes por vertical** sobre un plan base compatible, no crear un ERP completamente separado.

### Add-ons variables
- IA: cuota incluida muy pequeña o add-on con límite de consumo; excedente facturable.
- Email: opcional; costo de proveedor + margen/administración.
- WhatsApp/SMS: opcional; costo de proveedor + margen/administración. Nunca “ilimitado” si el proveedor cobra por uso.

## Activación / onboarding

El primer cliente no debe obligar al fundador a financiar dominio, VPS, importación y soporte. Cobrar una activación según trabajo:
- configuración simple: USD 25–40;
- importación/configuración media: USD 50–100;
- migración/integración especial: cotización.

Puede bonificarse activación si el cliente prepaga 6/12 meses y el margen cubre infraestructura + onboarding.

## Prepago y caja

Para financiar infraestructura anual/prepagada:
- mensual: precio de lista;
- 6 meses: descuento máximo orientativo 5–8%;
- 12 meses: descuento máximo orientativo 10–15%, solo si el prepago mantiene margen.

No ofrecer “2 meses gratis” automáticamente: calcular primero infraestructura, comisión, soporte, APIs variables e impuestos/costos de cobro.

## Vendedores/partners

Referencia inicial:
- primera venta: 15–20% del primer cobro neto;
- recurrente meses siguientes: 5–10% mientras el vendedor/partner mantenga relación/soporte acordado;
- renovación anual: 5% si hubo intervención comercial real.

La tabla `Commission` registra lo devengado/pagado. Evitar una comisión recurrente alta de por vida sin obligación de soporte porque deteriora el margen.

## Regla de precio mínimo

Antes de aceptar una cuenta:

`precio >= infraestructura atribuible + APIs variables + soporte esperado + comisión + pasarela + margen objetivo`

No competir únicamente por ser más barato. El descuento fundador debe tener fecha/condición y quedar registrado en la suscripción.

## Qué medir desde el cliente 1

- MRR/ARR.
- ARPA (ingreso medio por cuenta).
- margen bruto.
- horas de onboarding y soporte por cliente.
- churn y motivo.
- empresas por contador.
- módulos realmente usados.
- costo IA/canales por cliente.
- comisión pagada.

Después de 5–10 cuentas reales, reemplazar estimaciones por datos y recalibrar esta matriz.
