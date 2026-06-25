CREATE TABLE "cryptoPasskeyWrap" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"credentialId" text NOT NULL,
	"prfSalt" text NOT NULL,
	"wrap" text NOT NULL,
	"label" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cryptoPasskeyWrap_user_cred" UNIQUE("userId","credentialId")
);
--> statement-breakpoint
ALTER TABLE "cryptoPasskeyWrap" ADD CONSTRAINT "cryptoPasskeyWrap_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;