# Contrato de configuración #665 — inventario centralizado (fase 1)

Catálogo tipado `config/environment-manifest-v665.mjs`, compatible con el
código ya fusionado de #946 (auditor frontend) y #955 (startup backend).
Registra **90 variables backend, 41 del Bridge y 6 del frontend** actualmente
versionadas en `.env.example`, además de 1 secreto opcional del backend y
5 metadatos de build/proveedor sin plantilla. Ningún valor real de secreto
está incluido.

Cada entrada identifica owner, tipo, exposición, sensibilidad, requiredness y
política del ejemplo. El test `npm run test:config:manifest` comprueba:
claves agregadas/quitadas sin registrar, defaults inseguros en SOURCE/LAB,
diferencias de alias y clasificación de credenciales públicas. Forma parte
del comando existente `npm run test:hipico:config`; **no** reemplaza los
validadores de configuración runtime del backend/Bridge.

## Plan de retirada de alias

| Propietario | Legado | Canónico | Criterio |
|---|---|---|---|
| backend | `HIPICO_SOURCE_CHANNEL_KEY` | `HIPICO_OFFICIAL_SOURCE_CHANNEL_KEY` | Inventario de usos + rollout |
| backend | `WHATSAPP_GRAPH_VERSION` | `WHATSAPP_GRAPH_API_VERSION` | Paridad en proveedores |
| backend | `HIPICO_BOT_OPERATOR_TOKEN` | `HIPICO_OPERATOR_CONTROL_TOKEN` | Sin consumidores legacy |

No usar `DATABASE_URL` como alias de `DATABASE_RUNTIME_URL` ni
`DIRECT_DATABASE_URL`: roles DML, migraciones y backup siguen aislados.

## Entornos

- **Local/Windows:** tres plantillas independientes; valores sensibles
  exclusivamente fuera de Git.
- **Vercel/Netlify:** `VITE_*` es público; SHA y metadatos de build nunca
  sirven como semilla privada JWT.
- **Supabase:** conservar las conexiones DML pooler runtime, DDL directa y
  backup como autoridades diferentes; sin migraciones automáticas.
- **Docker/self-host:** nombres iguales a estas plantillas; no existe un
  compose raíz en el snapshot auditado. El mapeo real y su smoke permanecen
  como criterio pendiente y NO se presentan como PASS.

**Pendientes:** integrar progresivamente el catálogo con validación runtime
de todos los entrypoints, QA Node/TS exact-SHA, bundle de frontend, secretos
del proveedor y smoke Docker. No cerrar #665 antes de esas evidencias.
