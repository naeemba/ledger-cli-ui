CREATE TABLE "encryptionResetChallenge" (
	"userId" text PRIMARY KEY NOT NULL,
	"codeHash" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encryptionResetChallenge" ADD CONSTRAINT "encryptionResetChallenge_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;