CREATE OR REPLACE FUNCTION private.enforce_subscription_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limit integer;
  v_distinct_users integer;
  v_existing_same_email integer;
BEGIN
  IF NEW."subscriptionId" IS NULL OR NEW."status" <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT "maxUsers" INTO v_limit
  FROM public."Subscription"
  WHERE "id" = NEW."subscriptionId";

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'subscription_not_found';
  END IF;

  SELECT count(DISTINCT lower("userEmail"))::int
    INTO v_distinct_users
  FROM public."LicenseKey"
  WHERE "subscriptionId" = NEW."subscriptionId"
    AND "status" = 'active'
    AND "id" <> NEW."id";

  SELECT count(*)::int
    INTO v_existing_same_email
  FROM public."LicenseKey"
  WHERE "subscriptionId" = NEW."subscriptionId"
    AND "status" = 'active'
    AND lower("userEmail") = lower(NEW."userEmail")
    AND "id" <> NEW."id";

  IF v_existing_same_email = 0 AND v_distinct_users >= v_limit THEN
    RAISE EXCEPTION 'subscription_user_limit_reached';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_user_limit ON public."LicenseKey";
CREATE TRIGGER trg_subscription_user_limit
BEFORE INSERT OR UPDATE OF "subscriptionId", "status", "userEmail"
ON public."LicenseKey"
FOR EACH ROW EXECUTE FUNCTION private.enforce_subscription_user_limit();
