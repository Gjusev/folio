ALTER TABLE "files" ADD COLUMN "data" "bytea";--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "size" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "files" SET "size" = octet_length("content");