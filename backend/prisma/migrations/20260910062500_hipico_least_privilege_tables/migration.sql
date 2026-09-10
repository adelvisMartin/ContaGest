-- Control Hípico least-privilege table grants.
-- Browser clients use authenticated RPCs; direct table fallbacks are disabled in production.

REVOKE ALL PRIVILEGES ON TABLE public."HipicoBotOutbox" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."HipicoWebhookEvent" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_audit_events FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_bot_channels FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_ledger_entries FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_messages FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_operation_events FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_outbox FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_profiles FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_reconciliations FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_shadow_evaluations FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_users FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.hipico_workspaces FROM anon, authenticated;

-- hipico_get_my_access() is SECURITY INVOKER and intentionally reads this table.
GRANT SELECT ON TABLE public.hipico_users TO authenticated;
