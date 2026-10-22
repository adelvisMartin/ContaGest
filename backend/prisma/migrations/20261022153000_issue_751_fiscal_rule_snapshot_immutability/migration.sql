-- #751 historical fiscal rule snapshot preservation, forward-only.
-- Do not update/delete snapshots when later legal sources or rates change.
-- Existing records are retained; no statutory rates or production data writes.
CREATE FUNCTION public.contagest_751_fiscal_rule_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'FISCAL_RULE_SNAPSHOT_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER contagest_751_fiscal_rule_snapshot_immutable
  BEFORE UPDATE OR DELETE ON public."FiscalDocumentRuleSnapshot"
  FOR EACH ROW EXECUTE FUNCTION public.contagest_751_fiscal_rule_snapshot_immutable();
