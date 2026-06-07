-- LOBE-10056 Phase 5: finalize the ai_infra surrogate `_id` primary key and the
-- workspace-scoped partial unique indexes for ai_providers / ai_models.
--
-- On cloud production this whole migration is a NO-OP: the manual steps
-- [3]~[7] (LOBE-10073 .. LOBE-10077) already performed the backfill, NOT NULL,
-- PK swap and partial indexes online / CONCURRENTLY. Every statement below is
-- guarded (UPDATE … WHERE _id IS NULL / IF EXISTS / catalog check / IF NOT
-- EXISTS) so it skips cleanly there, while still fully rebuilding the schema on
-- a fresh or self-hosted database (where [3]~[7] never ran).

-- 1) backfill rows still missing _id (no-op on prod; fills self-host history) --
UPDATE "ai_providers" SET "_id" = gen_random_uuid() WHERE "_id" IS NULL;--> statement-breakpoint
UPDATE "ai_models" SET "_id" = gen_random_uuid() WHERE "_id" IS NULL;--> statement-breakpoint

-- 2) enforce NOT NULL (no-op if already set) --
ALTER TABLE "ai_providers" ALTER COLUMN "_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_models" ALTER COLUMN "_id" SET NOT NULL;--> statement-breakpoint

-- 3) drop old composite PKs (no-op on prod, already dropped in [7]) --
ALTER TABLE "ai_providers" DROP CONSTRAINT IF EXISTS "ai_providers_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "ai_models" DROP CONSTRAINT IF EXISTS "ai_models_id_provider_id_user_id_pk";--> statement-breakpoint

-- 4) promote _id to PK only when the table has no PK yet
--    (Postgres has no `ADD PRIMARY KEY IF NOT EXISTS`; guard via pg_constraint) --
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'ai_providers'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("_id");
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'ai_models'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_pkey" PRIMARY KEY ("_id");
  END IF;
END $$;--> statement-breakpoint

-- 5) workspace-scoped partial unique indexes (no-op on prod, already built in [6]) --
CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_id_user_id_unique" ON "ai_providers" USING btree ("id","user_id") WHERE "workspace_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_providers_id_user_id_workspace_id_unique" ON "ai_providers" USING btree ("id","user_id","workspace_id") WHERE "workspace_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_id_provider_id_user_id_unique" ON "ai_models" USING btree ("id","provider_id","user_id") WHERE "workspace_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_id_provider_id_user_id_workspace_id_unique" ON "ai_models" USING btree ("id","provider_id","user_id","workspace_id") WHERE "workspace_id" IS NOT NULL;
