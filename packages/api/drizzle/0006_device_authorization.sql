CREATE TYPE "public"."device_authorization_status" AS ENUM('pending', 'approved', 'denied', 'consumed');
--> statement-breakpoint
CREATE TABLE "device_authorizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "device_code_hash" text NOT NULL,
  "user_code_hash" text NOT NULL,
  "name" text NOT NULL,
  "status" "device_authorization_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "next_poll_at" timestamp with time zone NOT NULL,
  "interval_seconds" integer DEFAULT 5 NOT NULL,
  CONSTRAINT "device_authorizations_device_code_hash_unique" UNIQUE ("device_code_hash"),
  CONSTRAINT "device_authorizations_user_code_hash_unique" UNIQUE ("user_code_hash"),
  CONSTRAINT "device_poll_interval_positive" CHECK ("interval_seconds" > 0)
);
--> statement-breakpoint
CREATE INDEX "device_authorizations_expires_at_idx" ON "device_authorizations" ("expires_at");
--> statement-breakpoint
CREATE TABLE "device_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "device_sessions_token_hash_unique" UNIQUE ("token_hash")
);
--> statement-breakpoint
CREATE INDEX "device_sessions_expires_at_idx" ON "device_sessions" ("expires_at");
