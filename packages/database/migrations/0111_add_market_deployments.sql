CREATE TABLE IF NOT EXISTS "market_deployment_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text DEFAULT 'htmlArtifact' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"scope_type" text DEFAULT 'message' NOT NULL,
	"topic_id" text,
	"title" text,
	"description" text,
	"metadata" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_deployment_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"route_id" text NOT NULL,
	"source_id" text NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'cloudflareR2Worker' NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"r2_bucket" text,
	"r2_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"content_type" text DEFAULT 'text/html; charset=utf-8' NOT NULL,
	"size_bytes" integer NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unpublished_at" timestamp with time zone,
	"error_message" text,
	"metadata" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_deployment_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"route_type" text DEFAULT 'path' NOT NULL,
	"base_url" text NOT NULL,
	"path" text,
	"domain" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_deployment_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text DEFAULT 'htmlArtifact' NOT NULL,
	"topic_id" text,
	"message_id" text,
	"artifact_identifier" text,
	"version_ref" text,
	"metadata" jsonb,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_deployment_projects" DROP CONSTRAINT IF EXISTS "market_deployment_projects_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_projects" ADD CONSTRAINT "market_deployment_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_projects" DROP CONSTRAINT IF EXISTS "market_deployment_projects_topic_id_topics_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_projects" ADD CONSTRAINT "market_deployment_projects_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_releases" DROP CONSTRAINT IF EXISTS "market_deployment_releases_project_id_market_deployment_projects_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_releases" ADD CONSTRAINT "market_deployment_releases_project_id_market_deployment_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."market_deployment_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_releases" DROP CONSTRAINT IF EXISTS "market_deployment_releases_route_id_market_deployment_routes_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_releases" ADD CONSTRAINT "market_deployment_releases_route_id_market_deployment_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."market_deployment_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_releases" DROP CONSTRAINT IF EXISTS "market_deployment_releases_source_id_market_deployment_sources_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_releases" ADD CONSTRAINT "market_deployment_releases_source_id_market_deployment_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."market_deployment_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_releases" DROP CONSTRAINT IF EXISTS "market_deployment_releases_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_releases" ADD CONSTRAINT "market_deployment_releases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_routes" DROP CONSTRAINT IF EXISTS "market_deployment_routes_project_id_market_deployment_projects_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_routes" ADD CONSTRAINT "market_deployment_routes_project_id_market_deployment_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."market_deployment_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_routes" DROP CONSTRAINT IF EXISTS "market_deployment_routes_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_routes" ADD CONSTRAINT "market_deployment_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_sources" DROP CONSTRAINT IF EXISTS "market_deployment_sources_project_id_market_deployment_projects_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_sources" ADD CONSTRAINT "market_deployment_sources_project_id_market_deployment_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."market_deployment_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_sources" DROP CONSTRAINT IF EXISTS "market_deployment_sources_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_sources" ADD CONSTRAINT "market_deployment_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_sources" DROP CONSTRAINT IF EXISTS "market_deployment_sources_topic_id_topics_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_sources" ADD CONSTRAINT "market_deployment_sources_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_deployment_sources" DROP CONSTRAINT IF EXISTS "market_deployment_sources_message_id_messages_id_fk";--> statement-breakpoint
ALTER TABLE "market_deployment_sources" ADD CONSTRAINT "market_deployment_sources_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_projects_user_id_idx" ON "market_deployment_projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_projects_topic_id_idx" ON "market_deployment_projects" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_projects_kind_idx" ON "market_deployment_projects" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_releases_project_id_idx" ON "market_deployment_releases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_releases_route_id_idx" ON "market_deployment_releases" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_releases_source_id_idx" ON "market_deployment_releases" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_releases_user_id_idx" ON "market_deployment_releases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_releases_status_idx" ON "market_deployment_releases" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_releases_published_at_idx" ON "market_deployment_releases" USING btree ("published_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_deployment_routes_base_url_path_unique" ON "market_deployment_routes" USING btree ("base_url","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_routes_project_id_idx" ON "market_deployment_routes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_routes_user_id_idx" ON "market_deployment_routes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_routes_status_idx" ON "market_deployment_routes" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "market_deployment_sources_html_artifact_unique" ON "market_deployment_sources" USING btree ("user_id","source_type","message_id","artifact_identifier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_sources_project_id_idx" ON "market_deployment_sources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_sources_user_id_idx" ON "market_deployment_sources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_deployment_sources_topic_id_idx" ON "market_deployment_sources" USING btree ("topic_id");