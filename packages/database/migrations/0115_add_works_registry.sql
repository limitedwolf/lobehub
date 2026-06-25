CREATE TABLE IF NOT EXISTS "works" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"content_ref_id" text NOT NULL,
	"content_ref_identifier" text,
	"content_ref_type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_identifier" text NOT NULL,
	"agent_id" text,
	"topic_id" text,
	"thread_id" text,
	"message_id" text,
	"operation_id" text,
	"tool_call_id" text,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT IF EXISTS "works_agent_id_agents_id_fk";--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT IF EXISTS "works_topic_id_topics_id_fk";--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT IF EXISTS "works_thread_id_threads_id_fk";--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT IF EXISTS "works_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" DROP CONSTRAINT IF EXISTS "works_workspace_id_workspaces_id_fk";--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "works_content_ref_user_unique" ON "works" USING btree ("user_id","content_ref_type","content_ref_id") WHERE "works"."workspace_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "works_content_ref_workspace_unique" ON "works" USING btree ("workspace_id","content_ref_type","content_ref_id") WHERE "works"."workspace_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_tool_call_content_ref_idx" ON "works" USING btree ("tool_call_id","content_ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_user_id_idx" ON "works" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_workspace_id_idx" ON "works" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_agent_id_idx" ON "works" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_topic_id_idx" ON "works" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_thread_id_idx" ON "works" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_content_ref_idx" ON "works" USING btree ("content_ref_type","content_ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_source_idx" ON "works" USING btree ("source_type","source_identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_updated_at_idx" ON "works" USING btree ("updated_at");
