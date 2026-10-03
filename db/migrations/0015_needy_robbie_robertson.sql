CREATE TABLE "debtShare" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"sealedMeta" text NOT NULL,
	"sealedPage" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debtShare" ADD CONSTRAINT "debtShare_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debtShare_userId" ON "debtShare" USING btree ("userId");