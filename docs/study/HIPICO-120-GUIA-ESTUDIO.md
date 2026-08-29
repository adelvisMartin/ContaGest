# Guía de estudio — Hípico #120: Capacity & Soak

## 1. Load, burst y soak no son lo mismo

- burst: muchos eventos en poco tiempo;
- load: carga sostenida con throughput objetivo;
- soak: operación prolongada para encontrar leaks/degradación.

El scenario de #151 genera burst/load lógico; #120 añade tiempo, memoria, health y recovery.

## 2. Thresholds antes del test

Si se decide el límite después de ver el resultado, el gate pierde valor. La policy versiona thresholds antes de la ejecución.

## 3. Crecimiento por hora

No basta mirar RSS final. El gate calcula crecimiento aproximado por hora de RSS y heap, porque un leak lento puede parecer pequeño en un smoke de minutos.

## 4. Event loop

Un Node process puede seguir “vivo” mientras el event loop tiene latencias enormes. Por eso se captura p95.

## 5. Backlog

Spool size y edad del mensaje más viejo indican si el sistema procesa al ritmo que recibe. Una cola que sólo crece es degradación aunque no haya crash.

## 6. Restart/reconnect

El soak debe incluir fallos controlados. Un proceso estable 24h sin recovery test no demuestra resiliencia.

## 7. SOURCE invariant

Replay/carga se hace con LAB/local. SOURCE continúa read-only durante el soak.

## 8. Smoke only

Un test de 6 segundos puede comprobar que el runner funciona; no aporta 24h de evidencia. El software representa esa diferencia como `SMOKE_ONLY`.

## Preguntas de repaso

1. ¿Qué problema detecta un soak que no ve un burst test?
2. ¿Por qué medir backlog age además de tamaño?
3. ¿Qué significa crecimiento RSS por hora?
4. ¿Por qué un restart drill es parte del DoD?
5. ¿Por qué un smoke sano no debe decir PASS?
