INSERT INTO "article_tags" ("article_id", "tag_id", "created_at")
SELECT "at"."article_id", "keep"."id", "at"."created_at"
FROM "article_tags" "at"
JOIN "tags" "dup" ON "at"."tag_id" = "dup"."id"
JOIN (
  SELECT DISTINCT ON (lower("name")) "id", lower("name") AS "lower_name"
  FROM "tags"
  ORDER BY lower("name"), "created_at", "id"
) "keep" ON lower("dup"."name") = "keep"."lower_name"
WHERE "dup"."id" <> "keep"."id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "article_tags"
WHERE "tag_id" IN (
  SELECT "id" FROM "tags"
  WHERE "id" NOT IN (
    SELECT DISTINCT ON (lower("name")) "id" FROM "tags" ORDER BY lower("name"), "created_at", "id"
  )
);--> statement-breakpoint
DELETE FROM "tags"
WHERE "id" NOT IN (
  SELECT DISTINCT ON (lower("name")) "id" FROM "tags" ORDER BY lower("name"), "created_at", "id"
);--> statement-breakpoint
UPDATE "articles" "a"
SET "topic_id" = "keep"."id"
FROM "topics" "dup"
JOIN (
  SELECT DISTINCT ON (lower("name")) "id", lower("name") AS "lower_name"
  FROM "topics"
  ORDER BY lower("name"), "created_at", "id"
) "keep" ON lower("dup"."name") = "keep"."lower_name"
WHERE "a"."topic_id" = "dup"."id" AND "dup"."id" <> "keep"."id";--> statement-breakpoint
DELETE FROM "topics"
WHERE "id" NOT IN (
  SELECT DISTINCT ON (lower("name")) "id" FROM "topics" ORDER BY lower("name"), "created_at", "id"
);--> statement-breakpoint
ALTER TABLE "articles" DROP CONSTRAINT "articles_slug_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_name_unique";--> statement-breakpoint
ALTER TABLE "topics" DROP CONSTRAINT "topics_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "articles_slug_active_unique" ON "articles" USING btree ("slug") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "tags_name_lower_unique" ON "tags" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "topics_name_lower_unique" ON "topics" USING btree (lower("name"));
