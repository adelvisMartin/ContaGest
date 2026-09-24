# Clean Code · verticales · lote 1

## Alcance

Refactor behavior-preserving sobre el estado integrado de las implementaciones 26–32 y 37–40, con foco directo en 38/51.

### Veterinaria

`veterinary.routes.ts` redeclaraba `ctx` y `one` aunque `verticals.shared.ts` ya es la autoridad compartida usada por otros verticales.

Cambio:

- reutiliza `ctx` y `one` desde `verticals.shared.ts`;
- conserva `optionalText` y `optionalDate` locales porque sus límites son distintos y cambiarlos alteraría el contrato;
- no cambia rutas, permisos, SQL, transacciones ni payloads.

### Gimnasio

La validación de configuración de progresión estaba repetida en:

- evaluación 38/51;
- ejercicios de rutina 37–38/51;
- coherencia RIR/RPE de series 40/51.

Cambio:

- `gymProgressionConfigIssues()` concentra las reglas de estrategia;
- `isRirRpePairCoherent()` concentra la relación RIR/RPE;
- los schemas Zod sólo traducen issues de dominio a paths del payload;
- `evaluateGymProgression()` conserva su comportamiento y versión `gym-progression-38-v1`.

## Riesgo

Bajo/medio: validación de entrada. No hay cambios de persistencia.

## Regresión

- se actualiza el contrato 38/51 para reconocer la nueva autoridad;
- `tests/verticals_clean_code_refactor.test.mjs` bloquea clones futuros y verifica rutas críticas.

## Verificación remota

GitHub Actions sigue sujeto a #134. Un job sin runner/steps/logs se clasifica **BLOCKED_INFRASTRUCTURE**, nunca PASS.
