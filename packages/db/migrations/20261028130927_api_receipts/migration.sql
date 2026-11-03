CREATE TABLE "api_receipt" (
	"token_id" uuid,
	"key" text,
	"fingerprint" text NOT NULL,
	"response" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "api_receipt_pkey" PRIMARY KEY("token_id","key")
);
--> statement-breakpoint
CREATE INDEX "api_receipt_expiry_idx" ON "api_receipt" ("expires_at");--> statement-breakpoint
ALTER TABLE "api_receipt" ADD CONSTRAINT "api_receipt_token_id_api_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "api_token"("id") ON DELETE CASCADE;