CREATE TABLE "commodity_price" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"quote" text NOT NULL,
	"price" real NOT NULL,
	"fetched_at" timestamp NOT NULL,
	"fetched_date" text NOT NULL,
	CONSTRAINT "commodity_price_unique_per_day" UNIQUE("symbol","quote","fetched_date")
);
--> statement-breakpoint
CREATE TABLE "price_fetch_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"status" text NOT NULL,
	"symbols_fetched" integer DEFAULT 0 NOT NULL,
	"symbols_failed" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "savedView" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"targetPath" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"draft" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "userSetting" (
	"userId" text PRIMARY KEY NOT NULL,
	"baseCurrency" text,
	"journalMain" text DEFAULT 'main.ledger' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "savedView" ADD CONSTRAINT "savedView_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "userSetting" ADD CONSTRAINT "userSetting_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savedView_user_name" ON "savedView" USING btree ("userId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "template_user_name" ON "template" USING btree ("userId","name");