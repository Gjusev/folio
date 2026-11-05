CREATE TABLE "library_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"size" integer NOT NULL,
	"pages" integer,
	"data" "bytea" NOT NULL,
	"full_text" text,
	"doi" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_project_links" (
	"paper_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_project_links_paper_id_project_id_pk" PRIMARY KEY("paper_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "library_papers" ADD CONSTRAINT "library_papers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_project_links" ADD CONSTRAINT "library_project_links_paper_id_library_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."library_papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_project_links" ADD CONSTRAINT "library_project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "library_papers_user_idx" ON "library_papers" USING btree ("user_id","created_at");