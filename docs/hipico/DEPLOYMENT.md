# Control Hípico · Deployment

## Entornos

Mientras el producto continúe dentro del repositorio anfitrión, usa el mismo flujo Git/Vercel con rutas aisladas bajo `/hipico-control/`. La meta de arquitectura permite separarlo posteriormente a proyecto Vercel/repositorio propio sin reescribir el dominio.

- Development: trabajo local y caracterización.
- Preview: PR/branch para build y QA.
- Production: únicamente desde `main` después del gate.

## Gate de promoción

1. branch actualizada contra `main` y sin conflictos;
2. diff revisado por alcance;
3. build Vite/Vercel READY;
4. tests ejecutados o marcados explícitamente NOT EXECUTED/BLOCKED;
5. auditoría de identidad: sin `Triple Crown` en build visible;
6. manifest/SW/asset paths válidos;
7. ninguna clave privada en frontend;
8. rollback conocido;
9. merge PR con SHA esperado;
10. confirmar que producción sirve el merge SHA.

## Rollback

El rollback preferido es redeploy/revert de un commit conocido. No borrar IndexedDB automáticamente. Si una versión cambia esquema, la migración debe documentar forward/rollback y exportación previa.
