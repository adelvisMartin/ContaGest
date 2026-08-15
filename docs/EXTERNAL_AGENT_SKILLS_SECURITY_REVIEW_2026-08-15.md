# Revisión de seguridad — Superpowers, ECC y skills/agentes externos

**Fecha:** 2026-08-15

## Decisión

Se revisan sus patrones públicos de trabajo, pero **no se instalan hooks, postinstall, ejecutores shell, MCPs ni agentes externos a ciegas** dentro de ContaGest/Control Hípico.

Patrones útiles adoptables:

- debugging sistemático basado en reproducir → aislar → demostrar causa → corregir → regresión;
- TDD RED → GREEN → REFACTOR en lógica determinista;
- verification-before-completion: ninguna afirmación de PASS sin ejecutar la evidencia;
- revisión frontend/backend/security antes de cerrar un cambio;
- investigación antes de introducir una dependencia o API.

## Amenazas consideradas

1. prompt injection dentro de `SKILL.md`, issues, repos o documentación;
2. hooks que ejecuten shell automáticamente;
3. `postinstall`/scripts de paquetes con acceso al runner;
4. lectura accidental de `.env`, tokens, claves API o secretos del CI;
5. exfiltración por red/MCP;
6. permisos de escritura GitHub excesivos;
7. dependencias transitorias o binarios no auditados;
8. instrucciones que intenten desactivar QA, seguridad o revisión humana;
9. acciones irreversibles sobre ramas, datos o producción.

## Política de admisión

Una skill externa solo puede vendorizarse después de:

1. identificar repo y commit exacto;
2. inspeccionar manualmente `SKILL.md`, scripts, hooks, package manifests y workflows;
3. rechazar ejecución automática no necesaria;
4. comprobar que no requiere secretos para una tarea que puede ser local;
5. eliminar telemetría/red no necesaria;
6. ejecutar en sandbox con datos sintéticos;
7. documentar hash/commit y licencia;
8. convertir, cuando sea posible, el patrón en una skill **propia del repositorio** con permisos mínimos;
9. revisión de un segundo maintainer antes de activar hooks persistentes.

## Lo que NO debe hacer una skill de ContaGest

- `curl | sh`, ejecución remota o descarga de binarios no verificados;
- imprimir `.env` o variables secretas;
- force-push, borrar ramas o mergear `main` por iniciativa propia;
- desactivar tests para “hacer pasar” CI;
- crear bypass de RBAC/licencias;
- mandar contenido clínico/contable a servicios externos sin contrato explícito;
- ejecutar acciones monetarias de Control Hípico.

## Control Hípico

La automatización del bot usa la misma política de privilegio mínimo:

- **shadow por defecto**;
- greeting/help/status pueden ser candidatos a automatización no monetaria;
- apuesta, saldo, cierre, llegada/resultado y liquidación requieren revisión humana;
- webhook firmado + deduplicación + idempotencia antes de cualquier escalamiento;
- un grupo real requiere Bridge soportado y pruebas laboratorio; no se emula una capacidad de grupo mediante una API que no la soporte.

## Resultado

Se aprovechan prácticas de Superpowers/ECC como metodología, pero se evita importar su superficie ejecutable completa. Esto reduce supply-chain y prompt-injection sin renunciar a debugging, TDD y verification discipline.
