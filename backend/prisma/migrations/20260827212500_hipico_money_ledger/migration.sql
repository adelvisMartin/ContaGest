-- #108 Control Hípico exact, append-only money ledger.

CREATE TABLE IF NOT EXISTS public.hipico_money_accounts (
  owner_id UUID NOT NULL,
  group_key TEXT NOT NULL,
  participant_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance_minor NUMERIC(30,0) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, group_key, participant_code, currency)
);

CREATE TABLE IF NOT EXISTS public.hipico_money_ledger_entries (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL,
  group_key TEXT NOT NULL,
  participant_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('bet','settlement','adjustment','reversal')),
  amount_minor NUMERIC(30,0) NOT NULL,
  race_key TEXT,
  settlement_of_key TEXT,
  source_event_id TEXT,
  source_message_key TEXT,
  idempotency_key TEXT NOT NULL,
  original_entry_id TEXT REFERENCES public.hipico_money_ledger_entries(id) ON DELETE RESTRICT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, group_key, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS hipico_money_single_settlement_idx
  ON public.hipico_money_ledger_entries(owner_id, group_key, participant_code, currency, settlement_of_key)
  WHERE entry_type='settlement' AND settlement_of_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hipico_money_single_reversal_idx
  ON public.hipico_money_ledger_entries(original_entry_id)
  WHERE entry_type='reversal' AND original_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS hipico_money_participant_history_idx
  ON public.hipico_money_ledger_entries(owner_id, group_key, participant_code, currency, created_at);
CREATE INDEX IF NOT EXISTS hipico_money_race_idx
  ON public.hipico_money_ledger_entries(owner_id, group_key, race_key, created_at)
  WHERE race_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hipico_money_ledger_immutable_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'HIPICO_MONEY_LEDGER_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS hipico_money_ledger_immutable ON public.hipico_money_ledger_entries;
CREATE TRIGGER hipico_money_ledger_immutable
BEFORE UPDATE OR DELETE ON public.hipico_money_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.hipico_money_ledger_immutable_guard();
