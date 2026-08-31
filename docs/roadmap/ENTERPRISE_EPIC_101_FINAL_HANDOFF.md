# EPIC #101 — handoff final de implementación

## Estado

El roadmap de implementación del ERP llegó a la frontera correcta entre **código pendiente** y **evidencia pendiente**.

Este documento no declara producción lista. El EPIC permanece abierto hasta que los gates finales se ejecuten y queden ligados al candidate SHA.

## Únicos child issues abiertos en el snapshot

Al 2026-08-31 el inventario de issues abiertos de ContaGest deja, dentro del scope ERP de #101:

- #155 — campaña E2E transversal;
- #157 — performance/capacity;
- #134 — GitHub Actions no asigna runner;
- #97 — Branch Protection todavía no aplicada en GitHub;
- #29 — identidad/revisión jurídica profesional pendiente.

Los follow-up de repositorio preparados para esos cinco gates son:

| Issue | PR | Qué cierra en repositorio | Qué sigue siendo evidencia externa/runtime |
|---|---:|---|---|
| #155 | #205 | viewport dentro de cada caso; 3.654 casos v2 | ejecutar browser/campaña y resolver findings |
| #157 | #206 | workload 1×/3×, DB, degradación, procesos pesados | medir baseline/pico y ejecutar capacity |
| #134 | #210 | diagnóstico reproducible y artifact SHA-bound | GitHub debe asignar runner y ejecutar steps |
| #97 | #211 | aplicador/verificador + launcher Windows + evidence | aplicar setting admin y demostrar rechazo/merge |
| #29 | #209 | paridad total entre evidence y production legal gate | identidad real + abogado/revisión + E2E legal |

## Regla de cierre

No cerrar #101 porque esos PRs hayan sido mergeados. El cierre exige que:

1. #155 no tenga P0/P1 sin resolver y la matriz final esté ejecutada.
2. #157 tenga baseline real y workloads 1×/3× ejecutados.
3. #134 vuelva a ejecutar steps reales en Runner Probe, CI y PostgreSQL.
4. #97 muestre `main.protected=true` y el governance drill esté demostrado.
5. #29 tenga identidad real, atestación profesional completa y E2E legal.

## Siguiente fase

```text
merge PRs correctivos
→ congelar candidate SHA
→ ejecutar QA / capacity / governance / legal
→ defect harvesting atómico
→ re-evaluar EPIC #101
```

No se deben crear nuevas features amplias durante esa fase salvo que un hallazgo reproducible las justifique.
