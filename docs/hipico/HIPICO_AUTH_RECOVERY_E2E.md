# Control Hípico — Password Recovery E2E Gate v28

Este gate existe para cerrar la evidencia externa pendiente de #267. La PWA ya implementa request, recovery context, cambio de contraseña, limpieza de URL y reautenticación. Este procedimiento demuestra el flujo real de email + redirect de Supabase.

## Regla principal

Usa exclusivamente una **cuenta de prueba dedicada y descartable**. No uses una cuenta real de operación, administrador comercial ni una cuenta compartida.

El workflow no usa service role, Admin API ni secretos privilegiados. Sólo usa la publishable key y credenciales efímeras generadas en memoria.

## Secrets necesarios

Configura temporalmente en GitHub Actions:

- `HIPICO_SUPABASE_URL`
- `HIPICO_SUPABASE_PUBLISHABLE_KEY`
- `HIPICO_AUTH_RECOVERY_TEST_EMAIL`

Para COMPLETE también:

- `HIPICO_AUTH_RECOVERY_EMAIL_LINK`

`HIPICO_AUTH_RECOVERY_EMAIL_LINK` debe contener el enlace completo recibido en el correo real de recovery. Es sensible y nunca debe pegarse como workflow input, issue, comentario, artifact o log.

## Fase REQUEST

1. Abre el workflow **Hípico Auth Recovery E2E v28**.
2. Usa el candidate SHA exacto que quieres verificar.
3. Selecciona `REQUEST`.
4. Confirma `dedicated_test_account_ack=true`.
5. Ejecuta el workflow.

El script llama a `/auth/v1/recover` con la publishable key y el redirect fijado a:

`https://conta-gest-frontend.vercel.app/hipico-control/`

Un REQUEST exitoso produce:

- `status=PASS`
- `requestAccepted=true`
- `e2eComplete=false`

REQUEST PASS **no** demuestra todavía que la allowlist, el correo ni el click real funcionen.

## Obtener el enlace real

Revisa el inbox de la cuenta de prueba dedicada. Copia el enlace de recuperación real del correo sin abrirlo en una sesión de usuario normal.

Guárdalo temporalmente como secret:

`HIPICO_AUTH_RECOVERY_EMAIL_LINK`

No publiques ese enlace: puede contener material de recuperación de un solo uso.

## Fase COMPLETE

1. Usa el mismo candidate SHA.
2. Selecciona `COMPLETE`.
3. Mantén `dedicated_test_account_ack=true`.
4. Ejecuta el workflow.

El verifier:

1. acepta únicamente un link HTTPS del origen Supabase configurado y path `/auth/v1/verify`;
2. sigue redirects manualmente sin imprimir URLs sensibles;
3. exige que el redirect final sea exactamente `https://conta-gest-frontend.vercel.app/hipico-control/`;
4. consume el recovery access token sólo en memoria;
5. consulta `/auth/v1/user` para fijar el UUID original;
6. genera una contraseña aleatoria fuerte sólo en memoria;
7. actualiza la contraseña mediante `PUT /auth/v1/user`;
8. reautentica mediante `/auth/v1/token?grant_type=password`;
9. exige el mismo UUID;
10. comprueba `hipico_profiles.owner_id`;
11. comprueba `hipico_users.user_id` y `workspace_owner_id`;
12. cierra la nueva sesión mediante `/auth/v1/logout`.

La contraseña aleatoria no se muestra ni se conserva. Para reutilizar la cuenta de prueba en otro ciclo, solicita un recovery nuevo.

## Evidencia

El artifact contiene sólo información sanitizada:

- candidate SHA;
- phase;
- PASS / FAIL / NOT_EXECUTED;
- booleans de verificación;
- fingerprints SHA-256 de email/UUID/workspace;
- redirect público esperado.

No contiene:

- email raw;
- password;
- recovery link;
- access token;
- refresh token.

Un `COMPLETE PASS` requiere:

- redirect exacto;
- identidad estable;
- perfil existente;
- workspace/access existente;
- logout exitoso.

Sólo COMPLETE PASS produce `e2eComplete=true`.

## Limpieza obligatoria

Después de usar COMPLETE, **elimina** el secret temporal `HIPICO_AUTH_RECOVERY_EMAIL_LINK`. No lo reutilices ni lo archives.

Si COMPLETE falla después del cambio de contraseña, la cuenta de prueba sigue siendo recuperable solicitando otro email. No intentes rescatar la contraseña aleatoria desde logs: nunca debe aparecer allí.

## Cierre de #267

No cerrar #267 sólo porque este workflow exista.

#267 se puede cerrar cuando haya evidencia publicada de un **COMPLETE PASS real** sobre el candidate SHA correspondiente, demostrando correo real + redirect permitido + update + reauth + identidad/perfil/workspace preservados.

Si GitHub Actions no asigna runner y el job queda sin steps/logs, el estado es `BLOCKED_INFRASTRUCTURE`, nunca PASS.
