ALTER TABLE "paste" ADD COLUMN "first_language" text;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION sync_paste_bytes() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; previous uuid;
BEGIN
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.paste_id ELSE NEW.paste_id END;
  previous := CASE WHEN TG_OP = 'UPDATE' THEN OLD.paste_id ELSE target END;
  PERFORM id FROM paste WHERE id IN (target, previous) ORDER BY id FOR NO KEY UPDATE;
  UPDATE paste SET
    bytes = (SELECT coalesce(sum(octet_length(content)), 0)::int FROM paste_file WHERE paste_id = target),
    first_language = (SELECT language FROM paste_file WHERE paste_id = target ORDER BY position, id LIMIT 1)
  WHERE id = target;
  IF previous <> target THEN
    UPDATE paste SET
      bytes = (SELECT coalesce(sum(octet_length(content)), 0)::int FROM paste_file WHERE paste_id = previous),
      first_language = (SELECT language FROM paste_file WHERE paste_id = previous ORDER BY position, id LIMIT 1)
    WHERE id = previous;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
UPDATE paste SET
  bytes = (SELECT coalesce(sum(octet_length(content)), 0)::int FROM paste_file WHERE paste_id = paste.id),
  first_language = (SELECT language FROM paste_file WHERE paste_id = paste.id ORDER BY position, id LIMIT 1);
