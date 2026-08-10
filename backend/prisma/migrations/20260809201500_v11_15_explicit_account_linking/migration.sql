-- Equal email text is not proof that two tenant profiles are the same person.
-- Remove the original global email uniqueness and split legacy multi-tenant groupings.
ALTER TABLE public."AccountUser" DROP CONSTRAINT IF EXISTS "AccountUser_email_key";
ALTER TABLE public."AccountUser" DROP CONSTRAINT IF EXISTS "AccountUser_email_unique";
DROP INDEX IF EXISTS public."AccountUser_email_key";
DROP INDEX IF EXISTS public."AccountUser_email_unique";
CREATE INDEX IF NOT EXISTS "AccountUser_email_lookup_idx" ON public."AccountUser" (lower("email"));

ALTER TABLE public."TenantMembership"
  ADD COLUMN IF NOT EXISTS "linkSource" text NOT NULL DEFAULT 'self',
  ADD COLUMN IF NOT EXISTS "linkedAt" timestamptz NOT NULL DEFAULT now();

-- The initial v11.15 backfill grouped equal emails. Equal text is not sufficient proof of
-- identity across tenants, so split every pre-existing multi-tenant grouping. Future links
-- are created explicitly by the platform subscription provisioner.
DO $$
DECLARE
  r record;
  new_account_id text;
BEGIN
  FOR r IN
    SELECT tm."id" AS membership_id, tm."accountUserId", tm."tenantId", tm."userProfileId",
           au."email", au."fullName", au."status",
           row_number() OVER (PARTITION BY tm."accountUserId" ORDER BY tm."isDefault" DESC, tm."createdAt" ASC, tm."id") AS rn
    FROM public."TenantMembership" tm
    JOIN public."AccountUser" au ON au."id"=tm."accountUserId"
  LOOP
    IF r.rn > 1 THEN
      new_account_id := gen_random_uuid()::text;
      INSERT INTO public."AccountUser" ("id","email","fullName","status","createdAt","updatedAt")
      VALUES (new_account_id,r."email",r."fullName",r."status",now(),now());
      UPDATE public."TenantMembership"
      SET "accountUserId"=new_account_id,"linkSource"='migration-split',"linkedAt"=now(),"updatedAt"=now()
      WHERE "id"=r.membership_id;
    ELSE
      UPDATE public."TenantMembership"
      SET "linkSource"=COALESCE(NULLIF("linkSource",''),'self'),"linkedAt"=COALESCE("linkedAt",now()),"updatedAt"=now()
      WHERE "id"=r.membership_id;
    END IF;
  END LOOP;
END $$;
