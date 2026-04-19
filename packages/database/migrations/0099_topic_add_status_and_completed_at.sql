ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "status" text;--> statement-breakpoint
ALTER TABLE "topics" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_status_idx" ON "topics" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topics_user_id_completed_at_idx" ON "topics" USING btree ("user_id","completed_at");
