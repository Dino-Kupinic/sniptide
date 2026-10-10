CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "paste_collection_idx" ON "paste" ("owner_id","collection","updated_at","id");--> statement-breakpoint
CREATE INDEX "paste_deleted_idx" ON "paste" ("deleted_at");--> statement-breakpoint
CREATE INDEX "paste_expired_idx" ON "paste" ("expires_at");--> statement-breakpoint
CREATE INDEX "paste_title_search_idx" ON "paste" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "paste_slug_search_idx" ON "paste" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "paste_star_paste_idx" ON "paste_star" ("paste_id");--> statement-breakpoint
CREATE INDEX "paste_view_day_retention_idx" ON "paste_view_day" ("day","paste_id");--> statement-breakpoint
CREATE INDEX "auth_rate_limit_window_idx" ON "auth_rate_limit" ("last_request");--> statement-breakpoint
CREATE INDEX "rate_limit_window_idx" ON "rate_limit" ("window_start");
--> statement-breakpoint
UPDATE paste SET bytes = totals.bytes FROM (SELECT paste_id, sum(octet_length(content))::int AS bytes FROM paste_file GROUP BY paste_id) totals WHERE paste.id = totals.paste_id;
--> statement-breakpoint
CREATE FUNCTION sync_paste_bytes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.paste_id ELSE NEW.paste_id END;
  UPDATE paste SET bytes = (SELECT coalesce(sum(octet_length(content)), 0)::int FROM paste_file WHERE paste_id = target) WHERE id = target;
  IF TG_OP = 'UPDATE' AND OLD.paste_id <> NEW.paste_id THEN
    UPDATE paste SET bytes = (SELECT coalesce(sum(octet_length(content)), 0)::int FROM paste_file WHERE paste_id = OLD.paste_id) WHERE id = OLD.paste_id;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER paste_file_bytes AFTER INSERT OR UPDATE OR DELETE ON paste_file FOR EACH ROW EXECUTE FUNCTION sync_paste_bytes();
