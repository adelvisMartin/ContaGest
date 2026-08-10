# Research competitivo y patrones aplicados

La aplicación no copia la interfaz de casas de apuestas. Se toman patrones de back-office: ledger auditable, estado de ticket, separación por producto, exposición/riesgo, settlement, colas y supervisión humana.

Para mensajería se prioriza la WhatsApp Business Platform oficial. La automatización del grupo existente solo se activa después de verificar soporte oficial y elegibilidad de la cuenta/canal; mientras tanto se mantienen exportación, compartir y pegado como conectores compatibles.

Para el backend se mantiene Supabase/PostgreSQL por su suficiencia para el volumen actual. El diseño usa tablas append-friendly, índices, RLS, outbox e idempotencia antes de considerar infraestructura distribuida adicional.
