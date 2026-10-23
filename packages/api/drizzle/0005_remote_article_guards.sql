ALTER TABLE "articles" ADD COLUMN "revision" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "first_published_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "articles" SET "first_published_at" = "published_at" WHERE "status" = 'published';
--> statement-breakpoint
CREATE TABLE "article_operations" (
 "id" uuid PRIMARY KEY NOT NULL,
 "owner_id" text NOT NULL,
 "kind" text NOT NULL,
 "fingerprint" text,
 "result" jsonb,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cli_asset_uploads" (
 "id" uuid PRIMARY KEY NOT NULL,
 "operation_id" uuid NOT NULL CONSTRAINT "cli_asset_uploads_operation_id_article_operations_id_fk" REFERENCES "article_operations"("id"),
 "asset_id" uuid NOT NULL CONSTRAINT "cli_asset_uploads_asset_id_assets_id_fk" REFERENCES "assets"("id"),
 "fingerprint" text NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cli_asset_uploads_created_at_idx" ON "cli_asset_uploads" ("created_at");
