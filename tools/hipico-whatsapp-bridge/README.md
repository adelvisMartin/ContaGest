# Hípico WhatsApp Group Bridge

Puente gratuito para la prueba **dentro de un grupo real de WhatsApp** usando una sesión de WhatsApp Web vinculada a una cuenta normal. No sustituye ni se presenta como la API oficial de Meta.

## Por qué existe
La WhatsApp Cloud API oficial documenta actualmente envíos a `recipient_type: individual`; por eso la prueba del grupo no debe depender de intentar agregar un número de Cloud API a un grupo normal. Este bridge usa la sesión web de una cuenta de WhatsApp que sí pertenece al grupo y reenvía cada evento al backend de Hípico Control.

## Arquitectura

```text
Grupo WhatsApp
   ↓
Cuenta normal vinculada como dispositivo web
   ↓
whatsapp-web.js
   ↓  (persistencia local antes de red)
spool/data
   ↓
/api/hipico/group-bridge-ingest
   ↓
Supabase hipico_messages
   ↓
router/agentes
   ↓
acción autorizada
   ↓
bridge responde al mismo grupo
```

## Requisitos
- Windows/macOS/Linux con Internet estable.
- Node.js 22+.
- Una cuenta de WhatsApp normal que sea miembro del grupo.
- El proyecto Hípico/ContaGest desplegado en Vercel.
- Un secreto `HIPICO_GROUP_BRIDGE_TOKEN` configurado únicamente en el entorno de Vercel y en la máquina bridge.

## Instalación

```bash
cd tools/hipico-whatsapp-bridge
npm install
```

Configura las variables de `.env.example` en el entorno del proceso. El archivo real con secretos no se sube al repositorio.

Primera ejecución:

```bash
npm start
```

1. Aparece un QR.
2. En el teléfono abre WhatsApp → Dispositivos vinculados → Vincular dispositivo.
3. Escanea el QR.
4. Si solo configuraste `HIPICO_GROUP_NAME`, el bridge enumera los grupos visibles y guarda el ID exacto cuando encuentra una única coincidencia.
5. El bridge empieza a escuchar únicamente ese grupo.

## Primera prueba E2E
En el grupo configurado escribe exactamente:

```text
/hipico_status
```

Flujo esperado:
1. `message_create` recibe el mensaje del grupo.
2. El bridge lo guarda en `data/spool` antes de hacer ninguna llamada de red.
3. Lo envía al endpoint de Vercel con autenticación por token.
4. Vercel lo persiste en `hipico_messages` con idempotencia.
5. El backend devuelve una acción de diagnóstico autorizada.
6. El bridge publica en **ese mismo grupo**:

```text
Hípico Control conectado ✅
Canal: <nombre del grupo>
Recepción: activa
```

Esto demuestra lectura real del grupo + backend + persistencia + respuesta al grupo.

## Recuperación
Si Vercel o Internet fallan después de recibir un mensaje, el archivo permanece en `data/spool`. El bridge reintenta cada 5 segundos y elimina el archivo únicamente cuando el backend confirma la recepción. Reentregar el mismo mensaje no debe crear otra fila porque el backend usa el ID del mensaje/fingerprint para deduplicar.

## Seguridad
- El bridge solo escucha el grupo configurado por ID.
- No se almacenan tokens en Git.
- El endpoint requiere `x-hipico-bridge-token`.
- Los mensajes se persisten antes de interpretarlos.
- La respuesta automática general permanece desactivada mientras no pasen los gates de cierre, correlación, cobertura y conciliación.

## Riesgo operativo
`whatsapp-web.js` automatiza WhatsApp Web y no es una API oficial de Meta. Puede romperse por cambios de WhatsApp y existe riesgo de restricciones de cuenta. Por eso se usa primero en un grupo controlado y, para producción, conviene una cuenta/número dedicado y conservar conectores de respaldo. La interfaz de Hípico debe mostrar claramente si la escucha está En vivo, Retrasada, Sin conexión, Recuperando o con huecos.

## Siguiente fase
Después de `/hipico_status`, el mismo canal se usará para probar ofertas, respuestas citadas, `Sf`, cierre, tardías, llegada, liquidación y disponibles. La automatización monetaria se activa gradualmente por tipo de evento; los casos ambiguos siempre van a revisión.
