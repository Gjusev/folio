CREATE TABLE "llm_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'openai' NOT NULL,
	"base_url" text NOT NULL,
	"api_key_enc" text,
	"models" text DEFAULT '' NOT NULL,
	"extra_json" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_routes" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"search_profile" uuid,
	"draft_profile" uuid,
	"embed_profile" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_profiles" ADD CONSTRAINT "llm_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_routes" ADD CONSTRAINT "llm_routes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_routes" ADD CONSTRAINT "llm_routes_search_profile_llm_profiles_id_fk" FOREIGN KEY ("search_profile") REFERENCES "public"."llm_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_routes" ADD CONSTRAINT "llm_routes_draft_profile_llm_profiles_id_fk" FOREIGN KEY ("draft_profile") REFERENCES "public"."llm_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_routes" ADD CONSTRAINT "llm_routes_embed_profile_llm_profiles_id_fk" FOREIGN KEY ("embed_profile") REFERENCES "public"."llm_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_profiles_user_idx" ON "llm_profiles" USING btree ("user_id");