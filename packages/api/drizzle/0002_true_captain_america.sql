CREATE TYPE "public"."article_language" AS ENUM('zh', 'en');--> statement-breakpoint
ALTER TABLE "categories" RENAME TO "topics";--> statement-breakpoint
ALTER TABLE "articles" RENAME COLUMN "excerpt" TO "description";--> statement-breakpoint
ALTER TABLE "articles" RENAME COLUMN "category_id" TO "topic_id";--> statement-breakpoint
ALTER TABLE "articles" RENAME COLUMN "image_url" TO "cover_url";--> statement-breakpoint
ALTER TABLE "articles" RENAME COLUMN "created_at" TO "record_created_at";--> statement-breakpoint
ALTER TABLE "topics" RENAME CONSTRAINT "categories_name_unique" TO "topics_name_unique";--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT "articles_category_id_categories_id_fk";--> statement-breakpoint
DROP INDEX "articles_category_id_idx";--> statement-breakpoint

-- Keep only draft/published as article states. Historical scheduled entries
-- become drafts; historical trashed entries are represented by deleted_at.
ALTER TABLE "articles" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."article_status" RENAME TO "article_status_legacy";--> statement-breakpoint
CREATE TYPE "public"."article_status" AS ENUM('draft', 'published');--> statement-breakpoint
UPDATE "articles" SET "deleted_at" = now() WHERE "status"::text = 'trashed';--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" TYPE "public"."article_status" USING (
  CASE
    WHEN "status"::text = 'published' THEN 'published'::"public"."article_status"
    ELSE 'draft'::"public"."article_status"
  END
);--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."article_status";--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
DROP TYPE "public"."article_status_legacy";--> statement-breakpoint

-- Blog content always has published_at. Backfill legacy local records from
-- their record creation time before making the column required.
UPDATE "articles" SET "published_at" = "record_created_at" WHERE "published_at" IS NULL;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "published_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "published_at" SET NOT NULL;--> statement-breakpoint

-- updatedAt is author-facing content metadata and may be absent.
ALTER TABLE "articles" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "articles" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "language" "article_language" DEFAULT 'zh' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "cover_alt" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "record_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_topic_id_idx" ON "articles" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "articles" DROP COLUMN "has_unpublished_changes";
