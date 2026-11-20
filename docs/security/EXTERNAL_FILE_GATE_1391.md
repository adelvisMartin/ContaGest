# #1391 · Control antimalware de archivos externos (fase integrada)

## Riesgo y límite de protección
Un archivo externo puede incorporar malware, macros, contenido activo, enlaces externos,
archivos comprimidos maliciosos o contenido que explote un parser. Que un archivo
tenga una extensión admitida y una firma MIME correcta **no prueba** que sea seguro.
El escáner de firmas reduce exposición, pero no garantiza ausencia de amenazas.

## Gate efectivo en este PR
- **Imágenes /media/upload:** JPEG/PNG/WebP mantienen el control de Base64,
  firma binaria, tamaño, tenant/ACL; escaneo local ClamAV obligatorio **antes
  de subir bytes a Supabase**.
- **/media/dental-attachments:** 15 MB máx.; autorización por paciente/tenant,
  firma MIME y escaneo obligatorio antes de almacenar y vincular historia clínica.
- **/hipico/documents y bridge:** el servicio canónico compartido ejecuta el
  escaneo después de validar el PDF y antes de `store.put`, extracción u OCR.
  El reprocesamiento de archivos existentes también exige nueva lectura limpia.
  No se habilita mensajería SOURCE, autolectura ni autoenvío.
- **/imports/file-scan:** lectura binaria de 5 MB como máximo, exige permiso
  `admin.manage`, no persiste el archivo, emite sólo estado limpio y SHA-256.
  La UI exige ese preflight antes de extraer la tabla de entrada. Las rutas
  normales de `/imports/preview` siguen validando filas JSON escalares
  autorizadas; no reciben archivos ejecutables.
- **XLSX:** el previsualizador existente limita expansión, entradas, CRC,
  referencias, celdas, fórmulas y XML DTD. Se bloquean macros/VBA, OLE/ActiveX,
  links/relaciones y conexiones que no se interpretan de forma segura.

## Servicio local obligatorio
Instalar y mantener **ClamAV clamd** (libre) en el mismo entorno de red del
backend, sin servicio de análisis público. El backend se conecta únicamente a
`127.0.0.1` mediante protocolo INSTREAM (puerto `3310` por defecto);
el puerto puede ajustarse con `CONTAGEST_CLAMD_PORT` (entero 1..65535).
Configurar en clamd, según instalación, `TCPSocket 3310`,
`TCPAddr 127.0.0.1`, `StreamMaxLength` superior a 15 MB, y
actualización periódica de firmas (freshclam).

**Nunca abrir el socket ClamAV a Internet.** No hay conmutador que acepte
archivos sin scanner. Un rechazo, amenaza detectada, error, corte de conexión,
timeout (8 s) o respuesta desconocida bloquea la operación:
`EXTERNAL_FILE_MALWARE_DETECTED` (422),
`EXTERNAL_FILE_SCAN_REJECTED` (422) y
`EXTERNAL_FILE_SCAN_UNAVAILABLE` (503).
El contenido ni el nombre de la firma se envían a logs o respuesta.

Un backend serverless que no pueda acceder a `127.0.0.1:3310` tendrá el
flujo de uploads **BLOCKED**. No se debe promover como operativo hasta
desplegar ClamAV junto al backend y ejecutar el smoke de subida con un
archivo benigno y un vector EICAR sintético, siempre en entorno aislado.
No enviar datos clínicos a escáneres públicos para resolver ese bloqueo.

## Evidencia exigida para certificación
1. `npm --workspace backend run typecheck` y build en exact SHA.
2. `npm --workspace backend run test:hipico`; unit del scanner
   `backend/src/shared/security/external-file-scan.test.ts`.
3. PostgreSQL 17 **efímero**, permisos A→B/B→A, denegación EICAR,
   ClamAV caído, errores, timeouts y replay. Confirmar cero escrituras al
   rechazar y que no se filtran objetos ni URLs firmadas.
4. Navegador real: CSV, TSV, JSON, XLSX normales y maliciosos;
   clínicas y Hípico permitidos sólo con scanner disponible;
   errores legibles, loading/disabled, light/dark y accesibilidad.
5. Escaneo/retención de archivos que existían antes del cambio:
   **no implementado retroactivamente**. Requiere estrategia de
   cuarentena, rescaneo y custodia clínica/contable antes de considerar
   el histórico confiable.

No habilitar producción por un test de firma o simulador ClamAV:
es necesaria evidencia de un demonio ClamAV real, actualizado, y
de los recorridos de autorización, storage y persistencia.
