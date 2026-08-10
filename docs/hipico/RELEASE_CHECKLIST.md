# Release Checklist — Hípico Control

- [ ] Tests de reglas y parser en verde.
- [ ] Replay de jornada real produce resultado determinístico.
- [ ] Importar el mismo chat dos veces no duplica apuestas/eventos.
- [ ] Corte de red durante captura no pierde datos.
- [ ] Reconexión no duplica cambios ni respuestas.
- [ ] Cierre bloquea operaciones tardías de la carrera cerrada.
- [ ] Llegada `LLEGADA 9NA 4-9-5-3 DM` produce `4.9.5.3` y no confunde `9NA` con la pizarra.
- [ ] Liquidación coincide con casos del Archivo GC.
- [ ] Disponibles publicados se reconcilian contra el ledger.
- [ ] PWA instala bajo `/hipico-control/` y abre offline después de la primera carga.
- [ ] Android usa los mismos assets/build del frontend aprobado.
- [ ] No aparecen `QA`, `TEST`, `demo`, `modo local` o datos ficticios en UI de producción.
- [ ] Secretos Meta/Supabase Service Role no están en JS público ni Git.
- [ ] Webhook rechaza firma inválida.
- [ ] Outbox no envía dos veces la misma respuesta.
- [ ] Backup/restore probado antes de actualizar APK.
- [ ] Dispositivo Android físico aprobado antes de marcar release estable.
