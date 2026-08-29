# Control Hípico 1.13.0-rc2 · Pilot candidate

## Identidad

- Version: `1.13.0-rc2`
- Android versionCode: `1130002`
- Canal: `pilot`
- Workspace schema: `10`
- Parser contract: `whatsapp-parser-v1`
- Android applicationId: `com.adelvis.hipicocontrol.rel`

## Qué representa

Este release candidate consolida el runtime PWA/APK canónico y añade evidencia de distribución ligada al SHA. No constituye por sí solo una autorización para Play Store, firma release real ni escritura automatizada al grupo real de WhatsApp.

## Gates de promoción

- release metadata compatible;
- PWA ↔ Android wrapper parity por SHA-256;
- APK QA construible y hasheado;
- P0 del scope verdes;
- QA físico #119;
- backup/restore compatible #117;
- aprobación explícita para promoción.

## Riesgos conocidos / límites

- signing release real permanece fuera del repo y `NOT_EXECUTED` hasta un build autorizado;
- fresh install/upgrade/reinstall/rollback requieren evidencia física para cambiar a VERIFIED;
- downgrade directo con versionCode menor no es una estrategia soportada;
- WhatsApp production sigue gobernado por #121/#154.
