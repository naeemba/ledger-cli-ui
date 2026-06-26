CREATE TABLE "manual_price" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text NOT NULL,
	"quote" text NOT NULL,
	"price" real NOT NULL,
	"priced_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "manual_price_unique_per_instant" UNIQUE("user_id","symbol","quote","priced_at")
);
--> statement-breakpoint
ALTER TABLE "manual_price" ADD CONSTRAINT "manual_price_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;