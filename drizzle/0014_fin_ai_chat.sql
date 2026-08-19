-- Fin AI chat: the only two tables the in-app advisor writes to.
-- Financial tables stay read-only for the chat by design.

CREATE TABLE IF NOT EXISTS "fin_ai_chat_usage" (
	"user_id" varchar(255) NOT NULL,
	"day" varchar(10) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_ai_chat_usage_pkey" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_ai_chat_usage_user_idx" ON "fin_ai_chat_usage" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_ai_digest_cache" (
	"user_id" varchar(255) PRIMARY KEY NOT NULL,
	"fingerprint" varchar(32) NOT NULL,
	"window_start" varchar(10) NOT NULL,
	"digest" text NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"compression_tier" smallint DEFAULT 0 NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
