# Gate legal de producción

No habilitar clientes reales hasta completar todos los ítems obligatorios.

- [ ] Identidad legal del proveedor definida y cargada en `LEGAL_PROVIDER_*`.
- [ ] Abogado venezolano revisó Términos, Privacidad, Cookies, Uso Aceptable y Suspensión/Terminación.
- [ ] Se validó régimen actual de contratos de adhesión/protección al consumidor aplicable al tipo de cliente.
- [ ] Se definió emisión de factura/recibo, impuestos y moneda contractual.
- [ ] Se aprobó política de renovación, mora, gracia, reembolso y cancelación.
- [ ] Se validó jurisdicción/mecanismo de disputas.
- [ ] Se publicó contacto real de privacidad y soporte.
- [ ] Inventario real de subprocesadores/hosting/backups completado.
- [ ] Transferencias internacionales evaluadas si corresponden.
- [ ] Tabla de retención por categoría aprobada.
- [ ] Proceso de exportación y borrado probado.
- [ ] Legal hold definido.
- [ ] Corrección excepcional de RIF requiere identidad + documento SENIAT + doble aprobación + auditoría.
- [ ] Cambios de documentos incrementan versión; CI verifica hash y primer acceso.
- [ ] Modal legal probado en móvil/tablet/desktop y con teclado.
- [ ] Rechazar términos cierra sesión; ninguna API de negocio queda accesible con aceptación pendiente.
- [ ] Cookies necesarias documentadas; analítica backend OFF por defecto; marketing OFF.
- [ ] Para Salud humana: addendum, confidencialidad, retención, roles, incidentes y proveedores revisados por especialista.
- [ ] Para veterinaria/fitness: revisar qué datos de personas se recopilan y minimizar.

**Regla:** que el código esté verde no convierte este checklist en asesoría jurídica. El release owner debe adjuntar evidencia de la revisión profesional antes del primer tenant real.
