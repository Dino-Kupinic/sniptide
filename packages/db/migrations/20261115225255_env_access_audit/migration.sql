CREATE TABLE "env_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"group_slug" text NOT NULL,
	"action" text NOT NULL,
	"via" text NOT NULL,
	"actor_id" text,
	"actor" text,
	"detail" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "env_member" (
	"group_id" uuid,
	"user_id" text,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "env_member_pkey" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "env_audit_owner_idx" ON "env_audit" ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "env_audit_group_idx" ON "env_audit" ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "env_member_user_idx" ON "env_member" ("user_id");--> statement-breakpoint
ALTER TABLE "env_audit" ADD CONSTRAINT "env_audit_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "env_member" ADD CONSTRAINT "env_member_group_id_env_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "env_group"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "env_member" ADD CONSTRAINT "env_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- The audit log is append-only. An entry never changes, and it is deleted only with the account
-- that owns it or by a maintenance transaction that sets sniptide.env_audit_purge.
CREATE FUNCTION env_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND (
    current_setting('sniptide.env_audit_purge', true) = 'on'
    OR NOT EXISTS (SELECT 1 FROM "user" WHERE id = OLD.owner_id)
  ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'env_audit is append-only' USING ERRCODE = 'restrict_violation';
END $$;
--> statement-breakpoint
CREATE TRIGGER env_audit_append_only BEFORE UPDATE OR DELETE ON "env_audit"
FOR EACH ROW EXECUTE FUNCTION env_audit_append_only();
