CREATE TABLE "userCrypto" (
	"userId" text PRIMARY KEY NOT NULL,
	"wrapPassphrase" text NOT NULL,
	"passSalt" text NOT NULL,
	"argonParams" jsonb NOT NULL,
	"wrapRecovery" text NOT NULL,
	"recoveryCreatedAt" timestamp DEFAULT now() NOT NULL,
	"kdfVersion" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "userCrypto" ADD CONSTRAINT "userCrypto_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;