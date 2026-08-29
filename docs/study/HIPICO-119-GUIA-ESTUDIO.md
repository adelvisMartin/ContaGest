# Guía de estudio — Hípico #119: Physical QA

## 1. Por qué existe

Un test de código no puede demostrar cómo se comporta un teléfono real cuando Android mata el proceso, cambia la red o una PWA instalada actualiza su Service Worker.

## 2. Evidence por SHA

La pregunta correcta no es “¿lo probaste alguna vez?”, sino “¿qué candidate SHA produjo esta evidencia?”. Por eso el recorder exige SHA Git de 40 caracteres.

## 3. PASS / FAIL / BLOCKED / NOT_EXECUTED

- PASS: se ejecutó y cumplió.
- FAIL: se ejecutó y no cumplió.
- BLOCKED: una dependencia impidió ejecutarlo.
- NOT_EXECUTED: no se intentó.

BLOCKED y NOT_EXECUTED no son verdes.

## 4. SOURCE y LAB

El gate no intenta automatizar el grupo real. SOURCE permanece read-only y LAB es el único destino de escritura durante QA.

## 5. Lifecycle

Hay que probar first install, upgrade, background/resume, process kill y reboot porque cada transición puede cambiar storage, WebView, permisos o sesiones.

## 6. Dos jornadas

Dos jornadas separadas reducen el riesgo de aprobar un caso accidentalmente favorable. No reemplazan el soak de #120.

## 7. Evidencia sanitizada

Screenshots/logs pueden contener datos sensibles. Deben recortarse/redactarse y nunca guardar QR, cookies, tokens ni chat completo innecesario.

## 8. Gate fail-closed

El script no tiene un “--assume-pass”. Si quedan escenarios sin ejecutar, devuelve NOT_READY y exit distinto de cero.

## Preguntas de repaso

1. ¿Por qué una APK que instala no demuestra recovery tras reboot?
2. ¿Qué diferencia hay entre BLOCKED y FAIL?
3. ¿Por qué el SHA debe formar parte del artifact?
4. ¿Qué invariant separa SOURCE y LAB?
5. ¿Por qué #119 no sustituye #120?
