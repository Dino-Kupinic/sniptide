CREATE TABLE "account_usage" (
	"owner_id" text PRIMARY KEY,
	"storage_bytes" bigint DEFAULT 0 NOT NULL,
	"paste_count" bigint DEFAULT 0 NOT NULL,
	"file_count" bigint DEFAULT 0 NOT NULL,
	"collection_count" bigint DEFAULT 0 NOT NULL,
	"reconciled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_token_usage_day" (
	"owner_id" text,
	"token_id" uuid,
	"day" integer,
	"requests" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "api_token_usage_day_pkey" PRIMARY KEY("owner_id","day","token_id")
);
--> statement-breakpoint
CREATE INDEX "account_usage_reconciled_idx" ON "account_usage" ("reconciled_at","owner_id");--> statement-breakpoint
ALTER TABLE "account_usage" ADD CONSTRAINT "account_usage_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_token_usage_day" ADD CONSTRAINT "api_token_usage_day_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE FUNCTION initialize_account_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO account_usage (owner_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_usage_insert AFTER INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION initialize_account_usage();
--> statement-breakpoint
CREATE FUNCTION track_paste_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE files bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE account_usage SET paste_count = paste_count + 1,
      storage_bytes = storage_bytes + NEW.bytes WHERE owner_id = NEW.owner_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = OLD.owner_id) THEN RETURN OLD; END IF;
    SELECT count(*) INTO files FROM paste_file WHERE paste_id = OLD.id;
    UPDATE account_usage SET paste_count = paste_count - 1,
      storage_bytes = storage_bytes - OLD.bytes, file_count = file_count - files
      WHERE owner_id = OLD.owner_id;
    RETURN OLD;
  ELSIF OLD.owner_id = NEW.owner_id THEN
    IF OLD.bytes <> NEW.bytes THEN
      UPDATE account_usage SET storage_bytes = storage_bytes + NEW.bytes - OLD.bytes
        WHERE owner_id = NEW.owner_id;
    END IF;
  ELSE
    PERFORM owner_id FROM account_usage WHERE owner_id IN (OLD.owner_id, NEW.owner_id)
      ORDER BY owner_id FOR UPDATE;
    SELECT count(*) INTO files FROM paste_file WHERE paste_id = NEW.id;
    UPDATE account_usage SET paste_count = paste_count - 1,
      storage_bytes = storage_bytes - OLD.bytes, file_count = file_count - files
      WHERE owner_id = OLD.owner_id;
    UPDATE account_usage SET paste_count = paste_count + 1,
      storage_bytes = storage_bytes + NEW.bytes, file_count = file_count + files
      WHERE owner_id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER paste_usage_write AFTER INSERT OR UPDATE OF bytes, owner_id ON paste
FOR EACH ROW EXECUTE FUNCTION track_paste_usage();
--> statement-breakpoint
CREATE TRIGGER paste_usage_delete BEFORE DELETE ON paste
FOR EACH ROW EXECUTE FUNCTION track_paste_usage();
--> statement-breakpoint
CREATE FUNCTION track_file_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_owner text; new_owner text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.paste_id = NEW.paste_id THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN
    SELECT p.owner_id INTO old_owner FROM paste AS p JOIN "user" AS u ON u.id = p.owner_id WHERE p.id = OLD.paste_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT p.owner_id INTO new_owner FROM paste AS p JOIN "user" AS u ON u.id = p.owner_id WHERE p.id = NEW.paste_id;
  END IF;
  PERFORM owner_id FROM account_usage WHERE owner_id IN (old_owner, new_owner)
    ORDER BY owner_id FOR UPDATE;
  IF old_owner IS NOT NULL THEN
    UPDATE account_usage SET file_count = file_count - 1 WHERE owner_id = old_owner;
  END IF;
  IF new_owner IS NOT NULL THEN
    UPDATE account_usage SET file_count = file_count + 1 WHERE owner_id = new_owner;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER file_usage_write AFTER INSERT OR UPDATE OF paste_id OR DELETE ON paste_file
FOR EACH ROW EXECUTE FUNCTION track_file_usage();
--> statement-breakpoint
CREATE FUNCTION track_collection_usage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM "user" WHERE id = OLD.owner_id) THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.owner_id = NEW.owner_id THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM owner_id FROM account_usage WHERE owner_id IN (OLD.owner_id, NEW.owner_id)
      ORDER BY owner_id FOR UPDATE;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE account_usage SET collection_count = collection_count - 1 WHERE owner_id = OLD.owner_id;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    UPDATE account_usage SET collection_count = collection_count + 1 WHERE owner_id = NEW.owner_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER collection_usage_write AFTER INSERT OR UPDATE OF owner_id OR DELETE ON collection
FOR EACH ROW EXECUTE FUNCTION track_collection_usage();
--> statement-breakpoint
INSERT INTO account_usage (owner_id, storage_bytes, paste_count, file_count, collection_count)
SELECT u.id,
  (SELECT coalesce(sum(bytes), 0) FROM paste WHERE owner_id = u.id),
  (SELECT count(*) FROM paste WHERE owner_id = u.id),
  (SELECT count(*) FROM paste_file AS f JOIN paste AS p ON p.id = f.paste_id WHERE p.owner_id = u.id),
  (SELECT count(*) FROM collection WHERE owner_id = u.id)
FROM "user" AS u;
