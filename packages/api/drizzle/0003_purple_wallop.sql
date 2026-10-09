CREATE TYPE "public"."article_clip_type" AS ENUM('article', 'selection', 'bookmark', 'screenshot', 'simplified', 'full_page', 'pdf', 'email');--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "source_site_name" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "source_site_icon_url" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "source_published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "clip_type" "article_clip_type";--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "word_count" integer;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "reading_time_minutes" integer;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "source_checksum" text;