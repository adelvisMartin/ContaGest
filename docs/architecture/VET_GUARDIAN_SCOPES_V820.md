# #820 — ámbitos únicos del portal de tutores

El esquema existente de autorizaciones del portal veterinario acepta sólo ámbitos enumerados, pero antes permitía repetir un mismo ámbito en el arreglo. La corrección rechaza duplicados sin ampliar la lista de permisos, duración máxima ni identidad del paciente. Se preserva el comportamiento de valores por defecto y el límite máximo de 168 horas. El cambio no distribuye tokens, no autoriza al tutor de otro tenant y no implica integración completa del portal.

Se incorporan pruebas de contrato que comprueban esta restricción y los controles anteriores. La suite completa, PG17 y pruebas del portal real siguen NOT_EXECUTED; #820 permanece OPEN. Rollback: revertir el ajuste del schema y los archivos nuevos, sin migración.