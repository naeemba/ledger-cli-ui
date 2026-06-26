DROP INDEX "auditLog_user_createdAt";--> statement-breakpoint
CREATE INDEX "auditLog_user_id" ON "auditLog" USING btree ("userId","id" DESC NULLS LAST);