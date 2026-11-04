-- Keep validation and repair stable while older app instances still serve traffic.
LOCK TABLE "paste", "collection", "account" IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM account GROUP BY provider_id, account_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate provider account identities prevent the ownership integrity migration'
      USING HINT = 'Inspect account rows grouped by provider_id and account_id. Resolve duplicate ownership before retrying; do not automatically merge users.';
  END IF;
END $$;
--> statement-breakpoint
UPDATE paste AS p SET collection = NULL, version = p.version + 1
WHERE p.collection IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM collection AS c WHERE c.owner_id = p.owner_id AND c.slug = p.collection
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_identity_unique" ON "account" ("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "paste" ADD CONSTRAINT "paste_owner_collection_fkey" FOREIGN KEY ("owner_id","collection") REFERENCES "collection"("owner_id","slug");
