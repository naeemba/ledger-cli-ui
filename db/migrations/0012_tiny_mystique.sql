CREATE TABLE "commodity_mapping" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"kind" text NOT NULL,
	"provider_id" text,
	"source" text DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "commodity_mapping_unique_per_symbol" UNIQUE("user_id","symbol")
);
--> statement-breakpoint
ALTER TABLE "commodity_mapping" ADD CONSTRAINT "commodity_mapping_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;