-- Control Hípico v1.13 RC2 — exactly one active LAB channel for the hosted bridge.
-- Personal/single-owner deployment contract. The official source remains read-only.

create unique index if not exists hipico_single_active_lab_channel_idx
  on public.hipico_bot_channels(group_key)
  where group_key = 'control-hipico-lab'
    and channel_type = 'web_bridge'
    and status = 'active';

insert into public.hipico_bot_channels(owner_id, group_key, label, channel_type, status, config)
select
  owner_id,
  'control-hipico-lab',
  'Control hípico lab',
  'web_bridge',
  'active',
  jsonb_build_object(
    'mode', 'shadow_only',
    'source_send_possible', false,
    'monetary_auto_apply', false,
    'purpose', 'official-source-training-lab'
  )
from public.hipico_workspaces
order by updated_at desc
limit 1
on conflict(owner_id, group_key) do update
set label = excluded.label,
    channel_type = 'web_bridge',
    status = 'active',
    config = excluded.config,
    updated_at = now();
