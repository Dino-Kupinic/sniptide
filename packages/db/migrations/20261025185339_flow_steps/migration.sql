ALTER TABLE "paste" ADD COLUMN "collection_position" integer;--> statement-breakpoint
ALTER TABLE "paste" ADD COLUMN "step_instruction" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE FUNCTION paste_collection_moved() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.collection IS DISTINCT FROM OLD.collection THEN
    NEW.collection_position := NULL;
    NEW.step_instruction := '';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER paste_collection_moved BEFORE UPDATE OF collection ON paste FOR EACH ROW EXECUTE FUNCTION paste_collection_moved();
