CREATE TABLE "safety_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"paste_id" uuid,
	"user_id" text,
	"actor" text NOT NULL,
	"case_reference" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "legal_hold_case" uuid;--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "legal_hold_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "safety_event_paste_idx" ON "safety_event" ("paste_id","created_at");--> statement-breakpoint
CREATE INDEX "safety_event_user_idx" ON "safety_event" ("user_id","created_at");--> statement-breakpoint
-- A paste under a legal hold can't be deleted by any path: the purge job, the trash, account
-- deletion's cascade or plain SQL. The host `release-hold` command clears the hold first.
CREATE FUNCTION paste_legal_hold_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'paste is under a legal hold' USING ERRCODE = 'restrict_violation';
END $$;
--> statement-breakpoint
CREATE TRIGGER paste_legal_hold_guard BEFORE DELETE ON "paste"
  FOR EACH ROW WHEN (OLD.legal_hold_case IS NOT NULL) EXECUTE FUNCTION paste_legal_hold_guard();
--> statement-breakpoint
-- The safety record is append-only. It outlives the pastes and accounts it names, and only a
-- maintenance transaction that sets sniptide.safety_event_purge deletes from it.
CREATE FUNCTION safety_event_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sniptide.safety_event_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'safety_event is append-only' USING ERRCODE = 'restrict_violation';
END $$;
--> statement-breakpoint
CREATE TRIGGER safety_event_append_only BEFORE UPDATE OR DELETE ON "safety_event"
  FOR EACH ROW EXECUTE FUNCTION safety_event_append_only();
