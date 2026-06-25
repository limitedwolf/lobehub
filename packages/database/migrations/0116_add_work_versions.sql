CREATE TABLE IF NOT EXISTS "work_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"source_type" text NOT NULL,
	"source_identifier" text NOT NULL,
	"message_id" text,
	"operation_id" text,
	"tool_call_id" text,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_versions" DROP CONSTRAINT IF EXISTS "work_versions_work_id_works_id_fk";--> statement-breakpoint
ALTER TABLE "work_versions" ADD CONSTRAINT "work_versions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_versions" DROP CONSTRAINT IF EXISTS "work_versions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "work_versions" ADD CONSTRAINT "work_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_versions" DROP CONSTRAINT IF EXISTS "work_versions_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "work_versions" ADD CONSTRAINT "work_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_versions_work_id_version_unique" ON "work_versions" USING btree ("work_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_versions_work_id_tool_call_unique" ON "work_versions" USING btree ("work_id","tool_call_id") WHERE "work_versions"."tool_call_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_versions_work_id_idx" ON "work_versions" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_versions_user_id_idx" ON "work_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_versions_workspace_id_idx" ON "work_versions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_versions_created_at_idx" ON "work_versions" USING btree ("created_at");
