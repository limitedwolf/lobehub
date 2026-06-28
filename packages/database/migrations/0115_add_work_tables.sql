CREATE TABLE IF NOT EXISTS "work_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"version_id" text,
	"role" text NOT NULL,
	"source_type" text NOT NULL,
	"source" text NOT NULL,
	"topic_id" text,
	"thread_id" text,
	"source_message_id" text,
	"display_anchor_assistant_message_id" text,
	"root_operation_id" text,
	"source_tool_call_id" text,
	"actor_agent_id" text,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"work_id" text NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"render_type" text NOT NULL,
	"content_ref_type" text,
	"content_ref" text,
	"snapshot" jsonb NOT NULL,
	"thumbnail" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "works" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"current_version_id" text,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"resource_identifier" text,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_version_id_work_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."work_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_display_anchor_assistant_message_id_messages_id_fk" FOREIGN KEY ("display_anchor_assistant_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_actor_agent_id_agents_id_fk" FOREIGN KEY ("actor_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_contexts" ADD CONSTRAINT "work_contexts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_versions" ADD CONSTRAINT "work_versions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_contexts_work_id_source_tool_call_id_unique" ON "work_contexts" USING btree ("work_id","source_tool_call_id") WHERE "work_contexts"."source_tool_call_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_work_id_idx" ON "work_contexts" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_version_id_idx" ON "work_contexts" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_topic_id_idx" ON "work_contexts" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_thread_id_idx" ON "work_contexts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_source_message_id_idx" ON "work_contexts" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_display_anchor_assistant_message_id_idx" ON "work_contexts" USING btree ("display_anchor_assistant_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_root_operation_id_idx" ON "work_contexts" USING btree ("root_operation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_user_id_idx" ON "work_contexts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_workspace_id_idx" ON "work_contexts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_source_idx" ON "work_contexts" USING btree ("source_type","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_contexts_created_at_idx" ON "work_contexts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "work_versions_work_id_version_unique" ON "work_versions" USING btree ("work_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_versions_work_id_idx" ON "work_versions" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_versions_created_at_idx" ON "work_versions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "works_resource_user_unique" ON "works" USING btree ("resource_type","resource_id","user_id") WHERE "works"."workspace_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "works_resource_workspace_unique" ON "works" USING btree ("workspace_id","resource_type","resource_id") WHERE "works"."workspace_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_user_id_idx" ON "works" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_workspace_id_idx" ON "works" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_resource_idx" ON "works" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_current_version_id_idx" ON "works" USING btree ("current_version_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_updated_at_idx" ON "works" USING btree ("updated_at");
