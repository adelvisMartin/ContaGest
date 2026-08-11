-- Hípico Control v1.12 — Group bridge channel type.
-- Additive and safe: expands the allowed channel types without changing existing rows.

alter table public.hipico_bot_channels
  drop constraint if exists hipico_bot_channels_channel_type_check;

alter table public.hipico_bot_channels
  add constraint hipico_bot_channels_channel_type_check
  check (channel_type in ('manual_export','android_share','meta_direct','meta_group','web_bridge'));
