# Guía visual de operación

## 1. Inicio
```text
┌─────────────────────────────────────┐
│ DEL MAR · 9NA          CERRADA 🔒   │
│                                     │
│ Revisar        3                    │
│ Parejas       17/19                 │
│ Cobertura      OK                   │
│ Conciliación   0 diferencias        │
│                                     │
│        [ REVISAR 3 ]                │
└─────────────────────────────────────┘
```
La prioridad es la excepción. Si todo está correcto, el operador no necesita leer el feed completo.

## 2. Centro de operaciones de WhatsApp
```text
20:11  Cierre de carrera       Aceptado
20:12  Plano publicado         Aceptado
20:14  Plano publicado         Duplicado · ignorado
20:14  Llegada 4-9-5-3         Aceptado
20:14  Liquidación publicada   Aceptado
20:14  Disponibles publicados  32 filas
20:15  Cierre de jornada       Aceptado
```

## 3. Excepción
```text
┌ CM · 30k ───────────────────────────┐
│ La respuesta puede corresponder a  │
│ dos ofertas abiertas.              │
│ [ Vincular oferta ]  [ Ignorar ]   │
└─────────────────────────────────────┘
```

## 4. Participante
```text
PACO
Saldo contable        251.550
Comprometido           80.000
Disponible            171.550
Aval                   50.000
------------------------------------
Caballos hoy           +47.500
Parlays hoy                  0
```

## 5. Jornada sin cobertura
La cabecera muestra **Sin conexión**. La aplicación no bloquea captura ni liquidación. Cada cambio queda persistido y se sincroniza al volver Internet.

## 6. Publicación
El antiguo concepto de `BE6` se conserva como un compositor formal: el sistema construye cabecera, carrera, retirados, pizarra, operaciones, resumen y advertencias desde datos estructurados. El operador no corrige números escribiendo directamente en WhatsApp; corrige la fuente y vuelve a publicar.
